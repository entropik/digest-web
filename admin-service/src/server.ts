import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { auth, getAdminSession, type AdminSession } from "./auth.js";
import {
  adminCss,
  adminJs,
  dashboardPage,
  forbiddenPage,
  loginPage,
} from "./admin-assets.js";
import { config } from "./config.js";
import { listHiddenLinks, updateLinkVisibility } from "./github.js";

type Variables = {
  admin: AdminSession;
};

const app = new Hono<{ Variables: Variables }>();
const mutationAttempts = new Map<string, number[]>();

app.use("*", async (context, next) => {
  await next();
  context.header("X-Content-Type-Options", "nosniff");
  context.header("Referrer-Policy", "same-origin");
  context.header("X-Frame-Options", "DENY");
  context.header(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://github.com",
  );
  context.header("Cache-Control", "no-store");
});

app.on(["GET", "POST"], "/api/auth/*", (context) =>
  auth.handler(context.req.raw),
);

app.get("/health", (context) => context.json({ status: "ok" }));

app.get("/admin/style.css", (context) =>
  context.body(adminCss, 200, { "Content-Type": "text/css; charset=utf-8" }),
);
app.get("/admin/app.js", (context) =>
  context.body(adminJs, 200, {
    "Content-Type": "application/javascript; charset=utf-8",
  }),
);

app.get("/admin", async (context) => {
  const session = await auth.api.getSession({ headers: context.req.raw.headers });
  if (!session) return context.html(loginPage());
  const admin = await getAdminSession(context.req.raw.headers);
  if (!admin) return context.html(forbiddenPage(), 403);
  return context.html(dashboardPage(admin.user.name || "Marc"));
});

app.get("/api/admin/session", async (context) => {
  const session = await auth.api.getSession({ headers: context.req.raw.headers });
  if (!session) {
    return context.json({ authenticated: false, isAdmin: false });
  }
  const admin = await getAdminSession(context.req.raw.headers);
  if (!admin) {
    return context.json({ authenticated: true, isAdmin: false });
  }
  return context.json({
    authenticated: true,
    isAdmin: true,
    user: { name: admin.user.name, image: admin.user.image },
  });
});

app.use("/api/admin/*", async (context, next) => {
  const admin = await getAdminSession(context.req.raw.headers);
  if (!admin) {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    return context.json(
      { error: session ? "FORBIDDEN" : "AUTHENTICATION_REQUIRED" },
      session ? 403 : 401,
    );
  }
  context.set("admin", admin);
  await next();
});

app.get("/api/admin/links/hidden", async (context) => {
  try {
    return context.json({ links: await listHiddenLinks() });
  } catch (error) {
    console.error("Unable to load hidden links", error);
    return context.json({ error: "CATALOG_UNAVAILABLE" }, 502);
  }
});

const mutate = async (
  context: Context<{ Variables: Variables }>,
  action: "hide" | "restore",
) => {
  if (context.req.header("Origin") !== config.origin) {
    return context.json({ error: "INVALID_ORIGIN" }, 403);
  }

  const address =
    context.req.header("CF-Connecting-IP") ||
    context.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown";
  const now = Date.now();
  const recent = (mutationAttempts.get(address) ?? []).filter(
    (timestamp) => now - timestamp < 60_000,
  );
  if (recent.length >= 10) {
    return context.json({ error: "RATE_LIMITED" }, 429);
  }
  recent.push(now);
  mutationAttempts.set(address, recent);

  const body: { confirm?: boolean } = await context.req
    .json<{ confirm?: boolean }>()
    .catch(() => ({}));
  if (body.confirm !== true) {
    return context.json({ error: "CONFIRMATION_REQUIRED" }, 400);
  }

  const id = context.req.param("id");
  if (!id) return context.json({ error: "LINK_NOT_FOUND" }, 404);

  try {
    return context.json(await updateLinkVisibility(id, action));
  } catch (error) {
    if (error instanceof Error && error.message === "LINK_NOT_FOUND") {
      return context.json({ error: "LINK_NOT_FOUND" }, 404);
    }
    console.error(`Unable to ${action} link`, error);
    return context.json({ error: "CATALOG_UPDATE_FAILED" }, 502);
  }
};

app.post("/api/admin/links/:id/hide", (context) => mutate(context, "hide"));
app.post("/api/admin/links/:id/restore", (context) =>
  mutate(context, "restore"),
);

app.notFound((context) => context.json({ error: "NOT_FOUND" }, 404));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Digest admin service listening on http://127.0.0.1:${info.port}`);
});

export { app };

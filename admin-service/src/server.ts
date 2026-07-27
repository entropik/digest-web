import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import {
  auth,
  authDatabase,
  getAdminSession,
  type AdminSession,
} from "./auth.js";
import {
  adminCss,
  adminJs,
  dashboardPage,
  forbiddenPage,
  loginPage,
} from "./admin-assets.js";
import { config } from "./config.js";
import { CurationStore } from "./curation-db.js";
import { CurationError, CurationService } from "./curation.js";
import type {
  DraftInput,
  DraftState,
  PublicationInput,
} from "./curation-types.js";
import {
  listAdminLinks,
  listHiddenLinks,
  updateLinkVisibility,
} from "./github.js";
import { UnsafeUrlError } from "./urls.js";

type Variables = {
  admin: AdminSession;
};

const app = new Hono<{ Variables: Variables }>();
const mutationAttempts = new Map<string, number[]>();
const curation = new CurationService(new CurationStore(authDatabase));

const allowedOrigin = (origin: string | undefined): origin is string =>
  !!origin && config.allowedOrigins.includes(origin);

app.use("*", async (context, next) => {
  const origin = context.req.header("Origin");
  if (allowedOrigin(origin)) {
    context.header("Access-Control-Allow-Origin", origin);
    context.header("Access-Control-Allow-Credentials", "true");
    context.header("Access-Control-Allow-Headers", "Content-Type");
    context.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, DELETE, OPTIONS",
    );
    context.header("Vary", "Origin");
  }
  context.header("X-Content-Type-Options", "nosniff");
  context.header("Referrer-Policy", "same-origin");
  context.header("X-Frame-Options", "DENY");
  context.header(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://github.com",
  );
  context.header("Cache-Control", "no-store");
  if (context.req.method === "OPTIONS") {
    return allowedOrigin(origin)
      ? context.body(null, 204)
      : context.json({ error: "INVALID_ORIGIN" }, 403);
  }
  await next();
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
    const session = await auth.api.getSession({
      headers: context.req.raw.headers,
    });
    return context.json(
      { error: session ? "FORBIDDEN" : "AUTHENTICATION_REQUIRED" },
      session ? 403 : 401,
    );
  }
  context.set("admin", admin);
  await next();
});

app.use("/api/admin/*", async (context, next) => {
  if (!["POST", "PATCH", "DELETE"].includes(context.req.method)) {
    await next();
    return;
  }
  if (!allowedOrigin(context.req.header("Origin"))) {
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
  if (recent.length >= 30) {
    return context.json({ error: "RATE_LIMITED" }, 429);
  }
  recent.push(now);
  mutationAttempts.set(address, recent);
  await next();
});

const jsonBody = async <T>(context: Context): Promise<T> =>
  context.req.json<T>().catch(() => {
    throw new CurationError("INVALID_JSON");
  });

const requireConfirmation = (body: { confirm?: unknown }): void => {
  if (body.confirm !== true) throw new CurationError("CONFIRMATION_REQUIRED");
};

const handle = async <T>(
  context: Context,
  operation: () => Promise<T> | T,
) => {
  try {
    return context.json(await operation());
  } catch (error) {
    if (error instanceof CurationError) {
      return context.json(
        { error: error.code, details: error.details },
        error.status as 400,
      );
    }
    if (error instanceof UnsafeUrlError) {
      return context.json({ error: error.code }, 400);
    }
    console.error("Admin operation failed", error);
    return context.json({ error: "ADMIN_OPERATION_FAILED" }, 502);
  }
};

app.get("/api/admin/curation/options", (context) =>
  handle(context, () => curation.options()),
);

app.get("/api/admin/curation/drafts", (context) =>
  handle(context, async () => {
    const url = context.req.query("url");
    if (url) {
      return curation.lookupUrl(url);
    }
    const requestedState = context.req.query("state") ?? "draft";
    const state: DraftState = ["draft", "publishing", "published"].includes(
      requestedState,
    )
      ? (requestedState as DraftState)
      : "draft";
    return { drafts: curation.store.listDrafts(state) };
  }),
);

app.post("/api/admin/curation/drafts", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<DraftInput & { confirm?: boolean }>(context);
    requireConfirmation(body);
    return curation.saveDraft(body);
  }),
);

app.patch("/api/admin/curation/drafts/:id", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<
      Omit<DraftInput, "url"> & { confirm?: boolean }
    >(context);
    requireConfirmation(body);
    return { draft: await curation.updateDraft(context.req.param("id"), body) };
  }),
);

app.delete("/api/admin/curation/drafts/:id", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<{ confirm?: boolean }>(context);
    requireConfirmation(body);
    curation.deleteDraft(context.req.param("id"));
    return { deleted: true };
  }),
);

app.post("/api/admin/curation/publications/preview", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<PublicationInput>(context);
    return curation.previewPublication(body);
  }),
);

app.post("/api/admin/curation/publications", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<PublicationInput & { confirm?: boolean }>(
      context,
    );
    requireConfirmation(body);
    return { publication: await curation.publish(body) };
  }),
);

app.get("/api/admin/curation/publications", (context) =>
  handle(context, () => ({
    publications: curation.store.listPublications(),
  })),
);

app.get("/api/admin/curation/publications/:id", (context) =>
  handle(context, async () => ({
    publication: await curation.refreshPublication(context.req.param("id")),
  })),
);

app.get("/api/admin/links", (context) =>
  handle(context, async () => ({
    links: await listAdminLinks(
      context.req.query("q") ?? "",
      Number.parseInt(context.req.query("limit") ?? "100", 10),
    ),
  })),
);

app.patch("/api/admin/links/:id", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<Record<string, unknown>>(context);
    requireConfirmation(body);
    return curation.editPublishedLink(context.req.param("id"), body);
  }),
);

app.get("/api/admin/links/hidden", async (context) =>
  handle(context, async () => ({ links: await listHiddenLinks() })),
);

const visibilityMutation = async (
  context: Context,
  action: "hide" | "restore",
) =>
  handle(context, async () => {
    const body = await jsonBody<{ confirm?: boolean }>(context);
    requireConfirmation(body);
    const id = context.req.param("id");
    if (!id) throw new CurationError("LINK_NOT_FOUND", 404);
    try {
      return await updateLinkVisibility(id, action);
    } catch (error) {
      if (error instanceof Error && error.message === "LINK_NOT_FOUND") {
        throw new CurationError("LINK_NOT_FOUND", 404);
      }
      throw error;
    }
  });

app.post("/api/admin/links/:id/hide", (context) =>
  visibilityMutation(context, "hide"),
);
app.post("/api/admin/links/:id/restore", (context) =>
  visibilityMutation(context, "restore"),
);

app.get("/api/admin/editions", (context) =>
  handle(context, async () => {
    const date = context.req.query("date");
    return date
      ? { edition: await curation.getEdition(date) }
      : { editions: await curation.listEditions() };
  }),
);

app.patch("/api/admin/editions/:date", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<{
      confirm?: boolean;
      title?: unknown;
      introduction?: unknown;
      seoDescription?: unknown;
    }>(context);
    requireConfirmation(body);
    return curation.updateEdition(context.req.param("date"), body);
  }),
);

app.notFound((context) => context.json({ error: "NOT_FOUND" }, 404));

if (config.nodeEnv !== "test") {
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`Digest admin service listening on http://127.0.0.1:${info.port}`);
  });
}

export { app };

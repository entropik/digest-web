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
  EditionTransitionInput,
  PublicationInput,
} from "./curation-types.js";
import {
  GitHubMutationOutcomeUnknownError,
  listAdminLinks,
  listHiddenLinks,
} from "./github.js";
import {
  createRequestId,
  runWithRequestContext,
} from "./observability.js";
import { LinkedInError, LinkedInService } from "./linkedin.js";
import { LinkSocialImageService } from "./link-social-image.js";
import { UnsafeUrlError } from "./urls.js";

type Variables = {
  admin: AdminSession;
};

const app = new Hono<{ Variables: Variables }>();
const mutationAttempts = new Map<string, number[]>();
const curation = new CurationService(new CurationStore(authDatabase));
const linkedin = new LinkedInService(authDatabase);
const linkSocialImages = new LinkSocialImageService(
  config.linkedinCaptureDirectory,
);

const allowedOrigin = (origin: string | undefined): origin is string =>
  !!origin && config.allowedOrigins.includes(origin);

app.use("*", async (context, next) => {
  const requestId = createRequestId();
  context.header("X-Request-Id", requestId);
  await runWithRequestContext(requestId, next);
});

app.use("*", async (context, next) => {
  const origin = context.req.header("Origin");
  if (allowedOrigin(origin)) {
    context.header("Access-Control-Allow-Origin", origin);
    context.header("Access-Control-Allow-Credentials", "true");
    context.header("Access-Control-Allow-Headers", "Content-Type");
    context.header("Access-Control-Expose-Headers", "X-Request-Id");
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

app.get("/api/linkedin-images/:name", async (context) => {
  const image = await linkSocialImages.read(
    context.req.param("name"),
    context.req.query("reservation"),
  );
  if (!image) return context.json({ error: "IMAGE_NOT_FOUND" }, 404);
  return context.body(new Uint8Array(image), 200, {
    "Content-Type": "image/png",
    "Content-Length": String(image.length),
    "Cache-Control": "public, max-age=3600",
  });
});

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
    if (error instanceof LinkedInError) {
      return context.json(
        { error: error.code, details: error.details },
        error.status as 400,
      );
    }
    if (error instanceof GitHubMutationOutcomeUnknownError) {
      return context.json({ error: "GITHUB_COMMIT_OUTCOME_UNKNOWN" }, 502);
    }
    console.error("Admin operation failed", error);
    return context.json({ error: "ADMIN_OPERATION_FAILED" }, 502);
  }
};

app.get("/api/admin/linkedin/status", (context) =>
  handle(context, () => linkedin.status(context.get("admin").user.id)),
);

app.post("/api/admin/linkedin/configure", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<{
      clientId: string;
      clientSecret: string;
      confirm?: boolean;
    }>(context);
    requireConfirmation(body);
    return linkedin.configure(
      context.get("admin").user.id,
      body.clientId,
      body.clientSecret,
    );
  }),
);

app.get("/api/admin/linkedin/connect", (context) => {
  try {
    const url = linkedin.authorizationUrl(
      context.get("admin").user.id,
      context.req.query("returnTo"),
    );
    return context.redirect(url);
  } catch (error) {
    if (error instanceof LinkedInError) {
      return context.json({ error: error.code }, error.status as 400);
    }
    throw error;
  }
});

app.get("/api/admin/linkedin/callback", async (context) => {
  if (context.req.query("error")) {
    return context.redirect("/admin?linkedin=cancelled");
  }
  const state = context.req.query("state");
  const code = context.req.query("code");
  if (!state || !code) {
    return context.json({ error: "LINKEDIN_AUTHORIZATION_FAILED" }, 400);
  }
  try {
    const returnTo = await linkedin.completeAuthorization(
      context.get("admin").user.id,
      state,
      code,
    );
    return context.redirect(`${returnTo}?linkedin=connected`);
  } catch (error) {
    if (error instanceof LinkedInError) {
      return context.json(
        { error: error.code, details: error.details },
        error.status as 400,
      );
    }
    console.error("LinkedIn authorization failed", error);
    return context.json({ error: "LINKEDIN_AUTHORIZATION_FAILED" }, 502);
  }
});

app.post("/api/admin/linkedin/publish", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<{
      title: string;
      text: string;
      url: string;
      imageUrl: string;
      republish?: boolean;
      retry?: boolean;
      confirm?: boolean;
    }>(context);
    requireConfirmation(body);
    return linkedin.publish(
      context.get("admin").user.id,
      body,
      body.republish === true || body.retry === true,
    );
  }),
);

app.post("/api/admin/linkedin/publication-status", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<{ url: string }>(context);
    return linkedin.publicationStatus(
      context.get("admin").user.id,
      String(body.url || ""),
    );
  }),
);

app.post("/api/admin/linkedin/link-preview", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<{
      linkId: string;
      refresh?: boolean;
      confirm?: boolean;
    }>(context);
    requireConfirmation(body);
    const link = await curation.publishedLink(String(body.linkId || ""));
    return linkSocialImages.imageFor(link, body.refresh === true);
  }),
);

app.post("/api/admin/linkedin/publish-link", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<{
      linkId: string;
      text: string;
      republish?: boolean;
      retry?: boolean;
      confirm?: boolean;
    }>(context);
    requireConfirmation(body);
    const link = await curation.publishedLink(String(body.linkId || ""));
    const image = await linkSocialImages.imageFor(link);
    return linkedin.publishLink(
      context.get("admin").user.id,
      {
        title: link.title,
        text: body.text,
        url: link.url,
        imageUrl: image.imageUrl,
      },
      body.republish === true || body.retry === true,
    );
  }),
);

app.get("/api/admin/curation/options", (context) =>
  handle(context, () => curation.options()),
);

app.get("/api/admin/categories", (context) =>
  handle(context, () => curation.categories()),
);

app.post("/api/admin/categories", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<{
      name?: unknown;
      description?: unknown;
      confirm?: boolean;
    }>(context);
    requireConfirmation(body);
    return curation.addCategory(body.name, body.description);
  }),
);

app.patch("/api/admin/categories/:name", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<{
      name?: unknown;
      description?: unknown;
      requestId?: unknown;
      confirm?: boolean;
    }>(context);
    requireConfirmation(body);
    return curation.renameCategory(
      context.req.param("name"),
      body.name,
      body.description,
      body.requestId,
    );
  }),
);

app.delete("/api/admin/categories/:name", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<{ confirm?: boolean }>(context);
    requireConfirmation(body);
    return curation.deleteCategory(context.req.param("name"));
  }),
);

app.get("/api/admin/themes", (context) =>
  handle(context, () => curation.themes()),
);

app.post("/api/admin/themes", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<Record<string, unknown> & { confirm?: boolean }>(context);
    requireConfirmation(body);
    return curation.addTheme(body);
  }),
);

app.patch("/api/admin/themes/:name", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<
      Record<string, unknown> & { confirm?: boolean; requestId?: unknown }
    >(context);
    requireConfirmation(body);
    return curation.updateTheme(
      context.req.param("name"),
      body,
      body.requestId,
    );
  }),
);

app.delete("/api/admin/themes/:name", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<{ confirm?: boolean; requestId?: unknown }>(context);
    requireConfirmation(body);
    return curation.archiveTheme(context.req.param("name"), body.requestId);
  }),
);

app.post("/api/admin/themes/:name/reactivate", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<{ confirm?: boolean }>(context);
    requireConfirmation(body);
    return curation.reactivateTheme(context.req.param("name"));
  }),
);

app.get("/api/admin/curation/bootstrap", (context) =>
  handle(context, () => {
    const url = context.req.query("url");
    if (!url) throw new CurationError("URL_REQUIRED");
    return curation.bootstrap(url);
  }),
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

app.post("/api/admin/links/:id/tags", async (context) =>
  handle(context, async () => {
    const body = await jsonBody<Record<string, unknown>>(context);
    requireConfirmation(body);
    return curation.addTagsToPublishedLink(context.req.param("id"), body);
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
      return await curation.updateLinkVisibility(id, action);
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

const editionTransition = async (
  context: Context,
  action: EditionTransitionInput["action"],
) =>
  handle(context, async () => {
    const body = await jsonBody<{ confirm?: boolean; requestId?: unknown }>(
      context,
    );
    requireConfirmation(body);
    const date = context.req.param("date");
    if (!date) throw new CurationError("INVALID_DIGEST_DATE");
    return {
      publication: await curation.transitionEdition(date, {
        requestId: String(body.requestId ?? ""),
        action,
      }),
    };
  });

app.post("/api/admin/editions/:date/publish", (context) =>
  editionTransition(context, "publish"),
);

app.post("/api/admin/editions/:date/unpublish", (context) =>
  editionTransition(context, "unpublish"),
);

app.notFound((context) => context.json({ error: "NOT_FOUND" }, 404));

if (config.nodeEnv !== "test") {
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`Digest admin service listening on http://127.0.0.1:${info.port}`);
  });
}

export { app };

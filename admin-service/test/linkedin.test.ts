import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import Database from "better-sqlite3";

const temporary = await mkdtemp(join(tmpdir(), "digest-linkedin-test-"));
process.env.NODE_ENV = "test";
process.env.BETTER_AUTH_URL = "https://digest.ooblik.com";
process.env.BETTER_AUTH_SECRET = "a-secure-test-secret-that-is-long-enough";
process.env.BETTER_AUTH_DATABASE = join(temporary, "auth.sqlite");
process.env.GITHUB_CLIENT_ID = "test-github-client";
process.env.GITHUB_CLIENT_SECRET = "test-github-secret";
process.env.GITHUB_APP_ID = "1";
process.env.GITHUB_APP_INSTALLATION_ID = "1";
process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = Buffer.from("unused").toString("base64");
process.env.LINKEDIN_CLIENT_ID = "test-linkedin-client";
process.env.LINKEDIN_CLIENT_SECRET = "test-linkedin-secret";

const { LinkedInError, LinkedInService } = await import("../src/linkedin.js");
const database = new Database(join(temporary, "linkedin.sqlite"));

after(async () => {
  database.close();
  await rm(temporary, { recursive: true, force: true });
});

test("OAuth stores an encrypted member connection tied to a one-time state", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/oauth/v2/accessToken")) {
      return Response.json({ access_token: "linkedin-access-token", expires_in: 3600 });
    }
    if (url.endsWith("/v2/userinfo")) {
      return Response.json({ sub: "member-123", name: "Marc LinkedIn" });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const service = new LinkedInService(database, fetcher as typeof fetch);
  service.configure("admin-1", "stored-client-id", "stored-client-secret-value");
  const authorization = new URL(
    service.authorizationUrl("admin-1", "/archives/2026-08-16/"),
  );
  assert.equal(authorization.origin, "https://www.linkedin.com");
  assert.equal(authorization.searchParams.get("client_id"), "stored-client-id");
  assert.equal(authorization.searchParams.get("scope"), "openid profile w_member_social");
  assert.equal(
    authorization.searchParams.get("redirect_uri"),
    "https://digest.ooblik.com/api/admin/linkedin/callback",
  );
  const state = authorization.searchParams.get("state")!;
  assert.equal(
    await service.completeAuthorization("admin-1", state, "authorization-code"),
    "/archives/2026-08-16/",
  );
  assert.deepEqual(service.status("admin-1").memberName, "Marc LinkedIn");
  const stored = database
    .prepare(
      `SELECT encrypted_access_token, encrypted_client_secret
       FROM linkedin_connections
       JOIN linkedin_app_credentials USING (admin_user_id)`,
    )
    .get() as {
    encrypted_access_token: string;
    encrypted_client_secret: string;
  };
  assert.doesNotMatch(stored.encrypted_access_token, /linkedin-access-token/);
  assert.doesNotMatch(stored.encrypted_client_secret, /stored-client-secret-value/);
  const tokenBody = calls[0]!.init!.body as URLSearchParams;
  assert.equal(tokenBody.get("client_secret"), "stored-client-secret-value");
  await assert.rejects(
    service.completeAuthorization("admin-1", state, "replayed-code"),
    (error: unknown) =>
      error instanceof LinkedInError && error.code === "LINKEDIN_INVALID_STATE",
  );
});

test("publishing uploads the PNG then creates one native image post with its URL", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/oauth/v2/accessToken")) {
      return Response.json({
        access_token: "publish-access-token",
        expires_in: 3600,
      });
    }
    if (url.endsWith("/v2/userinfo")) {
      return Response.json({
        sub: "publisher-456",
        name: "Compte de publication",
      });
    }
    if (url.endsWith("/social/2026-08-16-linkedin.png")) {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "Content-Type": "image/png" },
      });
    }
    if (url.includes("/api/linkedin-images/")) {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "Content-Type": "image/png" },
      });
    }
    if (url.includes("/v2/assets?action=registerUpload")) {
      return Response.json({
        value: {
          uploadMechanism: {
            "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
              uploadUrl: "https://upload.linkedin.test/image",
            },
          },
          asset: "urn:li:digitalmediaAsset:image-123",
        },
      });
    }
    if (url === "https://upload.linkedin.test/image") return new Response(null, { status: 201 });
    if (url.endsWith("/v2/ugcPosts")) {
      return new Response(null, {
        status: 201,
        headers: { "x-restli-id": "urn:li:share:post-123" },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const service = new LinkedInService(database, fetcher as typeof fetch);
  const authorization = new URL(service.authorizationUrl("admin-2"));
  await service.completeAuthorization(
    "admin-2",
    authorization.searchParams.get("state")!,
    "publish-code",
  );
  const result = await service.publish("admin-2", {
    title: "Web Digest — 16 août 2026",
    text: "IA, développement, design et création numérique.",
    url: "https://digest.ooblik.com/archives/2026-08-16/",
    imageUrl: "/social/2026-08-16-linkedin.png",
  });
  assert.equal(result.alreadyPublished, false);
  assert.equal(result.postUrl, "https://www.linkedin.com/feed/update/urn:li:share:post-123");
  const registerCall = calls.find(({ url }) =>
    url.includes("/v2/assets?action=registerUpload"),
  )!;
  const registration = JSON.parse(String(registerCall.init!.body));
  assert.deepEqual(
    registration.registerUploadRequest.supportedUploadMechanism,
    ["SYNCHRONOUS_UPLOAD"],
  );
  const postCall = calls.find(({ url }) => url.endsWith("/v2/ugcPosts"))!;
  const post = JSON.parse(String(postCall.init!.body));
  const content = post.specificContent["com.linkedin.ugc.ShareContent"];
  assert.equal(content.shareMediaCategory, "IMAGE");
  assert.equal("description" in content.media[0], false);
  assert.equal(
    content.shareCommentary.text,
    "IA, développement, design et création numérique.\n\nhttps://digest.ooblik.com/archives/2026-08-16/",
  );
  assert.equal(content.media[0].media, "urn:li:digitalmediaAsset:image-123");
  const repeated = await service.publish("admin-2", {
    title: "Web Digest — 16 août 2026",
    text: "IA, développement, design et création numérique.",
    url: "https://digest.ooblik.com/archives/2026-08-16/",
    imageUrl: "/social/2026-08-16-linkedin.png",
  });
  assert.equal(repeated.alreadyPublished, true);
  assert.equal(calls.filter(({ url }) => url.endsWith("/v2/ugcPosts")).length, 1);

  const linkResult = await service.publishLink("admin-2", {
    title: "Une ressource du Digest",
    text: "À lire. #Design",
    url: "https://example.com/une-ressource",
    imageUrl:
      "/api/linkedin-images/3583bb99-c9f5-53fc-832c-9d92933c1ad4-0123456789abcdef.png?v=1",
  });
  assert.equal(linkResult.alreadyPublished, false);
  const linkPostCall = calls.filter(({ url }) => url.endsWith("/v2/ugcPosts")).at(-1)!;
  const linkPost = JSON.parse(String(linkPostCall.init!.body));
  assert.equal(
    "description" in
      linkPost.specificContent["com.linkedin.ugc.ShareContent"].media[0],
    false,
  );
  assert.equal(
    linkPost.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text,
    "À lire. #Design\n\nhttps://example.com/une-ressource",
  );

  const longText = `${"x".repeat(2_900)}...`;
  await service.publishLink("admin-2", {
    title: "Une longue publication",
    text: longText,
    url: "https://example.com/longue-publication",
    imageUrl:
      "/api/linkedin-images/3583bb99-c9f5-53fc-832c-9d92933c1ad4-0123456789abcdef.png?v=1",
  });
  const longPostCall = calls.filter(({ url }) => url.endsWith("/v2/ugcPosts")).at(-1)!;
  const longPost = JSON.parse(String(longPostCall.init!.body));
  const longContent = longPost.specificContent["com.linkedin.ugc.ShareContent"];
  assert.equal(
    longContent.shareCommentary.text,
    `${longText}\n\nhttps://example.com/longue-publication`,
  );
  assert.equal("description" in longContent.media[0], false);

  const concurrentInput = {
    title: "Publication réservée",
    text: "Un seul post doit être créé.",
    url: "https://example.com/publication-concurrente",
    imageUrl:
      "/api/linkedin-images/3583bb99-c9f5-53fc-832c-9d92933c1ad4-0123456789abcdef.png?v=1",
  };
  const firstPublication = service.publishLink("admin-2", concurrentInput);
  await assert.rejects(
    service.publishLink("admin-2", concurrentInput),
    (error: unknown) =>
      error instanceof LinkedInError &&
      error.code === "LINKEDIN_PUBLICATION_IN_PROGRESS",
  );
  await firstPublication;
  assert.equal(
    calls.filter(({ url }) => url.endsWith("/v2/ugcPosts")).length,
    4,
  );
});

test("publication rejects external archive and image URLs before fetching", async () => {
  let fetched = false;
  const service = new LinkedInService(database, (async () => {
    fetched = true;
    return new Response();
  }) as typeof fetch);
  await assert.rejects(
    service.publish("admin-1", {
      title: "Digest",
      text: "Texte",
      url: "https://evil.example/archives/2026-08-16/",
      imageUrl: "https://evil.example/social/2026-08-16.png",
    }),
    (error: unknown) =>
      error instanceof LinkedInError && error.code === "LINKEDIN_INVALID_PUBLICATION",
  );
  assert.equal(fetched, false);
  await assert.rejects(
    service.publishLink("admin-1", {
      title: "Digest",
      text: "Texte",
      url: "http://127.0.0.1/private",
      imageUrl: "/social/2026-08-16.png",
    }),
    (error: unknown) =>
      error instanceof LinkedInError && error.code === "LINKEDIN_INVALID_PUBLICATION",
  );
});

test("publication reserves room for the URL within LinkedIn's 3000 character limit", () => {
  const service = new LinkedInService(database);
  const validate = (
    service as unknown as {
      validatePublication: (
        input: { title: string; text: string; url: string; imageUrl: string },
        allowCatalogUrl?: boolean,
      ) => { text: string };
    }
  ).validatePublication.bind(service);
  const input = {
    title: "Un long post",
    text: `${"x".repeat(2_900)}...`,
    url: "https://example.com/ressource",
    imageUrl:
      "/api/linkedin-images/3583bb99-c9f5-53fc-832c-9d92933c1ad4-0123456789abcdef.png?v=1",
  };

  assert.equal(validate(input, true).text.endsWith("..."), true);
  assert.throws(
    () => validate({ ...input, text: "x".repeat(3_000) }, true),
    (error: unknown) =>
      error instanceof LinkedInError &&
      error.code === "LINKEDIN_INVALID_PUBLICATION",
  );
});

test("active LinkedIn reservations are renewed while external calls are pending", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../src/linkedin.ts", import.meta.url), "utf8"),
  );
  assert.match(source, /PUBLICATION_RESERVATION_RENEWAL_MS/);
  assert.match(source, /setInterval\(\(\) => \{/);
  assert.match(source, /this\.renewPublication\(validated\.url/);
  assert.match(source, /clearInterval\(renewal\)/);
});

test("a local persistence failure after LinkedIn success blocks automatic republication", async () => {
  const isolatedDatabase = new Database(join(temporary, "linkedin-ambiguous.sqlite"));
  let postCalls = 0;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/oauth/v2/accessToken")) {
      return Response.json({ access_token: "ambiguous-token", expires_in: 3600 });
    }
    if (url.endsWith("/v2/userinfo")) {
      return Response.json({ sub: "ambiguous-member", name: "Compte ambigu" });
    }
    if (url.includes("/api/linkedin-images/")) {
      return new Response(new Uint8Array([137, 80, 78, 71]));
    }
    if (url.includes("/v2/assets?action=registerUpload")) {
      return Response.json({
        value: {
          uploadMechanism: {
            "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
              uploadUrl: "https://upload.linkedin.test/ambiguous",
            },
          },
          asset: "urn:li:digitalmediaAsset:ambiguous",
        },
      });
    }
    if (url === "https://upload.linkedin.test/ambiguous") {
      return new Response(null, { status: 201 });
    }
    if (url.endsWith("/v2/ugcPosts")) {
      postCalls += 1;
      const post = JSON.parse(String(init?.body));
      const commentary =
        post.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary
          .text as string;
      if (commentary.includes("Réponse serveur ambiguë")) {
        return new Response("upstream unavailable", { status: 503 });
      }
      if (commentary.includes("Rejet définitif")) {
        return new Response("invalid payload", { status: 400 });
      }
      if (commentary.includes("Rejet sans corps")) {
        return new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener("abort", () =>
                controller.error(new DOMException("Aborted", "AbortError")),
              );
            },
          }),
          { status: 422 },
        );
      }
      return new Response(null, {
        status: 201,
        headers: { "x-restli-id": "urn:li:share:ambiguous" },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const service = new LinkedInService(isolatedDatabase, fetcher as typeof fetch);
  const authorization = new URL(service.authorizationUrl("admin-ambiguous"));
  await service.completeAuthorization(
    "admin-ambiguous",
    authorization.searchParams.get("state")!,
    "ambiguous-code",
  );
  isolatedDatabase.exec(`
    CREATE TRIGGER fail_linkedin_publication_persistence
    BEFORE INSERT ON linkedin_publications
    BEGIN
      SELECT RAISE(FAIL, 'simulated disk failure');
    END;
  `);
  const input = {
    title: "Publication ambiguë",
    text: "Ne doit jamais être envoyée deux fois.",
    url: "https://example.com/publication-ambigue",
    imageUrl:
      "/api/linkedin-images/3583bb99-c9f5-53fc-832c-9d92933c1ad4-0123456789abcdef.png?v=1",
  };

  await assert.rejects(
    service.publishLink("admin-ambiguous", input),
    (error: unknown) =>
      error instanceof LinkedInError &&
      error.code === "LINKEDIN_PUBLICATION_OUTCOME_UNKNOWN",
  );
  const reservation = isolatedDatabase
    .prepare(
      `SELECT state FROM linkedin_publication_reservations
       WHERE publication_url = ?`,
    )
    .get(input.url) as { state: string };
  assert.equal(reservation.state, "submitting");

  const restarted = new LinkedInService(isolatedDatabase, fetcher as typeof fetch);
  await assert.rejects(
    restarted.publishLink("admin-ambiguous", input),
    (error: unknown) =>
      error instanceof LinkedInError &&
      error.code === "LINKEDIN_PUBLICATION_OUTCOME_UNKNOWN",
  );
  assert.equal(postCalls, 1);

  const serverFailure = {
    ...input,
    text: "Réponse serveur ambiguë.",
    url: "https://example.com/publication-503",
  };
  await assert.rejects(
    restarted.publishLink("admin-ambiguous", serverFailure),
    (error: unknown) =>
      error instanceof LinkedInError &&
      error.code === "LINKEDIN_PUBLICATION_OUTCOME_UNKNOWN",
  );
  await assert.rejects(
    new LinkedInService(isolatedDatabase, fetcher as typeof fetch).publishLink(
      "admin-ambiguous",
      serverFailure,
    ),
    (error: unknown) =>
      error instanceof LinkedInError &&
      error.code === "LINKEDIN_PUBLICATION_OUTCOME_UNKNOWN",
  );
  assert.equal(postCalls, 2);

  const rejected = {
    ...input,
    text: "Rejet définitif.",
    url: "https://example.com/publication-400",
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      restarted.publishLink("admin-ambiguous", rejected),
      (error: unknown) =>
        error instanceof LinkedInError &&
        error.code === "LINKEDIN_PUBLICATION_FAILED",
    );
  }
  assert.equal(postCalls, 4);

  const rejectedWithoutBody = {
    ...input,
    text: "Rejet sans corps.",
    url: "https://example.com/publication-422-body-timeout",
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      restarted.publishLink("admin-ambiguous", rejectedWithoutBody),
      (error: unknown) =>
        error instanceof LinkedInError &&
        error.code === "LINKEDIN_PUBLICATION_FAILED",
    );
  }
  assert.equal(postCalls, 6);
  isolatedDatabase.close();
});

test("a LinkedIn post timeout remains ambiguous and cannot be retried automatically", async () => {
  const isolatedDatabase = new Database(join(temporary, "linkedin-timeout.sqlite"));
  let postCalls = 0;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/oauth/v2/accessToken")) {
      return Response.json({ access_token: "timeout-token", expires_in: 3600 });
    }
    if (url.endsWith("/v2/userinfo")) {
      return Response.json({ sub: "timeout-member", name: "Compte timeout" });
    }
    if (url.includes("/api/linkedin-images/")) {
      return new Response(new Uint8Array([137, 80, 78, 71]));
    }
    if (url.includes("/v2/assets?action=registerUpload")) {
      return Response.json({
        value: {
          uploadMechanism: {
            "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
              uploadUrl: "https://upload.linkedin.test/timeout",
            },
          },
          asset: "urn:li:digitalmediaAsset:timeout",
        },
      });
    }
    if (url === "https://upload.linkedin.test/timeout") {
      return new Response(null, { status: 201 });
    }
    if (url.endsWith("/v2/ugcPosts")) {
      postCalls += 1;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const deadlines = { read: 20, write: 20, upload: 20 };
  const service = new LinkedInService(
    isolatedDatabase,
    fetcher as typeof fetch,
    deadlines,
  );
  const authorization = new URL(service.authorizationUrl("admin-timeout"));
  await service.completeAuthorization(
    "admin-timeout",
    authorization.searchParams.get("state")!,
    "timeout-code",
  );
  const input = {
    title: "Publication au résultat inconnu",
    text: "Le délai ne doit pas provoquer un doublon.",
    url: "https://example.com/publication-timeout",
    imageUrl:
      "/api/linkedin-images/3583bb99-c9f5-53fc-832c-9d92933c1ad4-0123456789abcdef.png?v=1",
  };

  await assert.rejects(
    service.publishLink("admin-timeout", input),
    (error: unknown) =>
      error instanceof LinkedInError &&
      error.code === "LINKEDIN_PUBLICATION_OUTCOME_UNKNOWN",
  );
  await assert.rejects(
    new LinkedInService(
      isolatedDatabase,
      fetcher as typeof fetch,
      deadlines,
    ).publishLink("admin-timeout", input),
    (error: unknown) =>
      error instanceof LinkedInError &&
      error.code === "LINKEDIN_PUBLICATION_OUTCOME_UNKNOWN",
  );
  assert.equal(postCalls, 1);
  isolatedDatabase.close();
});

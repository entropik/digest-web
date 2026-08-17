import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { getMigrations } from "better-auth/db/migration";

const temporary = await mkdtemp(join(tmpdir(), "digest-admin-test-"));
process.env.NODE_ENV = "test";
process.env.PORT = "3219";
process.env.BETTER_AUTH_URL = "https://digest.ooblik.com";
process.env.BETTER_AUTH_SECRET = "a-secure-test-secret-that-is-long-enough";
process.env.BETTER_AUTH_DATABASE = join(temporary, "auth.sqlite");
process.env.GITHUB_CLIENT_ID = "test-client";
process.env.GITHUB_CLIENT_SECRET = "test-secret";
process.env.GITHUB_APP_ID = "1";
process.env.GITHUB_APP_INSTALLATION_ID = "1";
process.env.GITHUB_APP_PRIVATE_KEY_BASE64 =
  Buffer.from("not-used-in-these-tests").toString("base64");
process.env.CHROME_EXTENSION_ORIGINS =
  "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const { auth, authDatabase } = await import("../src/auth.js");
const { runMigrations } = await getMigrations(auth.options);
await runMigrations();
const { app } = await import("../src/server.js");

after(async () => {
  authDatabase.close();
  await rm(temporary, { recursive: true, force: true });
});

test("CORS only trusts the configured extension origin", async () => {
  const allowed = await app.request("/api/admin/session", {
    method: "OPTIONS",
    headers: {
      Origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  });
  assert.equal(allowed.status, 204);
  assert.equal(
    allowed.headers.get("Access-Control-Allow-Origin"),
    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  assert.equal(allowed.headers.get("Access-Control-Allow-Credentials"), "true");
  assert.equal(
    allowed.headers.get("Access-Control-Expose-Headers"),
    "X-Request-Id",
  );

  const denied = await app.request("/api/admin/session", {
    method: "OPTIONS",
    headers: {
      Origin: "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
});

test("session endpoint is readable but mutations require authentication", async () => {
  const session = await app.request("/api/admin/session", {
    headers: {
      Origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  });
  assert.equal(session.status, 200);
  assert.match(
    session.headers.get("X-Request-Id") ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  assert.deepEqual(await session.json(), {
    authenticated: false,
    isAdmin: false,
  });

  const bootstrap = await app.request(
    "/api/admin/curation/bootstrap?url=https%3A%2F%2Fexample.com",
    {
      headers: {
        Origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    },
  );
  assert.equal(bootstrap.status, 401);

  const mutation = await app.request("/api/admin/curation/drafts", {
    method: "POST",
    headers: {
      Origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: "https://example.com",
      confirm: true,
    }),
  });
  assert.equal(mutation.status, 401);

  const tagMutation = await app.request("/api/admin/links/example/tags", {
    method: "POST",
    headers: {
      Origin: "https://digest.ooblik.com",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tags: ["design"],
      confirm: true,
    }),
  });
  assert.equal(tagMutation.status, 401);

  const linkedinStatus = await app.request("/api/admin/linkedin/status", {
    headers: { Origin: "https://digest.ooblik.com" },
  });
  assert.equal(linkedinStatus.status, 401);

  const linkedinPublication = await app.request(
    "/api/admin/linkedin/publish",
    {
      method: "POST",
      headers: {
        Origin: "https://digest.ooblik.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirm: true }),
    },
  );
  assert.equal(linkedinPublication.status, 401);

  const linkedinPreview = await app.request(
    "/api/admin/linkedin/link-preview",
    {
      method: "POST",
      headers: {
        Origin: "https://digest.ooblik.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ linkId: "not-authorized", confirm: true }),
    },
  );
  assert.equal(linkedinPreview.status, 401);

  const linkedinConfiguration = await app.request(
    "/api/admin/linkedin/configure",
    {
      method: "POST",
      headers: {
        Origin: "https://digest.ooblik.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId: "not-authorized",
        clientSecret: "not-authorized-secret",
        confirm: true,
      }),
    },
  );
  assert.equal(linkedinConfiguration.status, 401);
});

test("generated LinkedIn images use a strict public read-only route", async () => {
  const directory = join(temporary, "linkedin-captures");
  const name =
    "3583bb99-c9f5-53fc-832c-9d92933c1ad4-0123456789abcdef.png";
  const image = new Uint8Array([137, 80, 78, 71]);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), image);

  const response = await app.request(`/api/linkedin-images/${name}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), image);

  const invalid = await app.request(
    "/api/linkedin-images/not-a-capture.png",
  );
  assert.equal(invalid.status, 404);
});

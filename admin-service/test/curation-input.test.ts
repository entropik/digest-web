import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.BETTER_AUTH_URL = "https://digest.ooblik.com";
process.env.BETTER_AUTH_SECRET = "a-secure-test-secret-that-is-long-enough";
process.env.BETTER_AUTH_DATABASE = "test-auth.sqlite";
process.env.GITHUB_CLIENT_ID = "test-client";
process.env.GITHUB_CLIENT_SECRET = "test-secret";
process.env.GITHUB_APP_ID = "1";
process.env.GITHUB_APP_INSTALLATION_ID = "1";
process.env.GITHUB_APP_PRIVATE_KEY_BASE64 =
  Buffer.from("not-used-in-these-tests").toString("base64");

const { CurationError, normalizeDraftInput } = await import(
  "../src/curation.js"
);

const taxonomy = {
  categories: ["Design"],
  tags: ["photo"],
};

test("a draft accepts a new tag while keeping existing tags as suggestions", () => {
  const draft = normalizeDraftInput(
    {
      url: "https://example.com/calibration",
      title: "Calibration",
      category: "Design",
      description: "Matériel de calibration",
      privateNote: "",
      tags: ["photo", "#sténopé", "STÉNOPÉ"],
    },
    taxonomy,
  );

  assert.deepEqual(draft.tags, ["photo", "sténopé"]);
});

test("a draft still rejects an unknown category", () => {
  assert.throws(
    () =>
      normalizeDraftInput(
        {
          url: "https://example.com/calibration",
          title: "Calibration",
          category: "Inconnue",
          description: "Matériel de calibration",
          privateNote: "",
          tags: ["sténopé"],
        },
        taxonomy,
      ),
    (error) =>
      error instanceof CurationError && error.code === "INVALID_CATEGORY",
  );
});

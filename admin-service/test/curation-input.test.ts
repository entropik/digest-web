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
  tags: ["photo", "stiegler"],
  tagDefinitions: [
    { name: "photo", description: "", aliases: [] },
    { name: "stiegler", description: "", aliases: ["Bernard STIEGLER"] },
  ],
};

test("a draft canonicalizes aliases and keeps only registered tags", () => {
  const draft = normalizeDraftInput(
    {
      url: "https://example.com/calibration",
      title: "Calibration",
      category: "Design",
      description: "Matériel de calibration",
      privateNote: "",
      tags: ["photo", "#PHOTO", "Bernard STIEGLER"],
    },
    taxonomy,
  );

  assert.deepEqual(draft.tags, ["photo", "stiegler"]);
});

test("a draft rejects an unregistered free-form tag", () => {
  assert.throws(
    () =>
      normalizeDraftInput(
        {
          url: "https://example.com/calibration",
          title: "Calibration",
          category: "Design",
          description: "Matériel de calibration",
          privateNote: "",
          tags: ["sténopé"],
        },
        taxonomy,
      ),
    (error) => error instanceof CurationError && error.code === "UNKNOWN_TAG",
  );
});

test("a draft can be saved and published without a tag", () => {
  const draft = normalizeDraftInput(
    {
      url: "https://example.com/sans-theme",
      title: "Sans thème",
      category: "Design",
      description: "La catégorie suffit au classement.",
      privateNote: "",
      tags: [],
    },
    taxonomy,
  );
  assert.deepEqual(draft.tags, []);
});

test("the server accepts five active tags and rejects a sixth", () => {
  const expandedTaxonomy = {
    ...taxonomy,
    tags: ["photo", "stiegler", "web", "outils", "design", "code"],
    tagDefinitions: [
      ...taxonomy.tagDefinitions,
      { name: "web", description: "", aliases: [] },
      { name: "outils", description: "", aliases: [] },
      { name: "design", description: "", aliases: [] },
      { name: "code", description: "", aliases: [] },
    ],
  };
  const input = {
    url: "https://example.com/cinq-tags",
    title: "Cinq tags",
    category: "Design",
    description: "Cette saisie doit être acceptée.",
    privateNote: "",
    tags: expandedTaxonomy.tags.slice(0, 5),
  };
  assert.equal(normalizeDraftInput(input, expandedTaxonomy).tags.length, 5);
  assert.throws(
    () => normalizeDraftInput({
      ...input,
      url: "https://example.com/six-tags",
      title: "Six tags",
      tags: expandedTaxonomy.tags,
    }, expandedTaxonomy),
    (error) => error instanceof CurationError && error.code === "TOO_MANY_THEMES",
  );
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
          tags: ["photo"],
        },
        taxonomy,
      ),
    (error) =>
      error instanceof CurationError && error.code === "INVALID_CATEGORY",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import type { CurationStore as CurationStoreType } from "../src/curation-db.js";
import type { DigestPublication } from "../src/curation-types.js";

process.env.NODE_ENV = "test";
process.env.BETTER_AUTH_URL = "https://digest.ooblik.com";
process.env.BETTER_AUTH_SECRET = "a-secure-test-secret-that-is-long-enough";
process.env.BETTER_AUTH_DATABASE = "curation-publication-test.sqlite";
process.env.GITHUB_CLIENT_ID = "test-github-client";
process.env.GITHUB_CLIENT_SECRET = "test-github-secret";
process.env.GITHUB_APP_ID = "1";
process.env.GITHUB_APP_INSTALLATION_ID = "1";
process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = Buffer.from("unused").toString("base64");

const { CurationStore } = await import("../src/curation-db.js");
const { CurationService } = await import("../src/curation.js");
const { GitHubMutationOutcomeUnknownError } = await import("../src/github.js");
const { stableLinkId } = await import("../src/publication.js");

class FailingPostCommitStore extends CurationStore {
  failValidatingUpdate = true;

  override updatePublication(
    id: string,
    values: Parameters<CurationStoreType["updatePublication"]>[1],
  ): DigestPublication {
    if (values.state === "validating" && this.failValidatingUpdate) {
      this.failValidatingUpdate = false;
      throw new Error("simulated SQLite write failure");
    }
    return super.updatePublication(id, values);
  }
}

test("a publication recovers after SQLite fails immediately after the GitHub commit", async () => {
  const database = new Database(":memory:");
  const store = new FailingPostCommitStore(database);
  const draft = store.createDraft({
    url: "https://example.com/recoverable-publication",
    title: "Publication récupérable",
    category: "Développement web",
    description: "Un lien publié une seule fois.",
    tags: ["Fiabilité"],
    privateNote: "Ne doit jamais sortir de SQLite.",
  });
  const initialLink = {
    id: "11111111-1111-5111-8111-111111111111",
    title: "Lien existant",
    url: "https://example.org/existing",
    category: "Développement web",
    added: "2026-08-10",
    description: "Catalogue initial",
    tags: ["Web"],
  };
  const publishedLink = {
    id: stableLinkId(draft.url),
    title: draft.title,
    url: draft.url,
    category: draft.category,
    added: "2026-08-17",
    description: draft.description,
    tags: draft.tags,
  };
  let committed = false;
  let commitCalls = 0;
  const dependencies = {
    readRepositoryHead: async () => ({
      commitSha: committed ? "committed-sha" : "initial-sha",
      treeSha: committed ? "committed-tree" : "initial-tree",
      links: committed ? [publishedLink, initialLink] : [initialLink],
    }),
    tryReadRepositoryFile: async (path: string) =>
      committed && path === "content/archives/2026-08-17.md"
        ? "published archive"
        : null,
    buildPublicationFiles: async () => ({
      files: {
        "data/links.json": "[]",
        "content/archives/2026-08-17.md": "archive",
      },
      linkIdsByDraft: new Map([[draft.id, publishedLink.id]]),
    }),
    commitRepositoryFiles: async () => {
      commitCalls += 1;
      committed = true;
      return "committed-sha";
    },
  };
  const input = {
    requestId: "11111111-1111-4111-8111-111111111111",
    draftIds: [draft.id],
    digestDate: "2026-08-17",
    title: "Web Digest — 17 août 2026",
    introduction: "Une édition récupérable.",
    seoDescription: "Une édition de test.",
  };
  const service = new CurationService(store, dependencies);

  await assert.rejects(service.publish(input), /simulated SQLite write failure/);
  assert.equal(commitCalls, 1);
  assert.equal(store.findPublication(input.requestId)?.state, "committing");
  assert.equal(store.findDraft(draft.id)?.state, "publishing");

  const restarted = new CurationService(store, dependencies);
  const recovered = await restarted.publish(input);
  assert.equal(recovered.state, "validating");
  assert.equal(recovered.commitSha, "committed-sha");
  assert.equal(store.findDraft(draft.id)?.state, "published");
  assert.equal(store.findDraft(draft.id)?.publishedLinkId, publishedLink.id);
  assert.equal(commitCalls, 1);
  database.close();
});

test("an ambiguous GitHub branch update keeps the publication recoverable", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const draft = store.createDraft({
    url: "https://example.com/ambiguous-github-publication",
    title: "Publication GitHub ambiguë",
    category: "Développement web",
    description: "Le brouillon doit rester réservé.",
    tags: ["Fiabilité"],
    privateNote: "",
  });
  const dependencies = {
    readRepositoryHead: async () => ({
      commitSha: "initial-sha",
      treeSha: "initial-tree",
      links: [
        {
          id: "33333333-3333-5333-8333-333333333333",
          title: "Lien existant",
          url: "https://example.org/existing-ambiguous",
          category: "Développement web",
          added: "2026-08-10",
          description: "Catalogue initial",
          tags: ["Fiabilité"],
        },
      ],
    }),
    tryReadRepositoryFile: async () => null,
    buildPublicationFiles: async () => ({
      files: {
        "data/links.json": "[]",
        "content/archives/2026-08-18.md": "archive",
      },
      linkIdsByDraft: new Map([[draft.id, stableLinkId(draft.url)]]),
    }),
    commitRepositoryFiles: async () => {
      throw new GitHubMutationOutcomeUnknownError("update branch");
    },
  };
  const service = new CurationService(store, dependencies);
  const input = {
    requestId: "22222222-2222-4222-8222-222222222222",
    draftIds: [draft.id],
    digestDate: "2026-08-18",
    title: "Web Digest — 18 août 2026",
    introduction: "Une publication au résultat distant incertain.",
    seoDescription: "Test du délai GitHub.",
  };

  await assert.rejects(
    service.publish(input),
    GitHubMutationOutcomeUnknownError,
  );
  assert.equal(
    store.findPublication("22222222-2222-4222-8222-222222222222")?.state,
    "committing",
  );
  assert.equal(
    store.findPublication(input.requestId)?.errorCode,
    "GITHUB_COMMIT_OUTCOME_UNKNOWN",
  );
  assert.equal(store.findDraft(draft.id)?.state, "publishing");

  const stillAmbiguous = await new CurationService(store, dependencies).publish(input);
  assert.equal(stillAmbiguous.state, "committing");
  assert.equal(store.findDraft(draft.id)?.state, "publishing");

  database
    .prepare("UPDATE digest_publications SET updated_at = ? WHERE id = ?")
    .run("2026-08-17T00:00:00.000Z", input.requestId);
  const reconciled = await new CurationService(store, dependencies).publish(input);
  assert.equal(reconciled.state, "failed");
  assert.equal(reconciled.errorCode, "GITHUB_COMMIT_NOT_FOUND");
  assert.equal(store.findDraft(draft.id)?.state, "draft");
  database.close();
});

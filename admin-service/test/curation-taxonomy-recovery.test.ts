import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import type { CurationStore as CurationStoreType } from "../src/curation-db.js";
import type { DigestTagDefinition } from "../src/tag-taxonomy.js";

process.env.NODE_ENV = "test";
process.env.BETTER_AUTH_URL = "https://digest.ooblik.com";
process.env.BETTER_AUTH_SECRET = "a-secure-test-secret-that-is-long-enough";
process.env.BETTER_AUTH_DATABASE = "curation-taxonomy-test.sqlite";
process.env.GITHUB_CLIENT_ID = "test-github-client";
process.env.GITHUB_CLIENT_SECRET = "test-github-secret";
process.env.GITHUB_APP_ID = "1";
process.env.GITHUB_APP_INSTALLATION_ID = "1";
process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = Buffer.from("unused").toString(
  "base64",
);

const { CurationStore } = await import("../src/curation-db.js");
const { CurationService } = await import("../src/curation.js");
const { GitHubMutationOutcomeUnknownError } = await import("../src/github.js");

class FailingPostCommitTaxonomyStore extends CurationStore {
  failApplyingUpdate = true;

  override updateTaxonomyMutation(
    id: string,
    values: Parameters<CurationStoreType["updateTaxonomyMutation"]>[1],
  ) {
    if (values.state === "applying" && this.failApplyingUpdate) {
      this.failApplyingUpdate = false;
      throw new Error("simulated taxonomy SQLite failure");
    }
    return super.updateTaxonomyMutation(id, values);
  }
}

const link = (category: string, tags: string[]) => ({
  id: "11111111-1111-5111-8111-111111111111",
  title: "Lien existant",
  url: "https://example.com/taxonomy",
  category,
  added: "2026-08-28",
  description: "Une ressource de test.",
  tags,
});

type TestHead = {
  commitSha: string;
  treeSha: string;
  links: ReturnType<typeof link>[];
  categories: Array<{ name: string; description: string }>;
  tags: DigestTagDefinition[];
};

const dependencies = (
  readHead: () => Promise<TestHead>,
  commit: () => Promise<string>,
) => ({
  readRepositoryHead: readHead,
  tryReadRepositoryFile: async () => null,
  buildPublicationFiles: async () => {
    throw new Error("unused publication builder");
  },
  commitRepositoryFiles: commit,
});

test("a timed-out category rename is recovered once after restart", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const draft = store.createDraft({
    url: "https://example.com/category-draft",
    title: "Brouillon catégorie",
    category: "Ancienne",
    description: "À migrer une seule fois.",
    tags: [],
    privateNote: "",
  });
  const requestId = "11111111-1111-4111-8111-111111111111";
  let head: TestHead = {
    commitSha: "initial-sha",
    treeSha: "initial-tree",
    links: [link("Ancienne", [])],
    categories: [{ name: "Ancienne", description: "Avant" }],
    tags: [],
  };
  let commitCalls = 0;
  const repository = dependencies(
    async () => structuredClone(head),
    async () => {
      commitCalls += 1;
      const result = store.findTaxonomyMutation(requestId)!.result;
      head = {
        ...head,
        commitSha: "category-sha",
        treeSha: "category-tree",
        links: [link("Nouvelle", [])],
        categories: structuredClone(
          result.categories as Array<{ name: string; description: string }>,
        ),
      };
      throw new GitHubMutationOutcomeUnknownError("update ref");
    },
  );

  await assert.rejects(
    new CurationService(store, repository).renameCategory(
      "Ancienne",
      "Nouvelle",
      "Après",
      requestId,
    ),
    GitHubMutationOutcomeUnknownError,
  );
  assert.equal(store.findDraft(draft.id)?.category, "Ancienne");
  assert.equal(store.findTaxonomyMutation(requestId)?.state, "committing");

  const restartedStore = new CurationStore(database);
  const restarted = new CurationService(restartedStore, repository);
  const recovered = await restarted.renameCategory(
    "Ancienne",
    "Nouvelle",
    "Après",
    requestId,
  );
  assert.equal("commit" in recovered ? recovered.commit : null, "category-sha");
  assert.deepEqual(recovered.migrated, { links: 1, drafts: 1 });
  assert.equal(restartedStore.findDraft(draft.id)?.category, "Nouvelle");
  assert.equal(restartedStore.findTaxonomyMutation(requestId)?.state, "complete");

  const repeated = await restarted.renameCategory(
    "Ancienne",
    "Nouvelle",
    "Après",
    requestId,
  );
  assert.deepEqual(repeated.migrated, recovered.migrated);
  assert.equal(commitCalls, 1);
  database.close();
});

test("a tag rename survives a post-commit SQLite failure", async () => {
  const database = new Database(":memory:");
  const store = new FailingPostCommitTaxonomyStore(database);
  const draft = store.createDraft({
    url: "https://example.com/tag-rename-draft",
    title: "Brouillon tag",
    category: "Design",
    description: "À renommer.",
    tags: ["voiture"],
    privateNote: "",
  });
  const requestId = "22222222-2222-4222-8222-222222222222";
  let head: TestHead = {
    commitSha: "initial-sha",
    treeSha: "initial-tree",
    links: [link("Design", ["voiture"])],
    categories: [{ name: "Design", description: "" }],
    tags: [{ name: "voiture", description: "Avant", aliases: [] }],
  };
  let commitCalls = 0;
  const repository = dependencies(
    async () => structuredClone(head),
    async () => {
      commitCalls += 1;
      const result = store.findTaxonomyMutation(requestId)!.result;
      head = {
        ...head,
        commitSha: "rename-sha",
        treeSha: "rename-tree",
        links: [link("Design", ["automobile"])],
        tags: [structuredClone(result.theme) as typeof head.tags[number]],
      };
      return "rename-sha";
    },
  );

  await assert.rejects(
    new CurationService(store, repository).updateTheme(
      "voiture",
      { name: "automobile", description: "Après", aliases: [] },
      requestId,
    ),
    /simulated taxonomy SQLite failure/,
  );
  assert.deepEqual(store.findDraft(draft.id)?.tags, ["voiture"]);

  const restartedStore = new CurationStore(database);
  const restarted = new CurationService(restartedStore, repository);
  const recovered = await restarted.updateTheme(
    "voiture",
    { name: "automobile", description: "Après", aliases: [] },
    requestId,
  );
  assert.equal(recovered.migratedDrafts, 1);
  assert.deepEqual(restartedStore.findDraft(draft.id)?.tags, ["automobile"]);
  assert.equal(
    restartedStore.findTaxonomyMutation(requestId)?.state,
    "complete",
  );

  await restarted.updateTheme(
    "voiture",
    { name: "automobile", description: "Après", aliases: [] },
    requestId,
  );
  assert.equal(commitCalls, 1);
  database.close();
});

test("an ambiguous tag merge resumes idempotently after restart", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const draft = store.createDraft({
    url: "https://example.com/tag-merge-draft",
    title: "Brouillon fusion",
    category: "Design",
    description: "À fusionner.",
    tags: ["car", "culture"],
    privateNote: "",
  });
  const requestId = "33333333-3333-4333-8333-333333333333";
  let head: TestHead = {
    commitSha: "initial-sha",
    treeSha: "initial-tree",
    links: [link("Design", ["car"])],
    categories: [{ name: "Design", description: "" }],
    tags: [
      { name: "car", description: "Source", aliases: [] },
      { name: "automobile", description: "Cible", aliases: [] },
    ],
  };
  let commitCalls = 0;
  const repository = dependencies(
    async () => structuredClone(head),
    async () => {
      commitCalls += 1;
      const result = store.findTaxonomyMutation(requestId)!.result;
      head = {
        ...head,
        commitSha: "merge-sha",
        treeSha: "merge-tree",
        links: [link("Design", ["automobile"])],
        tags: [structuredClone(result.theme) as typeof head.tags[number]],
      };
      throw new GitHubMutationOutcomeUnknownError("update ref");
    },
  );

  await assert.rejects(
    new CurationService(store, repository).updateTheme(
      "car",
      { name: "automobile", description: "", aliases: [] },
      requestId,
    ),
    GitHubMutationOutcomeUnknownError,
  );
  const restartedStore = new CurationStore(database);
  const recovered = await new CurationService(
    restartedStore,
    repository,
  ).updateTheme(
    "car",
    { name: "automobile", description: "", aliases: [] },
    requestId,
  );
  assert.equal(recovered.merged, true);
  assert.equal(recovered.migratedDrafts, 1);
  assert.deepEqual(restartedStore.findDraft(draft.id)?.tags, [
    "automobile",
    "culture",
  ]);
  assert.equal(commitCalls, 1);
  database.close();
});

test("an ambiguous tag archive removes draft tags once after restart", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const draft = store.createDraft({
    url: "https://example.com/tag-archive-draft",
    title: "Brouillon archive",
    category: "Design",
    description: "À nettoyer.",
    tags: ["éphémère", "culture"],
    privateNote: "",
  });
  const requestId = "44444444-4444-4444-8444-444444444444";
  let head: TestHead = {
    commitSha: "initial-sha",
    treeSha: "initial-tree",
    links: [link("Design", ["éphémère"])],
    categories: [{ name: "Design", description: "" }],
    tags: [{ name: "éphémère", description: "", aliases: [] }],
  };
  let commitCalls = 0;
  const repository = dependencies(
    async () => structuredClone(head),
    async () => {
      commitCalls += 1;
      head = {
        ...head,
        commitSha: "archive-sha",
        treeSha: "archive-tree",
        tags: [{ ...head.tags[0]!, active: false }],
      };
      throw new GitHubMutationOutcomeUnknownError("update ref");
    },
  );

  await assert.rejects(
    new CurationService(store, repository).archiveTheme("éphémère", requestId),
    GitHubMutationOutcomeUnknownError,
  );
  const restartedStore = new CurationStore(database);
  const restarted = new CurationService(restartedStore, repository);
  const recovered = await restarted.archiveTheme("éphémère", requestId);
  assert.equal(recovered.removedDrafts, 1);
  assert.deepEqual(restartedStore.findDraft(draft.id)?.tags, ["culture"]);

  const repeated = await restarted.archiveTheme("éphémère", requestId);
  assert.equal(repeated.removedDrafts, 1);
  assert.equal(commitCalls, 1);
  database.close();
});

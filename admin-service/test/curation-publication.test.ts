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
const { CurationError, CurationService, publicationIsLive } = await import(
  "../src/curation.js"
);
const { GitHubMutationOutcomeUnknownError, GitHubResponseError } = await import("../src/github.js");
const { stableLinkId } = await import("../src/publication.js");

const publicationCheckFixture: DigestPublication = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  digestDate: "2026-08-28",
  title: "Digest borné",
  introduction: "",
  seoDescription: "",
  action: "publish",
  source: "curation",
  state: "deploying",
  commitSha: "commit-sha",
  validateUrl: null,
  deployUrl: null,
  errorCode: null,
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
  lastCheckedAt: null,
};

test("the live check bounds a stalled origin connection", async () => {
  let aborted = false;
  const fetcher = (_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new DOMException("Aborted", "AbortError"));
      });
    });

  assert.equal(
    await publicationIsLive(publicationCheckFixture, {
      fetcher: fetcher as typeof fetch,
      timeoutMs: 10,
    }),
    false,
  );
  assert.equal(aborted, true);
});

test("the live check bounds a response body that stops producing data", async () => {
  let bodyAborted = false;
  const fetcher = async (_input: string | URL | Request, init?: RequestInit) =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("<main>"));
          init?.signal?.addEventListener("abort", () => {
            bodyAborted = true;
            controller.error(new DOMException("Aborted", "AbortError"));
          });
        },
      }),
      { status: 200 },
    );

  assert.equal(
    await publicationIsLive(publicationCheckFixture, {
      fetcher: fetcher as typeof fetch,
      timeoutMs: 10,
    }),
    false,
  );
  assert.equal(bodyAborted, true);
});

test("the live check rejects an excessive HTML response", async () => {
  const fetcher = async () =>
    new Response(`<main>${"x".repeat(128)}</main>`, { status: 200 });

  assert.equal(
    await publicationIsLive(publicationCheckFixture, {
      fetcher: fetcher as typeof fetch,
      timeoutMs: 100,
      maximumBytes: 64,
    }),
    false,
  );
});

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

test("publication revalidates stale aliases and accepts an empty theme list", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const aliased = store.createDraft({
    url: "https://example.com/automobile",
    title: "Automobile",
    category: "Design",
    description: "Un brouillon créé avant le registre actif.",
    tags: ["car"],
    privateNote: "",
  });
  const untagged = store.createDraft({
    url: "https://example.com/sans-theme",
    title: "Sans thème",
    category: "Design",
    description: "La catégorie suffit.",
    tags: [],
    privateNote: "",
  });
  let publishedTags: string[][] = [];
  const dependencies = {
    readRepositoryHead: async () => ({
      commitSha: "initial-sha",
      treeSha: "initial-tree",
      links: [],
      categories: [{ name: "Design", description: "" }],
      tags: [{ name: "automobile", description: "", aliases: ["car"] }],
    }),
    tryReadRepositoryFile: async () => null,
    buildPublicationFiles: async (input: { drafts: Array<{ id: string; tags: string[] }> }) => {
      publishedTags = input.drafts.map((draft) => draft.tags);
      return {
        files: { "data/links.json": "[]", "content/archives/2026-08-20.md": "archive" },
        linkIdsByDraft: new Map(input.drafts.map((draft) => [draft.id, draft.id])),
      };
    },
    commitRepositoryFiles: async () => "committed-sha",
  };
  const publication = await new CurationService(store, dependencies).publish({
    requestId: "77777777-7777-4777-8777-777777777777",
    draftIds: [aliased.id, untagged.id],
    digestDate: "2026-08-20",
    title: "20 août 2026",
    introduction: "Une édition avec des thèmes facultatifs.",
    seoDescription: "Une édition de test.",
  });
  assert.equal(publication.state, "validating");
  assert.deepEqual(publishedTags, [["automobile"], []]);
  database.close();
});

test("a failed publication is reconciled when its archive is already live", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const id = "88888888-8888-4888-8888-888888888888";
  store.createPublication({
    id,
    digestDate: "2026-08-20",
    title: "20 août 2026",
    introduction: "Une édition finalement mise en ligne.",
    seoDescription: "Une édition de test.",
  });
  store.updatePublication(id, {
    state: "failed",
    commitSha: "failed-workflow-sha",
    deployUrl: "https://github.com/example/actions/runs/1",
    errorCode: "WORKFLOW_FAILED",
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("<main><h1>20 août 2026</h1></main>", { status: 200 });

  try {
    const publication = await new CurationService(store).refreshPublication(id);

    assert.equal(publication.state, "live");
    assert.equal(publication.errorCode, null);
    assert.equal(publication.deployUrl, "https://github.com/example/actions/runs/1");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("a failed publication stays failed when the expected archive is absent", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const id = "99999999-9999-4999-8999-999999999999";
  store.createPublication({
    id,
    digestDate: "2026-08-21",
    title: "21 août 2026",
    introduction: "Une édition encore absente.",
    seoDescription: "Une édition de test.",
  });
  store.updatePublication(id, {
    state: "failed",
    commitSha: "failed-workflow-sha",
    errorCode: "WORKFLOW_FAILED",
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Not found", { status: 404 });

  try {
    const publication = await new CurationService(store).refreshPublication(id);

    assert.equal(publication.state, "failed");
    assert.equal(publication.errorCode, "WORKFLOW_FAILED");
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("a timed-out live check leaves the next polling attempt recoverable", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const id = "abababab-abab-4bab-8bab-abababababab";
  store.createPublication({
    id,
    digestDate: "2026-08-22",
    title: "22 août 2026",
    introduction: "Une édition récupérable.",
    seoDescription: "Une édition de test.",
  });
  store.updatePublication(id, {
    state: "failed",
    commitSha: "failed-workflow-sha",
    errorCode: "WORKFLOW_FAILED",
  });
  let checks = 0;
  const dependencies = {
    readRepositoryHead: async () => ({
      commitSha: "failed-workflow-sha",
      treeSha: "tree-sha",
      links: [],
    }),
    tryReadRepositoryFile: async () => null,
    buildPublicationFiles: async () => {
      throw new Error("unused publication builder");
    },
    commitRepositoryFiles: async () => {
      throw new Error("unused repository commit");
    },
    publicationIsLive: async () => {
      checks += 1;
      return checks > 1;
    },
  };
  const service = new CurationService(store, dependencies);

  const timedOut = await service.refreshPublication(id);
  assert.equal(timedOut.state, "failed");
  assert.equal(timedOut.errorCode, "WORKFLOW_FAILED");

  const recovered = await service.refreshPublication(id);
  assert.equal(recovered.state, "live");
  assert.equal(recovered.errorCode, null);
  assert.equal(checks, 2);
  database.close();
});

test("a failure before the GitHub commit restores every reserved draft", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const draft = store.createDraft({
    url: "https://example.com/pre-commit-failure",
    title: "Échec avant commit",
    category: "Développement web",
    description: "Le brouillon redevient disponible.",
    tags: ["Tests"],
    privateNote: "reste privée",
  });
  const dependencies = {
    readRepositoryHead: async () => ({
      commitSha: "initial-sha",
      treeSha: "initial-tree",
      links: [{
        id: "44444444-4444-5444-8444-444444444444",
        title: "Lien initial",
        url: "https://example.org/pre-commit-catalog",
        category: "Développement web",
        added: "2026-08-10",
        description: "Catalogue initial",
        tags: ["Tests"],
      }],
    }),
    tryReadRepositoryFile: async () => null,
    buildPublicationFiles: async () => ({
      files: { "data/links.json": "[]" },
      linkIdsByDraft: new Map([[draft.id, stableLinkId(draft.url)]]),
    }),
    commitRepositoryFiles: async () => {
      throw new GitHubResponseError("upstream unavailable", 503);
    },
  };
  const input = {
    requestId: "44444444-4444-4444-8444-444444444444",
    draftIds: [draft.id],
    digestDate: "2026-08-19",
    title: "Web Digest — 19 août 2026",
    introduction: "Échec injecté avant commit.",
    seoDescription: "Test avant commit.",
  };

  await assert.rejects(
    new CurationService(store, dependencies).publish(input),
    GitHubResponseError,
  );
  assert.equal(store.findPublication(input.requestId)?.state, "failed");
  assert.equal(store.findPublication(input.requestId)?.errorCode, "PUBLISH_FAILED");
  assert.equal(store.findDraft(draft.id)?.state, "draft");
  assert.equal(store.findDraft(draft.id)?.publicationId, null);
  database.close();
});

test("a timed-out GitHub update that lands is recovered after restart without a second commit", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const draft = store.createDraft({
    url: "https://example.com/timeout-that-landed",
    title: "Timeout appliqué",
    category: "Développement web",
    description: "La reprise retrouve le commit distant.",
    tags: ["Tests"],
    privateNote: "",
  });
  const publishedLink = {
    id: stableLinkId(draft.url),
    title: draft.title,
    url: draft.url,
    category: draft.category,
    added: "2026-08-20",
    description: draft.description,
    tags: draft.tags,
  };
  let landed = false;
  let commitCalls = 0;
  const dependencies = {
    readRepositoryHead: async () => ({
      commitSha: landed ? "landed-sha" : "initial-sha",
      treeSha: landed ? "landed-tree" : "initial-tree",
      links: landed
        ? [publishedLink]
        : [{
            ...publishedLink,
            id: "55555555-5555-5555-8555-555555555555",
            url: "https://example.org/timeout-catalog",
            added: "2026-08-10",
          }],
    }),
    tryReadRepositoryFile: async (path: string) =>
      landed && path === "content/archives/2026-08-20.md" ? "archive" : null,
    buildPublicationFiles: async () => ({
      files: { "data/links.json": "[]" },
      linkIdsByDraft: new Map([[draft.id, publishedLink.id]]),
    }),
    commitRepositoryFiles: async () => {
      commitCalls += 1;
      landed = true;
      throw new GitHubMutationOutcomeUnknownError("update branch");
    },
  };
  const input = {
    requestId: "55555555-5555-4555-8555-555555555555",
    draftIds: [draft.id],
    digestDate: "2026-08-20",
    title: "Web Digest — 20 août 2026",
    introduction: "Timeout distant appliqué.",
    seoDescription: "Test de reprise après timeout.",
  };

  await assert.rejects(
    new CurationService(store, dependencies).publish(input),
    GitHubMutationOutcomeUnknownError,
  );
  const recovered = await new CurationService(store, dependencies).publish(input);
  assert.equal(recovered.state, "validating");
  assert.equal(recovered.commitSha, "landed-sha");
  assert.equal(store.findDraft(draft.id)?.state, "published");
  assert.equal(commitCalls, 1);
  database.close();
});

test("a concurrent GitHub update rebuilds once on the fresh repository head", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const draft = store.createDraft({
    url: "https://example.com/concurrent-publication",
    title: "Publication concurrente",
    category: "Développement web",
    description: "Le lot est reconstruit sur la nouvelle tête.",
    tags: ["Tests"],
    privateNote: "",
  });
  const initialLink = {
    id: "66666666-6666-5666-8666-666666666666",
    title: "Lien initial",
    url: "https://example.org/concurrent-catalog",
    category: "Développement web",
    added: "2026-08-10",
    description: "Catalogue initial",
    tags: ["Tests"],
  };
  const competingLink = {
    ...initialLink,
    id: "77777777-7777-5777-8777-777777777777",
    title: "Lien concurrent",
    url: "https://example.org/competing-link",
  };
  let headReads = 0;
  let builds = 0;
  const parents: string[] = [];
  const dependencies = {
    readRepositoryHead: async () => {
      headReads += 1;
      return headReads === 1
        ? { commitSha: "initial-sha", treeSha: "initial-tree", links: [initialLink] }
        : { commitSha: "fresh-sha", treeSha: "fresh-tree", links: [competingLink, initialLink] };
    },
    tryReadRepositoryFile: async () => null,
    buildPublicationFiles: async ({ currentLinks }: { currentLinks: unknown[] }) => {
      builds += 1;
      assert.equal(currentLinks.length, builds === 1 ? 1 : 2);
      return {
        files: { "data/links.json": "[]" },
        linkIdsByDraft: new Map([[draft.id, stableLinkId(draft.url)]]),
      };
    },
    commitRepositoryFiles: async (parentSha: string) => {
      parents.push(parentSha);
      if (parents.length === 1) {
        throw new GitHubResponseError("ref changed", 422);
      }
      return "publication-sha";
    },
  };

  const publication = await new CurationService(store, dependencies).publish({
    requestId: "66666666-6666-4666-8666-666666666666",
    draftIds: [draft.id],
    digestDate: "2026-08-21",
    title: "Web Digest — 21 août 2026",
    introduction: "Concurrence GitHub injectée.",
    seoDescription: "Test de reconstruction concurrente.",
  });
  assert.equal(publication.state, "validating");
  assert.equal(publication.commitSha, "publication-sha");
  assert.deepEqual(parents, ["initial-sha", "fresh-sha"]);
  assert.equal(builds, 2);
  assert.equal(store.findDraft(draft.id)?.state, "published");
  database.close();
});

test("two concurrent requests cannot publish the same draft twice", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const draft = store.createDraft({
    url: "https://example.com/same-draft-race",
    title: "Brouillon concurrent",
    category: "Développement web",
    description: "Une seule requête atteint GitHub.",
    tags: ["Tests"],
    privateNote: "",
  });
  let releaseCommit!: () => void;
  let signalCommitStarted!: () => void;
  const commitStarted = new Promise<void>((resolve) => {
    signalCommitStarted = resolve;
  });
  const commitReleased = new Promise<void>((resolve) => {
    releaseCommit = resolve;
  });
  let commitCalls = 0;
  const dependencies = {
    readRepositoryHead: async () => ({
      commitSha: "initial-sha",
      treeSha: "initial-tree",
      links: [{
        id: "88888888-8888-5888-8888-888888888888",
        title: "Lien initial",
        url: "https://example.org/same-draft-catalog",
        category: "Développement web",
        added: "2026-08-10",
        description: "Catalogue initial",
        tags: ["Tests"],
      }],
    }),
    tryReadRepositoryFile: async () => null,
    buildPublicationFiles: async () => ({
      files: { "data/links.json": "[]" },
      linkIdsByDraft: new Map([[draft.id, stableLinkId(draft.url)]]),
    }),
    commitRepositoryFiles: async () => {
      commitCalls += 1;
      signalCommitStarted();
      await commitReleased;
      return "single-publication-sha";
    },
  };
  const service = new CurationService(store, dependencies);
  const baseInput = {
    draftIds: [draft.id],
    digestDate: "2026-08-22",
    title: "Web Digest — 22 août 2026",
    introduction: "Course applicative injectée.",
    seoDescription: "Test de publication concurrente.",
  };

  const first = service.publish({
    ...baseInput,
    requestId: "88888888-8888-4888-8888-888888888888",
  });
  await commitStarted;
  await assert.rejects(
    service.publish({
      ...baseInput,
      requestId: "99999999-9999-4999-8999-999999999999",
    }),
    (error: unknown) =>
      error instanceof CurationError && error.code === "DRAFT_NOT_AVAILABLE",
  );
  releaseCommit();
  const published = await first;
  assert.equal(published.commitSha, "single-publication-sha");
  assert.equal(commitCalls, 1);
  assert.equal(store.findDraft(draft.id)?.state, "published");
  database.close();
});

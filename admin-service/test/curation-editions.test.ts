import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { parseCatalog, type DigestLink } from "../src/catalog.js";
import { parseEdition, renderEdition } from "../src/editions.js";

process.env.NODE_ENV = "test";
process.env.BETTER_AUTH_URL = "https://digest.ooblik.com";
process.env.BETTER_AUTH_SECRET = "a-secure-test-secret-that-is-long-enough";
process.env.BETTER_AUTH_DATABASE = "curation-editions-test.sqlite";
process.env.GITHUB_CLIENT_ID = "test-github-client";
process.env.GITHUB_CLIENT_SECRET = "test-github-secret";
process.env.GITHUB_APP_ID = "1";
process.env.GITHUB_APP_INSTALLATION_ID = "1";
process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = Buffer.from("unused").toString("base64");

const { CurationService } = await import("../src/curation.js");
const { CurationStore } = await import("../src/curation-db.js");
const { GitHubMutationOutcomeUnknownError } = await import("../src/github.js");

const digestDate = "2026-08-29";
const editionPath = `content/archives/${digestDate}.md`;

const link = (
  id: string,
  visibility?: "draft" | "editorial",
): DigestLink => ({
  id,
  title: `Lien ${id}`,
  url: `https://${id}.example.com`,
  category: "IA & Agents",
  added: digestDate,
  description: "Description",
  ...(visibility
    ? {
        visibility: "hidden" as const,
        visibility_reason:
          visibility === "draft" ? "edition-draft" as const : "editorial" as const,
        hidden_at: "2026-08-28T12:00:00.000Z",
      }
    : {}),
});

const source = (draft: boolean): string =>
  renderEdition({
    digestDate,
    title: "Après l’IDE, voici l’ADE",
    description: "Une édition sur les environnements agentiques.",
    introduction: "Une introduction.",
    draft: draft ? true : undefined,
  });

const editionDependencies = (
  currentSource: string,
  currentLinks: DigestLink[],
) => {
  let committedFiles: Record<string, string | Buffer | null> | undefined;
  return {
    dependencies: {
      readRepositoryHead: async () => ({
        commitSha: "initial-sha",
        treeSha: "initial-tree",
        links: currentLinks,
      }),
      tryReadRepositoryFile: async (path: string) =>
        path === editionPath ? currentSource : null,
      listRepositoryDirectory: async (): Promise<
        { name: string; path: string; type: string }[]
      > => [],
      commitRepositoryFiles: async (
        _commitSha: string,
        _treeSha: string,
        files: Record<string, string | Buffer | null>,
      ) => {
        committedFiles = files;
        return "committed-sha";
      },
      generateOptimizedSocialImage: async () => Buffer.from("social"),
      generateOptimizedLinkedInImage: async () => Buffer.from("linkedin"),
    },
    files: () => committedFiles,
  };
};

test("edition summaries expose lifecycle state and link counts", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const fixture = editionDependencies(source(true), [
    link("staged", "draft"),
    link("withdrawn", "editorial"),
  ]);
  fixture.dependencies.listRepositoryDirectory = async () => [
    {
      name: `${digestDate}.md`,
      path: editionPath,
      type: "file",
    },
  ];
  const service = new CurationService(store, undefined, fixture.dependencies);

  assert.deepEqual(await service.listEditions(), [
    {
      date: digestDate,
      state: "draft",
      linkCount: 2,
      visibleLinkCount: 0,
      stagedLinkCount: 1,
    },
  ]);
  assert.deepEqual(await service.getEdition(digestDate), {
    ...parseEdition(source(true)),
    state: "draft",
    linkCount: 2,
    visibleLinkCount: 0,
    stagedLinkCount: 1,
  });
  database.close();
});

test("edition details report inconsistent Markdown and catalog states", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const fixture = editionDependencies(source(false), [link("staged", "draft")]);
  const service = new CurationService(store, undefined, fixture.dependencies);

  const edition = await service.getEdition(digestDate);

  assert.equal(edition.state, "inconsistent");
  assert.equal(edition.visibleLinkCount, 0);
  database.close();
});

test("publishing a draft edition restores only its staged links atomically", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const fixture = editionDependencies(source(true), [
    link("staged", "draft"),
    link("withdrawn", "editorial"),
  ]);
  const service = new CurationService(store, undefined, fixture.dependencies);

  const publication = await service.transitionEdition(digestDate, {
    requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    action: "publish",
  });

  assert.equal(publication.source, "edition");
  assert.equal(publication.action, "publish");
  assert.equal(publication.state, "validating");
  assert.equal(publication.commitSha, "committed-sha");
  const files = fixture.files()!;
  assert.equal(parseEdition(String(files[editionPath])).draft, undefined);
  const links = parseCatalog(String(files["data/links.json"]));
  assert.equal(links[0]?.visibility, undefined);
  assert.equal(links[1]?.visibility, "hidden");
  assert.equal(links[1]?.visibility_reason, "editorial");
  assert.ok(Buffer.isBuffer(files[`static/social/${digestDate}.png`]));
  assert.ok(Buffer.isBuffer(files[`static/social/${digestDate}-linkedin.png`]));
  database.close();
});

test("unpublishing an edition stages visible links without changing editorial withdrawals", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const fixture = editionDependencies(source(false), [
    link("visible"),
    link("withdrawn", "editorial"),
  ]);
  const service = new CurationService(store, undefined, fixture.dependencies);

  const publication = await service.transitionEdition(digestDate, {
    requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    action: "unpublish",
  });

  assert.equal(publication.source, "edition");
  assert.equal(publication.action, "unpublish");
  assert.equal(publication.state, "validating");
  const files = fixture.files()!;
  assert.equal(parseEdition(String(files[editionPath])).draft, true);
  const links = parseCatalog(String(files["data/links.json"]));
  assert.equal(links[0]?.visibility, "hidden");
  assert.equal(links[0]?.visibility_reason, "edition-draft");
  assert.equal(links[1]?.visibility_reason, "editorial");
  database.close();
});

test("edition publication includes missing tag routes without replacing historical pages", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const fixture = editionDependencies(source(true), [
    { ...link("first", "draft"), tags: ["ADE", "source-available", "IA"] },
    { ...link("second", "draft"), tags: ["ADE", "ade", "historical alias"] },
    { ...link("withdrawn", "editorial"), tags: ["private-tag"] },
    { ...link("older"), added: "2026-08-20", tags: ["historical alias"] },
  ]);
  const reads: string[] = [];
  const service = new CurationService(store, undefined, {
    ...fixture.dependencies,
    tryReadRepositoryFile: async (path, ref) => {
      assert.equal(ref, "initial-sha");
      if (path === editionPath) return source(true);
      reads.push(path);
      return path === "content/tags/ia.md"
        ? '---\ntag: "IA"\ntags: ["IA"]\naliases: ["/tags/ia-generative/"]\n---\nTexte conservé.\n'
        : null;
    },
  });
  const request = {
    requestId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    action: "publish" as const,
  };
  await service.transitionEdition(digestDate, request);

  const files = fixture.files()!;
  assert.match(String(files["content/tags/ade.md"]), /tags: \["ADE","ade"\]/);
  assert.match(String(files["content/tags/source-available.md"]), /tag: "source-available"/);
  assert.equal(files["content/tags/ia.md"], undefined);
  assert.deepEqual(reads.sort(), [
    "content/tags/ade.md", "content/tags/ia.md", "content/tags/source-available.md",
  ]);
  assert.equal(files["content/tags/private-tag.md"], undefined);
  const readCount = reads.length;
  await service.transitionEdition(digestDate, request);
  assert.equal(reads.length, readCount);
  database.close();
});

test("edition publication aborts when a tag page cannot be checked", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const fixture = editionDependencies(source(true), [
    { ...link("staged", "draft"), tags: ["ADE"] },
  ]);
  const service = new CurationService(store, undefined, {
    ...fixture.dependencies,
    tryReadRepositoryFile: async (path) => {
      if (path === editionPath) return source(true);
      throw new Error("GitHub unavailable");
    },
  });
  await assert.rejects(service.transitionEdition(digestDate, {
    requestId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    action: "publish",
  }), /GitHub unavailable/);
  assert.equal(fixture.files(), undefined);
  database.close();
});

test("an ambiguous edition commit is recovered from the repository state", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  let currentSource = source(true);
  let currentLinks = [link("staged", "draft")];
  let commitSha = "initial-sha";
  let ambiguous = true;
  const dependencies = {
    readRepositoryHead: async () => ({
      commitSha,
      treeSha: "tree-sha",
      links: currentLinks,
    }),
    tryReadRepositoryFile: async (path: string) =>
      path === editionPath ? currentSource : null,
    listRepositoryDirectory: async () => [],
    commitRepositoryFiles: async () => {
      if (ambiguous) throw new GitHubMutationOutcomeUnknownError("commit");
      return "unexpected-second-commit";
    },
    generateOptimizedSocialImage: async () => Buffer.from("social"),
    generateOptimizedLinkedInImage: async () => Buffer.from("linkedin"),
  };
  const request = {
    requestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    action: "publish" as const,
  };
  const service = new CurationService(store, undefined, dependencies);

  await assert.rejects(
    service.transitionEdition(digestDate, request),
    GitHubMutationOutcomeUnknownError,
  );
  assert.equal(store.findPublication(request.requestId)?.state, "committing");

  ambiguous = false;
  commitSha = "recovered-sha";
  currentSource = source(false);
  currentLinks = [link("staged")];
  const recovered = await service.transitionEdition(digestDate, request);

  assert.equal(recovered.state, "validating");
  assert.equal(recovered.commitSha, "recovered-sha");
  database.close();
});

test("an unpublished edition is live when its public page returns 404", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const publication = store.createPublication({
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    digestDate,
    title: "Après l’IDE, voici l’ADE",
    introduction: "Introduction",
    seoDescription: "Description",
    action: "unpublish",
    source: "edition",
  });
  store.updatePublication(publication.id, {
    state: "failed",
    commitSha: "withdrawal-sha",
    errorCode: "WORKFLOW_FAILED",
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Not found", { status: 404 });

  try {
    const refreshed = await new CurationService(store).refreshPublication(
      publication.id,
    );
    assert.equal(refreshed.state, "live");
    assert.equal(refreshed.errorCode, null);
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});

test("edition validation keeps the transition commit when the repository advances", async () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const publication = store.createPublication({
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    digestDate,
    title: "Après l’IDE, voici l’ADE",
    introduction: "Introduction",
    seoDescription: "Description",
    action: "publish",
    source: "edition",
  });
  store.updatePublication(publication.id, {
    state: "validating",
    commitSha: "transition-sha",
  });
  const fixture = editionDependencies(source(false), [link("visible")]);
  fixture.dependencies.readRepositoryHead = async () => ({
    commitSha: "later-unrelated-sha",
    treeSha: "later-tree",
    links: [link("visible")],
  });
  const service = new CurationService(store, undefined, fixture.dependencies);

  const recovered = await service.transitionEdition(digestDate, {
    requestId: publication.id,
    action: "publish",
  });

  assert.equal(recovered.commitSha, "transition-sha");
  database.close();
});

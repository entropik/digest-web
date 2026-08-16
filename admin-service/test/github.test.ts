import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.BETTER_AUTH_URL = "https://digest.ooblik.com";
process.env.BETTER_AUTH_SECRET = "a-secure-test-secret-that-is-long-enough";
process.env.BETTER_AUTH_DATABASE = "test.sqlite";
process.env.GITHUB_CLIENT_ID = "test-client";
process.env.GITHUB_CLIENT_SECRET = "test-secret";
process.env.GITHUB_APP_ID = "1";
process.env.GITHUB_APP_INSTALLATION_ID = "1";
process.env.GITHUB_APP_PRIVATE_KEY_BASE64 =
  Buffer.from("not-used-in-these-tests").toString("base64");

const { createRepositoryHeadReader, repositoryBlobBody } = await import(
  "../src/github.js"
);

test("serializes text and binary Git blobs with the correct encoding", () => {
  assert.deepEqual(repositoryBlobBody("bonjour"), {
    content: "bonjour",
    encoding: "utf-8",
  });
  assert.deepEqual(repositoryBlobBody(Buffer.from([0, 255, 12])), {
    content: "AP8M",
    encoding: "base64",
  });
});

const catalog = JSON.stringify([
  {
    id: "link-1",
    title: "Exemple",
    url: "https://example.com",
    category: "Développement",
    tags: ["outil"],
    added: "2026-07-27",
  },
]);

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

test("reads the commit and catalog in parallel after resolving the ref", async () => {
  const events: string[] = [];
  const commit = deferred<{ sha: string; tree: { sha: string } }>();
  const links = deferred<string>();
  const reader = createRepositoryHeadReader({
    readRef: async () => {
      events.push("ref");
      return "commit-a";
    },
    readCommit: async (sha) => {
      events.push(`commit:${sha}`);
      return commit.promise;
    },
    readCatalog: async (sha) => {
      events.push(`catalog:${sha}`);
      return links.promise;
    },
  });

  const pending = reader.read();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["ref", "commit:commit-a", "catalog:commit-a"]);

  links.resolve(catalog);
  commit.resolve({ sha: "commit-a", tree: { sha: "tree-a" } });
  const head = await pending;
  assert.equal(head.commitSha, "commit-a");
  assert.equal(head.treeSha, "tree-a");
  assert.equal(head.links[0]?.id, "link-1");
});

test("reuses an immutable snapshot while still reading the ref freshly", async () => {
  let refReads = 0;
  let commitReads = 0;
  let catalogReads = 0;
  const reader = createRepositoryHeadReader({
    readRef: async () => {
      refReads += 1;
      return "commit-a";
    },
    readCommit: async () => {
      commitReads += 1;
      return { sha: "commit-a", tree: { sha: "tree-a" } };
    },
    readCatalog: async () => {
      catalogReads += 1;
      return catalog;
    },
  });

  const first = await reader.read();
  const second = await reader.read();

  assert.equal(first, second);
  assert.equal(refReads, 2);
  assert.equal(commitReads, 1);
  assert.equal(catalogReads, 1);
});

test("reloads the snapshot after invalidation even if the ref is unchanged", async () => {
  let commitReads = 0;
  let catalogReads = 0;
  const reader = createRepositoryHeadReader({
    readRef: async () => "commit-a",
    readCommit: async () => {
      commitReads += 1;
      return { sha: "commit-a", tree: { sha: "tree-a" } };
    },
    readCatalog: async () => {
      catalogReads += 1;
      return catalog;
    },
  });

  await reader.read();
  reader.invalidate();
  await reader.read();

  assert.equal(commitReads, 2);
  assert.equal(catalogReads, 2);
});

test("an in-flight read cannot repopulate a snapshot after invalidation", async () => {
  let commitReads = 0;
  let catalogReads = 0;
  const firstCommit = deferred<{ sha: string; tree: { sha: string } }>();
  const firstCatalog = deferred<string>();
  const reader = createRepositoryHeadReader({
    readRef: async () => "commit-a",
    readCommit: async () => {
      commitReads += 1;
      return commitReads === 1
        ? firstCommit.promise
        : { sha: "commit-a", tree: { sha: "tree-a" } };
    },
    readCatalog: async () => {
      catalogReads += 1;
      return catalogReads === 1 ? firstCatalog.promise : catalog;
    },
  });

  const staleRead = reader.read();
  await new Promise((resolve) => setImmediate(resolve));
  reader.invalidate();
  firstCommit.resolve({ sha: "commit-a", tree: { sha: "tree-a" } });
  firstCatalog.resolve(catalog);
  await staleRead;
  await reader.read();

  assert.equal(commitReads, 2);
  assert.equal(catalogReads, 2);
});

test("loads a new snapshot when main advances", async () => {
  const refs = ["commit-a", "commit-b"];
  const commits: string[] = [];
  const catalogs: string[] = [];
  const reader = createRepositoryHeadReader({
    readRef: async () => refs.shift() ?? "commit-b",
    readCommit: async (sha) => {
      commits.push(sha);
      return { sha, tree: { sha: `tree-${sha}` } };
    },
    readCatalog: async (sha) => {
      catalogs.push(sha);
      return catalog;
    },
  });

  await reader.read();
  const head = await reader.read();

  assert.equal(head.commitSha, "commit-b");
  assert.deepEqual(commits, ["commit-a", "commit-b"]);
  assert.deepEqual(catalogs, ["commit-a", "commit-b"]);
});

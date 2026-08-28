import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { CurationStore } from "../src/curation-db.js";

const draftInput = {
  url: "https://example.com/article",
  title: "Article",
  category: "Développement",
  description: "Résumé éditorial.",
  tags: ["web"],
  privateNote: "Ne doit jamais être publié.",
};

test("draft lifecycle retains a private audit record", () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const draft = store.createDraft(draftInput, new Date("2026-07-27T10:00:00Z"));
  assert.equal(draft.state, "draft");
  assert.equal(draft.privateNote, draftInput.privateNote);

  const publication = store.createPublication({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    digestDate: "2026-07-27",
    title: "27 juillet 2026",
    introduction: "Introduction",
    seoDescription: "Description",
  });
  assert.equal(publication.action, "publish");
  assert.equal(publication.source, "curation");
  store.markDraftsPublishing(
    [draft.id],
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );
  store.markDraftsPublished(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "commit",
    new Map([[draft.id, "bbbbbbbb-bbbb-5bbb-8bbb-bbbbbbbbbbbb"]]),
  );

  assert.equal(store.listDrafts().length, 0);
  const published = store.findDraft(draft.id)!;
  assert.equal(published.state, "published");
  assert.equal(published.privateNote, draftInput.privateNote);
  assert.equal(published.publishedCommit, "commit");
  database.close();
});

test("publication actions persist and legacy databases migrate to publish", () => {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE digest_publications (
      id TEXT PRIMARY KEY,
      digest_date TEXT NOT NULL,
      title TEXT NOT NULL,
      introduction TEXT NOT NULL,
      seo_description TEXT NOT NULL,
      state TEXT NOT NULL,
      commit_sha TEXT,
      validate_url TEXT,
      deploy_url TEXT,
      error_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_checked_at TEXT
    );
    INSERT INTO digest_publications
      (id, digest_date, title, introduction, seo_description, state,
       created_at, updated_at)
    VALUES
      ('legacy', '2026-07-26', 'Legacy', 'Introduction', 'Description',
       'live', '2026-07-26T10:00:00.000Z', '2026-07-26T10:00:00.000Z');
  `);

  const store = new CurationStore(database);
  assert.equal(store.findPublication("legacy")?.action, "publish");
  assert.equal(store.findPublication("legacy")?.source, "curation");

  const withdrawal = store.createPublication({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    digestDate: "2026-07-27",
    title: "27 juillet 2026",
    introduction: "Introduction",
    seoDescription: "Description",
    action: "unpublish",
    source: "edition",
  });
  assert.equal(withdrawal.action, "unpublish");
  assert.equal(withdrawal.source, "edition");
  database.close();
});

test("draft publishing transition is atomic", () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const draft = store.createDraft(draftInput);
  assert.throws(
    () =>
      store.markDraftsPublishing(
        [draft.id, "missing"],
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ),
    /DRAFT_NOT_AVAILABLE/,
  );
  assert.equal(store.findDraft(draft.id)!.state, "draft");
  database.close();
});

test("active draft categories can be counted and renamed", () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  store.createDraft(draftInput);

  assert.equal(store.countActiveDraftsByCategory("Développement"), 1);
  assert.equal(store.renameActiveDraftCategory("Développement", "Code"), 1);
  assert.equal(store.listDrafts()[0]?.category, "Code");
  database.close();
});

test("active draft themes can be renamed, merged and removed", () => {
  const database = new Database(":memory:");
  const store = new CurationStore(database);
  const draft = store.createDraft({ ...draftInput, tags: ["car", "web"] });

  assert.equal(store.countActiveDraftsByTag("car"), 1);
  assert.equal(store.countActiveDraftsByTag("absent"), 0);
  assert.equal(store.replaceActiveDraftTag("car", "automobile"), 1);
  assert.deepEqual(store.findDraft(draft.id)?.tags, ["automobile", "web"]);
  assert.equal(store.replaceActiveDraftTag("automobile", "web"), 1);
  assert.deepEqual(store.findDraft(draft.id)?.tags, ["web"]);
  assert.equal(store.replaceActiveDraftTag("web", null), 1);
  assert.deepEqual(store.findDraft(draft.id)?.tags, []);
  database.close();
});

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

  store.createPublication({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    digestDate: "2026-07-27",
    title: "27 juillet 2026",
    introduction: "Introduction",
    seoDescription: "Description",
  });
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

  assert.equal(store.replaceActiveDraftTag("car", "automobile"), 1);
  assert.deepEqual(store.findDraft(draft.id)?.tags, ["automobile", "web"]);
  assert.equal(store.replaceActiveDraftTag("automobile", "web"), 1);
  assert.deepEqual(store.findDraft(draft.id)?.tags, ["web"]);
  assert.equal(store.replaceActiveDraftTag("web", null), 1);
  assert.deepEqual(store.findDraft(draft.id)?.tags, []);
  database.close();
});

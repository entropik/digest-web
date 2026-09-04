import assert from "node:assert/strict";
import test from "node:test";
import { createPublicationPlan, validatePublicationPlan } from "../src/translation-publication.js";
import Database from "better-sqlite3";
import { TranslationStore } from "../src/translation-store.js";
import { manifestRevision, snapshotRevision, sourceHash, type TranslationManifest, type TranslationSnapshot } from "../src/translation-types.js";

const field = (source: string, text: string) => ({ hash: sourceHash(source, "text"), text });
const snapshot = (entries: TranslationSnapshot["entries"], artwork: NonNullable<TranslationSnapshot["artwork"]> = {}): TranslationSnapshot =>
  ({ version: 1, revision: snapshotRevision(entries, artwork), entries, artwork });

test("a v2 plan records changed fields, exact impacts and artwork changes", () => {
  const items = [
      { id: "link:1", kind: "link", title: "Lien", date: "2026-09-04", route: "/", group: "catalogue", dependencies: [],
        impacts: ["/", "/archives/2026-09-04/", "/archives/", "/tags/ia/"], fields: {} },
      { id: "page:/about", kind: "page", title: "À propos", date: "", route: "/about/", group: "foundation", dependencies: [], impacts: ["/about/"], fields: {} },
      { id: "page:/archives/2026-09-04", kind: "page", title: "Édition", date: "2026-09-04", route: "/archives/2026-09-04/", group: "archives", dependencies: [], impacts: ["/archives/", "/archives/2026-09-04/"], fields: {}, artwork: { date: "2026-09-04", linkCount: 2, editorialType: "focus" } },
    ] satisfies Extract<TranslationManifest, {version:2}>["items"];
  const manifest = { version: 2, revision: manifestRevision(items), items } satisfies TranslationManifest;
  const before = snapshot({ "link:1": { title: field("Lien", "Link") }, "page:/about": { title: field("À propos", "About") } },
    { "2026-09-03": { title: "Old", description: "Old", linkCount: 1, editorialType: "digest" } });
  const after = snapshot({ "link:1": { title: field("Lien", "Web link"), description: field("Résumé", "Summary") }, "page:/about": { title: field("À propos", "About") } },
    { "2026-09-04": { title: "New", description: "New", linkCount: 2, editorialType: "focus" } });
  const plan = createPublicationPlan(manifest, before, after);
  assert.deepEqual(plan.items, [{ id: "link:1", fields: ["description", "title"] }, { id: "page:/archives/2026-09-04", fields: ["$artwork"] }]);
  assert.deepEqual(plan.paths, ["/", "/archives/", "/archives/2026-09-04/", "/tags/ia/"]);
  assert.deepEqual(plan.artwork, { upsert: ["2026-09-04"], remove: ["2026-09-03"] });
  assert.equal(validatePublicationPlan(JSON.parse(JSON.stringify(plan))).revision, plan.revision);
});

test("a v1 manifest creates an explicit full-build plan", () => {
  const manifest = { version: 1, items: [{ id: "link:1", kind: "link", title: "Lien", date: "", route: "/", group: "catalogue", dependencies: [], fields: {} }] } satisfies TranslationManifest;
  const plan = createPublicationPlan(manifest, snapshot({}), snapshot({ "link:1": { title: field("Lien", "Link") } }));
  assert.equal(plan.fullBuild, true);
  assert.equal(plan.manifestRevision, "");
  assert.deepEqual(plan.paths, []);
});

test("SQLite resumes the exact prepared plan and snapshot after reconstruction", () => {
  const db = new Database(":memory:");
  const store = new TranslationStore(db);
  const items = [{ id: "link:1", kind: "link", title: "Lien", date: "", route: "/", group: "catalogue", dependencies: [], impacts: ["/"], fields: {} }] satisfies Extract<TranslationManifest, {version:2}>["items"];
  const manifest = { version: 2, revision: manifestRevision(items), items } satisfies TranslationManifest;
  store.sync(manifest);
  const prepared = store.preparePublication(snapshot({}), snapshot({ "link:1": { title: field("Lien", "Link") } }));
  const restarted = new TranslationStore(db).publicationDraft(prepared.plan.revision);
  assert.deepEqual(restarted, prepared);
  db.close();
});

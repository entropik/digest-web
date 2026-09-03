import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TranslationStore } from "../src/translation-store.js";
import { TranslationService } from "../src/translation-service.js";
import { DeepLClient, TranslationError, validateTranslation } from "../src/deepl.js";
import { sourceHash, type TranslationItem, type TranslationManifest, type TranslationSnapshot } from "../src/translation-types.js";

const item = (id: string, source = "Bonjour", date = "2026-09-01"): TranslationItem => ({
  id, title: id, kind: "page", date, route: "/archives/" + id + "/", group: "archives",
  dependencies: [], fields: { title: { source, format: "text", hash: sourceHash(source, "text") } },
});
const manifest = (...items: TranslationItem[]): TranslationManifest => ({ version: 1, items });
const fixture = () => {
  const db = new Database(":memory:");
  const store = new TranslationStore(db);
  store.quota(0, 1_000_000);
  return { db, store };
};
test("first inventory stays idle, first lot precedes history, later novelty wins and removed items disappear", () => {
  const { db, store } = fixture();
  const old = Array.from({ length: 12 }, (_, n) => item("old" + n, "texte" + n, "2020-01-" + String(n + 1).padStart(2, "0")));
  store.sync(manifest(...old));
  assert.equal(store.next(), undefined);
  store.start();
  assert.equal(store.next()?.itemId, "old11");
  const fresh = item("fresh", "nouveau", "2026-09-03");
  store.sync(manifest(...old, fresh));
  assert.equal(store.next()?.itemId, "fresh");
  store.sync(manifest(...old));
  assert.equal(store.next()?.itemId, "old11");
  assert.equal(store.overview().counts.total, 12);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM translation_items WHERE initial=1").get() as {n:number}).n,10);
  db.close();
});
test("identical fields share memory; unchanged and manually restored translations are not billed again", () => {
  const { db, store } = fixture();
  store.sync(manifest(item("a"), item("b")));
  store.start();
  const first = store.next()!;
  assert(store.reserve(first.hash, 7, false));
  store.complete(first.hash, "Hello", 7);
  assert.equal(store.next(), undefined);
  assert.equal(store.overview().coverage.percent, 100);
  assert.equal(store.overview().quota.used, 7);
  store.restore({ version: 1, revision: "manual", entries: { a: { title: { hash: first.hash, text: "Good day", manual: true } } } });
  store.sync(manifest(item("a"), item("b")));
  assert.equal(store.snapshot().entries.a?.title?.text, "Good day");
  assert.equal(store.snapshot().entries.b?.title?.text, "Hello", "a manual correction is scoped to its content and field");
  store.sync(manifest(item("a", "Bonjour modifié"), item("b")));
  assert.equal(store.next()?.novelty, true);
  assert.equal(store.snapshot().entries.a, undefined);
  assert.equal(store.overview().counts.stale, 1);
  store.sync(manifest(item("a", "Encore modifié"), item("b"), item("new", "Inédit")));
  assert.equal(store.overview().counts.stale, 1);
  assert.equal(store.overview().counts.pending, 1);
  db.close();
});
test("reservation includes previous usage, uncertain requests stay reserved after a restart", () => {
  const { db, store } = fixture();
  store.sync(manifest(item("a")));
  store.quota(699_998, 1_000_000);
  store.start();
  const next = store.next()!;
  assert.equal(store.reserve(next.hash, 7, false), false);
  assert.equal(store.reserve(next.hash, 7, true), true);
  const restarted = new TranslationStore(db);
  restarted.recover();
  assert.equal(restarted.memory(next.hash)?.state, "uncertain");
  assert.equal(restarted.overview().quota.used, 700_005);
  restarted.quota(699_998, 1_000_000);
  assert.equal(restarted.overview().quota.used, 700_005);
  restarted.retry();
  assert.equal(restarted.next(), undefined);
  restarted.retry(true);
  assert.equal(restarted.memory(next.hash)?.state, "pending");
  db.close();
});
test("paused work and history survive store reconstruction; failed quota stops calls", () => {
  const { db, store } = fixture();
  store.sync(manifest(item("a")));
  store.start();
  store.pause();
  const restored = new TranslationStore(db);
  assert.equal(restored.next(), undefined);
  assert(restored.history().length);
  restored.resume();
  restored.failQuota("QUOTA_UNAVAILABLE");
  assert.equal(restored.budget(true), 0);
  db.close();
});
test("service publishes prepared output and only marks it live when the deployed snapshot matches", async () => {
  const { db, store } = fixture();
  const source = manifest(item("a"));
  store.sync(source);
  store.start();
  let live: TranslationSnapshot | null = null;
  let exported: TranslationSnapshot | null = null;
  let calls = 0;
  const request = (async (url: string | URL | Request) => {
    if (String(url).endsWith("/usage")) return Response.json({ character_count: 0, character_limit: 1_000_000 });
    calls++;
    return Response.json({ translations: [{ text: "Hello", billed_characters: 7 }] });
  }) as typeof fetch;
  const service = new TranslationService(store, new DeepLClient("fake:fx", undefined, request), {
    manifest: async () => source, published: async () => live,
    export: async snapshot => { exported = snapshot; return { commit: "test-commit" }; },
  });
  await service.tick();
  assert.equal(calls, 1);
  assert.equal((store.overview().publication as { state: string }).state, "deploying");
  assert.equal(store.overview().publication.preparedCharacters, 7);
  assert.equal(store.overview().publication.liveCharacters, 0);
  live = exported;
  await service.tick();
  assert.equal(calls, 1);
  assert.equal((store.overview().publication as { state: string }).state, "live");
  assert.equal(store.overview().publication.liveCharacters, 7);
  assert.equal(store.history()[0]?.chars, 7);
  db.close();
});
test("quota errors do not consume requests or prevent public fallback generation", async () => {
  const { db, store } = fixture();
  const source = manifest(item("a"));
  store.sync(source); store.start();
  let translations = 0;
  const client = new DeepLClient("fake", undefined, (async url => {
    if (String(url).endsWith("/usage")) return new Response("", { status: 503 });
    translations++; return Response.json({});
  }) as typeof fetch);
  const service = new TranslationService(store, client, { manifest: async () => source, published: async () => null, export: async () => ({ commit: "unused" }) });
  await service.tick();
  assert.equal(translations, 0);
  assert.equal(store.overview().quota.error, "DEEPL_503");
  assert.deepEqual(store.snapshot().entries, {});
  db.close();
});
test("HTML translation rejects rewritten destinations, code and executable additions", () => {
  const source = '<p>Bonjour <a href="https://example.com/">lien</a></p><pre><code>x()</code></pre>';
  assert.equal(validateTranslation(source, source.replace("Bonjour", "Hello"), "html").includes("Hello"), true);
  for (const unsafe of [source.replace("https://example.com/", "javascript:alert(1)"), source.replace("x()", "y()"), source + "<script>alert(1)</script>"]) {
    assert.throws(() => validateTranslation(source, unsafe, "html"), TranslationError);
  }
  assert.throws(()=>validateTranslation("Voir https://example.com/original", "See https://example.com/changed", "text"),TranslationError);
});
test("API timeouts are uncertain and no automatic retry can duplicate a billed call", async () => {
  let calls = 0;
  const client = new DeepLClient("fake", undefined, (async () => { calls++; throw new Error("timeout"); }) as typeof fetch);
  await assert.rejects(client.translate("Bonjour", "text"), error => error instanceof TranslationError && error.uncertain);
  assert.equal(calls, 1);
});

test("a ceiling reached by history still permits new content, until total credit is exhausted", async () => {
  const { db, store } = fixture();
  let source = manifest(item("old", "Historique"));
  let consumed = 699_998, calls = 0;
  store.sync(source); store.quota(consumed, 1_000_000); store.start();
  const client = new DeepLClient("fake", undefined, (async url => {
    if (String(url).endsWith("/usage")) return Response.json({character_count:consumed,character_limit:1_000_000});
    calls++; consumed += 7; return Response.json({translations:[{text:"New item",billed_characters:7}]});
  }) as typeof fetch);
  const service = new TranslationService(store, client, {manifest:async()=>source,published:async()=>null,export:async()=>({commit:"simulated"})});
  await service.tick();
  assert.equal(calls,0); assert.equal(store.overview().backfill,false);
  source = manifest(item("old", "Historique"),item("new","Nouveau"));
  await service.tick();
  assert.equal(calls,1); assert.equal(store.overview().quota.used,700_005);
  consumed = 1_000_000;
  source = manifest(...source.items,item("newer","Plus récent"));
  await service.tick();
  assert.equal(calls,1); assert.equal(store.overview().quota.remaining,0);
  db.close();
});

test("suspending an in-flight lot preserves it and deployment retries reuse prepared text", async () => {
  const {db,store} = fixture();
  const source = manifest(item("a"),item("b","Au revoir"));
  store.sync(source); store.start();
  let calls=0,exports=0;
  const service = new TranslationService(store,new DeepLClient("fake",undefined,(async url=>{
    if(String(url).endsWith("/usage"))return Response.json({character_count:0,character_limit:1_000_000});
    calls++;store.pause();return Response.json({translations:[{text:"Hello",billed_characters:7}]});
  }) as typeof fetch),{manifest:async()=>source,published:async()=>null,deploymentFailed:async()=>true,export:async()=>{exports++;return {commit:"failed-deploy"}}});
  await service.tick();
  assert.equal(calls,1);assert.equal(store.overview().backfill,true);assert.equal(store.overview().paused,true);
  await service.sync();
  assert.equal(store.get("publication",{state:""}).state,"deploy_failed");
  store.retry();await service.publish();
  assert.equal(exports,2);assert.equal(calls,1);
  db.close();
});

test("disk restart preserves queue, manual work, batches and cross-month history", async () => {
  const directory=await mkdtemp(join(tmpdir(),"digest-translations-"));
  const file=join(directory,"state.sqlite");
  try {
    let db=new Database(file),date="2026-08-31T23:00:00.000Z";
    let store=new TranslationStore(db,()=>date);
    store.sync(manifest(item("a")));store.quota(12,1_000_000);store.start();
    const next=store.next()!;store.reserve(next.hash,7,false);store.complete(next.hash,"Hello",7);store.pause();db.close();
    date="2026-09-01T10:00:00.000Z";db=new Database(file);store=new TranslationStore(db,()=>date);
    store.recover();store.quota(19,1_000_000);store.record("quota");
    assert.equal(store.overview().quota.used,19);assert.equal(store.overview().paused,true);
    assert.equal(store.snapshot().entries.a?.title?.text,"Hello");
    assert.equal(store.history("2026-08")[0]?.chars,7);assert.equal(store.history().length,2);
    assert.equal(store.overview().batches.length,1);db.close();
  } finally {await rm(directory,{recursive:true,force:true});}
});

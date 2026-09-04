import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { BACKFILL_CEILING, DEVELOPER_CREDIT, translationBudget } from "./translation-budget.js";
import { codePoints, snapshotRevision, type TranslationManifest, type TranslationSnapshot } from "./translation-types.js";
import { createPublicationPlan, validatePublicationPlan, type TranslationPublicationPlan } from "./translation-publication.js";

type Memory = {
  hash: string; source: string; format: "html" | "text"; chars: number;
  translated: string | null; state: string; error: string | null;
  reserved: number; manual: number;
};
type ItemRow = { id: string; title: string; kind: string; date: string; route: string; group_name: string; initial: number };
export function ensureTranslationSchema(db: Database.Database): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS translation_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);" +
    "CREATE TABLE IF NOT EXISTS translation_items (id TEXT PRIMARY KEY,title TEXT NOT NULL,kind TEXT NOT NULL,date TEXT NOT NULL,route TEXT NOT NULL,group_name TEXT NOT NULL,dependencies TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,initial INTEGER NOT NULL DEFAULT 0);" +
    "CREATE TABLE IF NOT EXISTS translation_memory (hash TEXT PRIMARY KEY,source TEXT NOT NULL,format TEXT NOT NULL,chars INTEGER NOT NULL,translated TEXT,state TEXT NOT NULL DEFAULT 'pending',error TEXT,reserved INTEGER NOT NULL DEFAULT 0,manual INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);" +
    "CREATE TABLE IF NOT EXISTS translation_fields (item_id TEXT NOT NULL,field TEXT NOT NULL,hash TEXT NOT NULL,lane TEXT,PRIMARY KEY(item_id,field));" +
    "CREATE INDEX IF NOT EXISTS translation_fields_hash ON translation_fields(hash);" +
    "CREATE TABLE IF NOT EXISTS translation_history (id INTEGER PRIMARY KEY,at TEXT NOT NULL,event TEXT NOT NULL,chars INTEGER NOT NULL DEFAULT 0,total INTEGER NOT NULL,translated INTEGER NOT NULL,used INTEGER,batch_id TEXT);" +
    "CREATE TABLE IF NOT EXISTS translation_batches (id TEXT PRIMARY KEY,started_at TEXT NOT NULL,finished_at TEXT,state TEXT NOT NULL,estimated INTEGER NOT NULL,translated INTEGER NOT NULL DEFAULT 0);" +
    "CREATE TABLE IF NOT EXISTS translation_publications (revision TEXT PRIMARY KEY,target_revision TEXT NOT NULL,base_revision TEXT NOT NULL,plan_json TEXT NOT NULL,snapshot_json TEXT NOT NULL,state TEXT NOT NULL,commit_sha TEXT,created_at TEXT NOT NULL,live_at TEXT);" +
    "CREATE INDEX IF NOT EXISTS translation_publications_target ON translation_publications(target_revision);" +
    "CREATE INDEX IF NOT EXISTS translation_history_at ON translation_history(at);" +
    // Resolve corrections per item/field without putting them in hash-shared memory.
    "CREATE VIEW IF NOT EXISTS translation_current_fields AS " +
    "SELECT f.*,m.chars,COALESCE(json_extract(c.value,'$.text'),m.translated) AS translated," +
    "CASE WHEN c.value IS NOT NULL THEN 'done' ELSE m.state END AS state," +
    "CASE WHEN c.value IS NULL THEN m.error END AS error," +
    "CASE WHEN c.value IS NOT NULL THEN 1 ELSE 0 END AS manual " +
    "FROM translation_fields f JOIN translation_memory m ON m.hash=f.hash " +
    "LEFT JOIN json_each((SELECT value FROM translation_settings WHERE key='corrections')) ci ON ci.key=f.item_id " +
    "LEFT JOIN json_each(ci.value) c ON c.key=f.field AND json_extract(c.value,'$.hash')=f.hash;"
  );
}
export class TranslationStore {
  constructor(readonly db: Database.Database, readonly now = () => new Date().toISOString()) {
    ensureTranslationSchema(db);
  }
  get<T>(key: string, fallback: T): T {
    const row = this.db.prepare("SELECT value FROM translation_settings WHERE key=?").get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) as T : fallback;
  }
  set(key: string, value: unknown) {
    this.db.prepare("INSERT INTO translation_settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, JSON.stringify(value));
  }
  recover() {
    const count = this.db.prepare("UPDATE translation_memory SET state='uncertain',error='REQUEST_OUTCOME_UNKNOWN' WHERE state='working'").run().changes;
    if (count) this.record("interrupted");
  }
  sync(manifest: TranslationManifest) {
    const initialized = this.get("initialized", false);
    let changed = false;
    this.db.transaction(() => {
      const previousIds = (this.db.prepare("SELECT id FROM translation_items WHERE active=1").all() as { id: string }[]).map(r => r.id);
      this.db.prepare("UPDATE translation_items SET active=0").run();
      for (const item of manifest.items) {
        const old = this.db.prepare("SELECT id FROM translation_items WHERE id=?").get(item.id);
        const previous = this.db.prepare("SELECT f.field,f.hash,f.lane,m.translated FROM translation_fields f JOIN translation_current_fields m ON m.item_id=f.item_id AND m.field=f.field WHERE f.item_id=?")
          .all(item.id) as { field: string; hash: string; lane: string | null; translated: string | null }[];
        this.db.prepare("INSERT INTO translation_items(id,title,kind,date,route,group_name,dependencies,active) VALUES(?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET title=excluded.title,kind=excluded.kind,date=excluded.date,route=excluded.route,group_name=excluded.group_name,dependencies=excluded.dependencies,active=1")
          .run(item.id, item.title, item.kind, item.date, item.route, item.group, JSON.stringify(item.dependencies));
        this.db.prepare("DELETE FROM translation_fields WHERE item_id=?").run(item.id);
        for (const [name, field] of Object.entries(item.fields)) {
          if (!field.source.trim()) continue;
          const before = previous.find(row => row.field === name);
          const same = before?.hash === field.hash;
          if (!same) changed = true;
          const updatedTranslation = previous.some(row => row.translated !== null || row.lane === "update");
          const lane = same ? before.lane : initialized && (!old || previous.some(row => row.lane === "new")) ? "new" : initialized && updatedTranslation ? "update" : null;
          this.db.prepare("INSERT OR IGNORE INTO translation_memory(hash,source,format,chars,updated_at) VALUES(?,?,?,?,?)")
            .run(field.hash, field.source, field.format, codePoints(field.source), this.now());
          this.db.prepare("INSERT INTO translation_fields VALUES(?,?,?,?)").run(item.id, name, field.hash, lane);
        }
        if (previous.length !== Object.values(item.fields).filter(f => f.source.trim()).length) changed = true;
      }
      const currentIds = new Set(manifest.items.map(item => item.id));
      if (previousIds.some(id => !currentIds.has(id))) changed = true;
      this.set("initialized", true);
      this.set("artworkSources", Object.fromEntries(manifest.items.filter(item => item.artwork).map(item => [item.id, item.artwork])));
      const storedManifest = this.get<TranslationManifest | null>("manifest", null);
      if (!storedManifest || storedManifest.version !== manifest.version || manifest.version === 2 && (storedManifest.version !== 2 || storedManifest.revision !== manifest.revision)) this.set("manifest", manifest);
      if (!initialized) this.chooseInitial();
    })();
    if (changed || !initialized) this.record("inventory");
    return changed;
  }
  private chooseInitial() {
    const ids = new Set<string>();
    const all = this.db.prepare("SELECT * FROM translation_items WHERE active=1 ORDER BY date DESC,id").all() as (ItemRow & { dependencies: string })[];
    for (const group of ["archives", "journal-procrastinateur"]) {
      for (const item of all.filter(i => i.group_name === group && i.kind === "page" && !["/archives/", "/flux/journal-procrastinateur/"].includes(i.route) && /^\d{4}-/.test(i.date)).slice(0, 10)) {
        ids.add(item.id);
        for (const id of JSON.parse(item.dependencies) as string[]) ids.add(id);
      }
    }
    for (const item of all) if (["category", "tag"].includes(item.kind) || item.group_name === "foundation") ids.add(item.id);
    for (const id of ids) this.db.prepare("UPDATE translation_items SET initial=1 WHERE id=?").run(id);
  }
  quota(used: number, limit: number) {
    if (![used, limit].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error("QUOTA_INVALID");
    // Developer is lifetime credit; this value must never decrease with a calendar change.
    this.set("used", Math.max(this.get<number>("used", 0), used));
    this.set("reportedUsed", used);
    this.set("limit", Math.min(limit, DEVELOPER_CREDIT));
    this.set("quotaAt", this.now());
    this.set("quotaError", null);
  }
  failQuota(code: string) { this.set("quotaError", code); }
  budget(novelty = false) {
    if (this.get<string | null>("quotaError", null)) return 0;
    return translationBudget(this.get<number | null>("used", null), this.get<number | null>("limit", null), novelty);
  }
  estimate() {
    return (this.db.prepare("SELECT COALESCE(SUM(chars),0) AS chars FROM translation_memory WHERE translated IS NULL AND hash IN (SELECT f.hash FROM translation_current_fields f JOIN translation_items i ON i.id=f.item_id WHERE i.active=1 AND f.translated IS NULL)")
      .get() as { chars: number }).chars;
  }
  start() {
    if (!this.get("initialized", false)) throw new Error("MANIFEST_UNAVAILABLE");
    if (!this.budget()) throw new Error("BACKFILL_BUDGET_EXHAUSTED");
    this.set("paused", false);
    this.set("backfill", true);
    let batch = this.get<string | null>("batch", null);
    if (!batch) {
      batch = randomUUID();
      this.db.prepare("INSERT INTO translation_batches(id,started_at,state,estimated) VALUES(?,?,'running',?)").run(batch, this.now(), Math.min(this.estimate(), this.budget()));
      this.set("batch", batch);
    } else this.db.prepare("UPDATE translation_batches SET state='running' WHERE id=?").run(batch);
    this.record("started");
    return batch;
  }
  pause() {
    this.set("paused", true);
    const batch = this.get("batch", null);
    if (batch) this.db.prepare("UPDATE translation_batches SET state='paused' WHERE id=?").run(batch);
    this.record("paused");
  }
  resume() {
    this.set("paused", false);
    const batch = this.get("batch", null);
    if (batch) this.db.prepare("UPDATE translation_batches SET state='running' WHERE id=?").run(batch);
    this.record("resumed");
  }
  stopBackfill(reason: string) {
    this.set("backfill", false);
    const batch = this.get("batch", null);
    if (batch) this.db.prepare("UPDATE translation_batches SET state=?,finished_at=? WHERE id=?").run(reason, this.now(), batch);
    this.set("batch", null);
    this.record(reason);
  }
  retry(uncertainHashes: string[] = []) {
    const publication = this.get<{state?: string;planRevision?:string}>("publication", {});
    if (publication.state === "deploy_failed") {
      this.set("publication", { ...publication, state: "retrying" });
      if (publication.planRevision) this.publicationState(this.publicationDraft(publication.planRevision).plan, "retrying");
    }
    const confirmed = [...new Set(uncertainHashes)];
    const placeholders = confirmed.map(() => "?").join(",");
    const retryable = confirmed.length ? "(state='error' OR (state='uncertain' AND hash IN (" + placeholders + ")))" : "state='error'";
    const changed = this.db.transaction(() => {
      this.db.prepare("UPDATE translation_fields SET lane='retry' WHERE lane IS NULL AND hash IN (SELECT hash FROM translation_memory WHERE " + retryable + ")").run(...confirmed);
      return this.db.prepare("UPDATE translation_memory SET state='pending',error=NULL WHERE " + retryable).run(...confirmed).changes;
    })();
    // Retry just these fields; keep the user's current backfill mode and budget lanes.
    if (changed) this.resume();
    // Reservations on uncertain requests remain consumed: a retry may be billed again.
    this.record(confirmed.length ? "retry_uncertain" : "retry");
  }
  next(): (Memory & { novelty: boolean; itemId: string; title: string }) | undefined {
    if (this.get("paused", false)) return;
    const backfill = this.get("backfill", false);
    const rows = this.db.prepare(
      "SELECT m.*,i.id AS itemId,i.title,MAX(CASE WHEN f.lane IN ('new','update') THEN 1 ELSE 0 END) AS novelty," +
      "MIN(CASE WHEN f.lane IN ('new','update') THEN 0 WHEN i.group_name='foundation' OR i.kind IN ('category','tag') THEN 1 WHEN i.initial=1 THEN 2 ELSE 3 END) AS rank,MAX(i.date) AS priority_date " +
      "FROM translation_memory m JOIN translation_current_fields f ON f.hash=m.hash JOIN translation_items i ON i.id=f.item_id " +
      "WHERE i.active=1 AND m.state='pending' AND f.translated IS NULL AND (f.lane IN ('new','update','retry') OR ?=1) " +
      "GROUP BY m.hash ORDER BY rank,priority_date DESC,m.hash LIMIT 1"
    ).get(backfill ? 1 : 0) as (Memory & { novelty: number; itemId: string; title: string }) | undefined;
    return rows && { ...rows, novelty: Boolean(rows.novelty) };
  }
  reserve(hash: string, chars: number, novelty: boolean) {
    return this.db.transaction(() => {
      if (chars > this.budget(novelty)) return false;
      const changed = this.db.prepare("UPDATE translation_memory SET state='working',reserved=?,error=NULL,updated_at=? WHERE hash=? AND state='pending'")
        .run(chars, this.now(), hash).changes;
      if (!changed) return false;
      this.set("used", this.get<number>("used", 0) + chars);
      return true;
    })();
  }
  complete(hash: string, text: string, billed: number) {
    this.db.transaction(() => {
      const row = this.memory(hash)!;
      this.set("used", Math.max(this.get<number>("reportedUsed", 0), this.get<number>("used", 0) - row.reserved + billed));
      this.db.prepare("UPDATE translation_memory SET translated=?,state='done',reserved=0,error=NULL,updated_at=? WHERE hash=?").run(text, this.now(), hash);
      const batch = this.get("batch", null);
      if (batch) this.db.prepare("UPDATE translation_batches SET translated=translated+? WHERE id=?").run(billed, batch);
      this.record("translated", billed);
    })();
  }
  fail(hash: string, error: string, uncertain: boolean) {
    this.db.transaction(() => {
      const row = this.memory(hash)!;
      if (!uncertain) this.set("used", Math.max(this.get<number>("reportedUsed", 0), this.get<number>("used", 0) - row.reserved));
      this.db.prepare("UPDATE translation_memory SET state=?,error=?,reserved=?,updated_at=? WHERE hash=?")
        .run(uncertain ? "uncertain" : "error", error, uncertain ? row.reserved : 0, this.now(), hash);
      this.record(uncertain ? "uncertain" : "error");
    })();
  }
  memory(hash: string) { return this.db.prepare("SELECT * FROM translation_memory WHERE hash=?").get(hash) as Memory | undefined; }
  restore(snapshot: TranslationSnapshot) {
    if (snapshot.version !== 1) return;
    const corrections: TranslationSnapshot["entries"] = {};
    for (const [id, fields] of Object.entries(snapshot.entries)) {
      for (const [field, entry] of Object.entries(fields)) {
        const current = this.db.prepare("SELECT hash FROM translation_fields WHERE item_id=? AND field=?").get(id, field) as { hash: string } | undefined;
        if (current?.hash !== entry.hash) continue;
        if (entry.manual) {
          corrections[id] ??= {};
          corrections[id]![field] = entry;
          continue;
        }
        this.db.prepare("UPDATE translation_memory SET translated=?,state='done',error=NULL,updated_at=? WHERE hash=? AND translated IS NULL")
          .run(entry.text, this.now(), entry.hash);
      }
    }
    this.set("corrections", corrections);
  }
  snapshot(): TranslationSnapshot {
    const entries: TranslationSnapshot["entries"] = {};
    const corrections = this.get<TranslationSnapshot["entries"]>("corrections", {});
    const rows = this.db.prepare("SELECT f.item_id,f.field,m.hash,m.translated,m.manual FROM translation_fields f JOIN translation_items i ON i.id=f.item_id JOIN translation_current_fields m ON m.item_id=f.item_id AND m.field=f.field WHERE i.active=1 AND m.translated IS NOT NULL ORDER BY f.item_id,f.field")
      .all() as { item_id: string; field: string; hash: string; translated: string; manual: number }[];
    for (const row of rows) {
      entries[row.item_id] ??= {};
      const correction = corrections[row.item_id]?.[row.field];
      entries[row.item_id]![row.field] = correction?.hash === row.hash ? correction : { hash: row.hash, text: row.translated };
    }
    const artwork: NonNullable<TranslationSnapshot["artwork"]> = {};
    const sources = this.get<Record<string, NonNullable<TranslationManifest["items"][number]["artwork"]>>>("artworkSources", {});
    for (const [id, source] of Object.entries(sources)) {
      const fields = entries[id];
      if (fields?.title && fields.description) artwork[source.date] = {title:fields.title.text,description:fields.description.text,linkCount:source.linkCount,editorialType:source.editorialType};
    }
    return { version: 1, revision: snapshotRevision(entries, artwork), entries, artwork };
  }
  preparePublication(base: TranslationSnapshot, target: TranslationSnapshot) {
    const current = this.get<TranslationManifest | null>("manifest", null);
    if (!current) throw new Error("MANIFEST_UNAVAILABLE");
    const existing = this.db.prepare("SELECT plan_json,snapshot_json FROM translation_publications WHERE target_revision=? AND base_revision=? ORDER BY created_at DESC LIMIT 1")
      .get(target.revision, base.revision) as { plan_json: string; snapshot_json: string } | undefined;
    if (existing) return { plan: validatePublicationPlan(JSON.parse(existing.plan_json)), snapshot: JSON.parse(existing.snapshot_json) as TranslationSnapshot };
    const plan = createPublicationPlan(current, base, target);
    this.db.prepare("INSERT INTO translation_publications(revision,target_revision,base_revision,plan_json,snapshot_json,state,created_at) VALUES(?,?,?,?,?,'prepared',?)")
      .run(plan.revision, target.revision, base.revision, JSON.stringify(plan), JSON.stringify(target), this.now());
    return { plan, snapshot: target };
  }
  publicationDraft(revision: string) {
    const row = this.db.prepare("SELECT plan_json,snapshot_json FROM translation_publications WHERE revision=?").get(revision) as { plan_json: string; snapshot_json: string } | undefined;
    if (!row) throw new Error("PUBLICATION_PLAN_MISSING");
    return { plan: validatePublicationPlan(JSON.parse(row.plan_json)), snapshot: JSON.parse(row.snapshot_json) as TranslationSnapshot };
  }
  publicationState(plan: TranslationPublicationPlan, state: string, commit?: string) {
    this.db.prepare("UPDATE translation_publications SET state=?,commit_sha=COALESCE(?,commit_sha),live_at=CASE WHEN ?='live' THEN ? ELSE live_at END WHERE revision=?")
      .run(state, commit || null, state, this.now(), plan.revision);
  }
  stats() {
    const counts = this.db.prepare("SELECT COALESCE(SUM(m.chars),0) AS total,COALESCE(SUM(CASE WHEN m.translated IS NOT NULL THEN m.chars ELSE 0 END),0) AS translated FROM translation_fields f JOIN translation_items i ON i.id=f.item_id JOIN translation_current_fields m ON m.item_id=f.item_id AND m.field=f.field WHERE i.active=1")
      .get() as { total: number; translated: number };
    return { ...counts, percent: counts.total ? Math.round(counts.translated / counts.total * 1000) / 10 : 0 };
  }
  items(limit = 100, offset = 0) {
    return this.db.prepare(
      "SELECT i.id,i.title,i.kind,i.date,i.route,COUNT(*) AS fields,SUM(CASE WHEN m.translated IS NOT NULL THEN 1 ELSE 0 END) AS done," +
      "SUM(CASE WHEN m.state IN ('error','uncertain') THEN 1 ELSE 0 END) AS errors,MAX(m.error) AS error,SUM(m.chars) AS chars,MAX(CASE WHEN f.lane='update' AND m.translated IS NULL THEN 1 ELSE 0 END) AS stale " +
      "FROM translation_items i JOIN translation_fields f ON f.item_id=i.id JOIN translation_current_fields m ON m.item_id=f.item_id AND m.field=f.field WHERE i.active=1 " +
      "GROUP BY i.id ORDER BY i.date DESC,i.id LIMIT ? OFFSET ?"
    ).all(limit, offset);
  }
  liveCharacters() {
    const entries = this.get<TranslationSnapshot["entries"]>("liveEntries", {});
    const prepared = this.snapshot().entries;
    const rows = this.db.prepare("SELECT f.item_id,f.field,m.hash,m.chars,m.translated FROM translation_fields f JOIN translation_items i ON i.id=f.item_id JOIN translation_current_fields m ON m.item_id=f.item_id AND m.field=f.field WHERE i.active=1").all() as {item_id:string;field:string;hash:string;chars:number;translated:string|null}[];
    return rows.reduce((total, row) => {
      const live = entries[row.item_id]?.[row.field];
      return total + (live?.hash === row.hash && live.text === prepared[row.item_id]?.[row.field]?.text ? row.chars : 0);
    }, 0);
  }
  overview() {
    const rows = this.db.prepare("SELECT i.id,COUNT(*) AS fields,SUM(CASE WHEN m.translated IS NOT NULL THEN 1 ELSE 0 END) AS done,SUM(CASE WHEN m.state IN ('error','uncertain') THEN 1 ELSE 0 END) AS errors,MAX(CASE WHEN f.lane='update' AND m.translated IS NULL THEN 1 ELSE 0 END) AS stale FROM translation_items i JOIN translation_fields f ON f.item_id=i.id JOIN translation_current_fields m ON m.item_id=f.item_id AND m.field=f.field WHERE i.active=1 GROUP BY i.id").all() as { fields: number; done: number; errors: number; stale: number }[];
    return {
      initialized: this.get("initialized", false), paused: this.get("paused", false), backfill: this.get("backfill", false),
      coverage: this.stats(),
      counts: { total: rows.length, done: rows.filter(r => r.done === r.fields).length, partial: rows.filter(r => !r.errors && !r.stale && r.done > 0 && r.done < r.fields).length, pending: rows.filter(r => !r.errors && !r.stale && r.done === 0).length, stale: rows.filter(r => !r.errors && r.stale).length, errors: rows.filter(r => r.errors).length },
      quota: { used: this.get("used", null), reportedUsed: this.get("reportedUsed", null), limit: this.get("limit", null), at: this.get("quotaAt", null), error: this.get("quotaError", null), backfillCeiling: BACKFILL_CEILING, remainingBackfill: this.budget(), remaining: this.budget(true) },
      estimated: Math.min(this.estimate(), this.budget()),
      publication: { ...this.get("publication", { state: "idle" }), preparedCharacters: this.stats().translated, liveCharacters: this.liveCharacters() },
      lastError: this.get("lastError", null),
      uncertain: this.db.prepare("SELECT m.hash,i.title,f.field FROM translation_memory m JOIN translation_current_fields f ON f.hash=m.hash JOIN translation_items i ON i.id=f.item_id WHERE m.state='uncertain' AND i.active=1 GROUP BY m.hash ORDER BY i.date DESC LIMIT 50").all(),
      batches: this.db.prepare("SELECT * FROM translation_batches ORDER BY started_at DESC LIMIT 20").all(),
    };
  }
  record(event: string, chars = 0) {
    const stats = this.stats();
    this.db.prepare("INSERT INTO translation_history(at,event,chars,total,translated,used,batch_id) VALUES(?,?,?,?,?,?,?)")
      .run(this.now(), event, chars, stats.total, stats.translated, this.get("used", null), this.get("batch", null));
  }
  history(month = "") {
    return this.db.prepare("SELECT substr(at,1,10) AS day,SUM(chars) AS chars,MAX(id) AS last_id FROM translation_history WHERE at LIKE ? GROUP BY substr(at,1,10) ORDER BY day")
      .all(month + "%").map(row => {
        const day = row as { day: string; chars: number; last_id: number };
        const last = this.db.prepare("SELECT total,translated,used FROM translation_history WHERE id=?").get(day.last_id) as { total: number; translated: number; used: number | null };
        return { day: day.day, chars: day.chars, ...last, percent: last.total ? Math.round(last.translated / last.total * 1000) / 10 : 0 };
      });
  }
}

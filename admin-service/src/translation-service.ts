import { DeepLClient, TranslationError } from "./deepl.js";
import { TranslationStore } from "./translation-store.js";
import { validateManifest, type TranslationSnapshot } from "./translation-types.js";

type Dependencies = {
  manifest: () => Promise<unknown>;
  published: () => Promise<TranslationSnapshot | null>;
  deploymentFailed?: (commit: string) => Promise<boolean>;
  export: (snapshot: TranslationSnapshot, retryDeployment?: boolean) => Promise<{ commit: string; revision?: string }>;
};
export class TranslationService {
  private running = false;
  private timer?: ReturnType<typeof setTimeout>;
  private stopping = false;
  constructor(readonly store: TranslationStore, readonly client: DeepLClient, readonly dependencies: Dependencies) {}
  async refreshQuota() {
    try {
      const quota = await this.client.usage();
      this.store.quota(quota.used, quota.limit);
      this.store.record("quota");
    } catch (error) {
      this.store.failQuota(error instanceof TranslationError ? error.code : "QUOTA_UNAVAILABLE");
      throw error;
    }
  }
  async sync() {
    const manifest = validateManifest(await this.dependencies.manifest());
    const published = await this.dependencies.published();
    this.store.sync(manifest);
    if (published) {
      this.store.restore(published);
      this.store.set("liveRevision", published.revision);
      this.store.set("liveEntries", published.entries);
      const publication = this.store.get<{ revision?: string; state?: string; commit?: string }>("publication", {});
      if (publication.revision === published.revision && publication.state !== "live") {
        this.store.set("publication", { ...publication, state: "live" });
        this.store.record("live");
      } else if (publication.state === "deploying" && published.sourceRevision === publication.revision) {
        // Hugo served this export but filtered fields/artwork made stale by newer French edits.
        this.store.set("publication", { ...publication, state: "idle" });
        this.store.record("publication_filtered");
      }
    }
    const pending = this.store.get<{ state?: string; commit?: string; revision?: string }>("publication", {});
    if (pending.state === "deploying" && pending.commit && await this.dependencies.deploymentFailed?.(pending.commit)) {
      this.store.set("publication", { ...pending, state: "deploy_failed" });
    }
    this.store.set("lastError", null);
  }
  async publish() {
    const snapshot = this.store.snapshot();
    const publication = this.store.get<{ revision?: string; state?: string; commit?: string }>("publication", {});
    if (!Object.keys(snapshot.entries).length && !publication.revision) return;
    if (snapshot.revision === this.store.get("liveRevision", "")) return;
    if (["deploying", "deploy_failed"].includes(publication.state || "")) return;
    this.store.set("publication", { state: "exporting", revision: snapshot.revision });
    try {
      const result = await this.dependencies.export(snapshot, publication.state === "retrying");
      this.store.set("publication", { state: "deploying", revision: result.revision || snapshot.revision, commit: result.commit });
      this.store.record("exported");
    } catch {
      this.store.set("publication", { state: "error", revision: snapshot.revision });
      this.store.record("export_error");
    }
  }
  async tick(maxRequests = 10) {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      await this.sync();
      await this.publish();
      if (!this.client.key || this.store.get("paused", false)) return;
      await this.refreshQuota();
      for (let count = 0; count < maxRequests && !this.stopping; count++) {
        if (this.store.get("paused", false)) break;
        const next = this.store.next();
        if (!next) {
          if (this.store.get("backfill", false)) this.store.stopBackfill(this.store.overview().counts.errors ? "complete_with_errors" : "complete");
          break;
        }
        let reserved: number;
        try { reserved = this.client.prepare(next.source, next.format).reserved; }
        catch { this.store.fail(next.hash, "TEXT_TOO_LARGE", false); continue; }
        if (!this.store.reserve(next.hash, reserved, next.novelty)) {
          if (!next.novelty) this.store.stopBackfill("ceiling_reached");
          break;
        }
        try {
          const result = await this.client.translate(next.source, next.format);
          this.store.complete(next.hash, result.text, result.billed);
        } catch (error) {
          const failure = error instanceof TranslationError ? error : new TranslationError("REQUEST_OUTCOME_UNKNOWN", true);
          this.store.fail(next.hash, failure.code, failure.uncertain);
          if (failure.code === "DEEPL_456" || failure.code === "DEEPL_403") this.store.failQuota(failure.code);
          break;
        }
      }
      await this.publish();
    } catch (error) {
      this.store.set("lastError", error instanceof TranslationError ? error.code : "TRANSLATION_SYNC_FAILED");
    } finally { this.running = false; }
  }
  status() { return { ...this.store.overview(), configured: Boolean(this.client.key), running: this.running }; }
  startWorker() {
    this.store.recover();
    const schedule = () => {
      if (this.stopping) return;
      this.timer = setTimeout(async () => { await this.tick(); schedule(); }, 60_000);
      this.timer.unref();
    };
    schedule();
  }
  stop() { this.stopping = true; if (this.timer) clearTimeout(this.timer); }
}

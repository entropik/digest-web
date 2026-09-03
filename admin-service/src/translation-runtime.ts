import type Database from "better-sqlite3";
import { config } from "./config.js";
import { DeepLClient } from "./deepl.js";
import { TranslationStore } from "./translation-store.js";
import { TranslationService } from "./translation-service.js";
import { commitRepositoryFiles, readRepositoryHead, tryReadRepositoryFile, workflowRunsForCommit } from "./github.js";
import { snapshotRevision, type TranslationSnapshot } from "./translation-types.js";
import { generateOptimizedSocialImage, generateOptimizedLinkedInImage } from "./social-image.js";

async function publicJson(path: string) {
  const response = await fetch(config.origin + path, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("PUBLIC_MANIFEST_UNAVAILABLE");
  const text = await response.text();
  if (text.length > 30_000_000) throw new Error("PUBLIC_MANIFEST_TOO_LARGE");
  return JSON.parse(text);
}
export function createTranslationService(database: Database.Database) {
  const store = new TranslationStore(database);
  return new TranslationService(store, new DeepLClient(config.deeplApiKey || "", config.deeplApiUrl), {
    manifest: () => publicJson("/translation-source.json"),
    published: async () => {
      try { return await publicJson("/translation-snapshot.json") as TranslationSnapshot; }
      catch { return null; }
    },
    deploymentFailed: async commit => {
      const run = (await workflowRunsForCommit(commit)).find(run => run.name === "Deploy production");
      return run?.status === "completed" && run.conclusion !== "success";
    },
    export: async (snapshot, retryDeployment = false) => {
      // Re-read the source head: the published inventory can lag behind a withdrawal.
      const head = await readRepositoryHead();
      const hidden = new Set(head.links.filter(link => link.visibility === "hidden").map(link => "link:" + link.id));
      const entries = Object.fromEntries(Object.entries(snapshot.entries).filter(([id]) => !hidden.has(id)));
      const safe = { ...snapshot, entries, revision: snapshotRevision(entries) };
      const oldRaw = await tryReadRepositoryFile("data/translations_en.json", head.commitSha);
      const old = oldRaw ? JSON.parse(oldRaw) as TranslationSnapshot : null;
      if (!retryDeployment && old?.revision === safe.revision) return { commit: head.commitSha, revision: safe.revision };
      const files: Record<string, string | Buffer> = { "data/translations_en.json": JSON.stringify(safe, null, 2) + "\n" };
      // Generated artwork uses translated editorial fields; historic source images stay intact.
      for (const [id, fields] of Object.entries(entries)) {
        const date = id.match(/^page:\/archives\/(\d{4}-\d{2}-\d{2})$/)?.[1];
        if (!date || !fields.title || !fields.description || (old?.entries[id]?.title?.text === fields.title.text && old?.entries[id]?.description?.text === fields.description.text)) continue;
        const source = await tryReadRepositoryFile("content/archives/" + date + ".md", head.commitSha);
        const input = { digestDate: date, title: fields.title.text, description: fields.description.text, linkCount: head.links.filter(link => link.added === date && link.visibility !== "hidden").length,
          editorialType: source?.includes('editorial_type: "focus"') ? "focus" as const : "digest" as const, locale: "en-GB" as const };
        files["static/social/en/" + date + ".png"] = await generateOptimizedSocialImage(input);
        files["static/social/en/" + date + "-linkedin.png"] = await generateOptimizedLinkedInImage(input);
      }
      const commit = await commitRepositoryFiles(head.commitSha, head.treeSha, files, "Publish English translations");
      return { commit, revision: safe.revision };
    },
  });
}

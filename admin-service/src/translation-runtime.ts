import type Database from "better-sqlite3";
import { config } from "./config.js";
import { DeepLClient } from "./deepl.js";
import { TranslationStore } from "./translation-store.js";
import { TranslationService } from "./translation-service.js";
import { commitRepositoryFiles, readRepositoryHead, tryReadRepositoryFile, workflowRunsForCommit, listRepositoryDirectory, GitHubResponseError } from "./github.js";
import { snapshotRevision, type TranslationSnapshot } from "./translation-types.js";
import { generateOptimizedSocialImage, generateOptimizedLinkedInImage } from "./social-image.js";
import { prepareTranslationArtwork } from "./translation-artwork.js";

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
    published: () => publicJson("/translation-snapshot.json") as Promise<TranslationSnapshot>,
    deploymentFailed: async commit => {
      const run = (await workflowRunsForCommit(commit)).find(run => run.name === "Deploy production");
      return run?.status === "completed" && run.conclusion !== "success";
    },
    export: async (snapshot, retryDeployment = false) => {
      // Re-read the source head: the published inventory can lag behind a withdrawal.
      const head = await readRepositoryHead();
      const hidden = new Set(head.links.filter(link => link.visibility === "hidden").map(link => "link:" + link.id));
      const entries = Object.fromEntries(Object.entries(snapshot.entries).filter(([id]) => !hidden.has(id)));
      const oldRaw = await tryReadRepositoryFile("data/translations_en.json", head.commitSha);
      const old = oldRaw ? JSON.parse(oldRaw) as TranslationSnapshot : null;
      const existing = new Set((await listRepositoryDirectory("static/social/en", head.commitSha).catch(error => {
        if (error instanceof GitHubResponseError && error.status === 404) return [];
        throw error;
      })).map(file => file.path));
      const prepared = await prepareTranslationArtwork(entries, { previous: old, links: head.links,
        readEdition: date => tryReadRepositoryFile("content/archives/" + date + ".md", head.commitSha),
        exists: path => existing.has(path), render: generateOptimizedSocialImage, renderLinkedIn: generateOptimizedLinkedInImage });
      const safe = { ...snapshot, entries, artwork: prepared.artwork, revision: snapshotRevision(entries, prepared.artwork) };
      if (!retryDeployment && old?.revision === safe.revision && !Object.keys(prepared.files).length) return { commit: head.commitSha, revision: safe.revision };
      const files: Record<string, string | Buffer> = { ...prepared.files, "data/translations_en.json": JSON.stringify(safe, null, 2) + "\n" };
      const commit = await commitRepositoryFiles(head.commitSha, head.treeSha, files, "Publish English translations");
      return { commit, revision: safe.revision };
    },
  });
}

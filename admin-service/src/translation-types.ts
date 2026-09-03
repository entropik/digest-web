import { createHash } from "node:crypto";

export type TranslationField = { source: string; format: "text" | "html"; hash: string };
export type TranslationItem = {
  id: string; kind: "page" | "link" | "category" | "tag" | "visual";
  title: string; date: string; route: string; group: string;
  dependencies: string[]; fields: Record<string, TranslationField>;
  artwork?: { date: string; linkCount: number; editorialType: "digest" | "focus" };
};
export type TranslationArtwork = { title: string; description: string; linkCount: number; editorialType: "digest" | "focus" };
export type TranslationManifest = { version: 1; items: TranslationItem[] };
export type TranslationSnapshot = {
  version: 1; revision: string;
  sourceRevision?: string;
  entries: Record<string, Record<string, { hash: string; text: string; manual?: boolean }>>;
  artwork?: Record<string, TranslationArtwork>;
};
export const sourceHash = (source: string, format: string) =>
  createHash("sha256").update(format + "\n" + source).digest("hex");
export const codePoints = (text: string) => [...text].length;
const sorted = <T>(entries: Record<string,T>) => Object.entries(entries).sort(([a],[b]) => Buffer.compare(Buffer.from(a),Buffer.from(b)));
export const snapshotRevision = (entries: TranslationSnapshot["entries"], artwork: NonNullable<TranslationSnapshot["artwork"]> = {}) => {
  const fields = sorted(entries).flatMap(([id, values]) => sorted(values).flatMap(([name, entry]) => [id, name, entry.hash, entry.text, !!entry.manual]));
  const images = sorted(artwork).flatMap(([date, entry]) => [date, entry.title, entry.description, entry.linkCount, entry.editorialType]);
  // Match Hugo's JSON encoding, including its escaping of Unicode line separators.
  const canonical = JSON.stringify([fields, images]).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
  return createHash("sha256").update(canonical).digest("hex");
};

export function validateManifest(value: unknown): TranslationManifest {
  if (!value || typeof value !== "object") throw new Error("MANIFEST_INVALID");
  const manifest = value as TranslationManifest;
  if (manifest.version !== 1 || !Array.isArray(manifest.items) || manifest.items.length > 30_000) {
    throw new Error("MANIFEST_INVALID");
  }
  const ids = new Set<string>();
  for (const item of manifest.items) {
    if (!item || typeof item.id !== "string" || ids.has(item.id) ||
        !["page", "link", "category", "tag", "visual"].includes(item.kind) ||
        typeof item.title !== "string" || typeof item.date !== "string" ||
        typeof item.route !== "string" || typeof item.group !== "string" ||
        !Array.isArray(item.dependencies) || item.dependencies.some(id => typeof id !== "string") ||
        !item.fields || typeof item.fields !== "object") throw new Error("MANIFEST_INVALID");
    ids.add(item.id);
    if (item.artwork && (!/^\d{4}-\d{2}-\d{2}$/.test(item.artwork.date) || !Number.isSafeInteger(item.artwork.linkCount) || item.artwork.linkCount < 0 || !["digest","focus"].includes(item.artwork.editorialType))) throw new Error("MANIFEST_INVALID");
    for (const field of Object.values(item.fields)) {
      if (!field || !["text", "html"].includes(field.format) || typeof field.source !== "string" ||
          field.hash !== sourceHash(field.source, field.format)) throw new Error("MANIFEST_INVALID");
    }
  }
  return manifest;
}

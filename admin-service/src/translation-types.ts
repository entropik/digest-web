import { createHash } from "node:crypto";

export type TranslationField = { source: string; format: "text" | "html"; hash: string };
export type TranslationItem = {
  id: string; kind: "page" | "link" | "category" | "tag" | "visual";
  title: string; date: string; route: string; group: string;
  dependencies: string[]; fields: Record<string, TranslationField>;
};
export type TranslationManifest = { version: 1; items: TranslationItem[] };
export type TranslationSnapshot = {
  version: 1; revision: string;
  entries: Record<string, Record<string, { hash: string; text: string; manual?: boolean }>>;
};
export const sourceHash = (source: string, format: string) =>
  createHash("sha256").update(format + "\n" + source).digest("hex");
export const codePoints = (text: string) => [...text].length;
export const snapshotRevision = (entries: TranslationSnapshot["entries"]) =>
  createHash("sha256").update(JSON.stringify(entries)).digest("hex");

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
    for (const field of Object.values(item.fields)) {
      if (!field || !["text", "html"].includes(field.format) || typeof field.source !== "string" ||
          field.hash !== sourceHash(field.source, field.format)) throw new Error("MANIFEST_INVALID");
    }
  }
  return manifest;
}

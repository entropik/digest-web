import { createHash } from "node:crypto";
import type { TranslationManifest, TranslationSnapshot } from "./translation-types.js";

export type TranslationPublicationPlan = {
  version: 1;
  revision: string;
  baseRevision: string;
  targetRevision: string;
  manifestRevision: string;
  fullBuild: boolean;
  items: { id: string; fields: string[] }[];
  paths: string[];
  artwork: { upsert: string[]; remove: string[] };
};

const stable = (value: unknown) => JSON.stringify(value);
const planRevision = (plan: Omit<TranslationPublicationPlan, "revision">) =>
  createHash("sha256").update(stable(plan)).digest("hex");
const same = (a: unknown, b: unknown) => stable(a) === stable(b);

export function createPublicationPlan(
  manifest: TranslationManifest,
  base: TranslationSnapshot,
  target: TranslationSnapshot,
): TranslationPublicationPlan {
  const ids = new Set([...Object.keys(base.entries), ...Object.keys(target.entries)]);
  const items = [...ids].sort().flatMap(id => {
    const fields = new Set([...Object.keys(base.entries[id] || {}), ...Object.keys(target.entries[id] || {})]);
    const changed = [...fields].filter(field => !same(base.entries[id]?.[field], target.entries[id]?.[field])).sort();
    return changed.length ? [{ id, fields: changed }] : [];
  });
  const beforeArtwork = base.artwork || {};
  const afterArtwork = target.artwork || {};
  const artworkDates = new Set([...Object.keys(beforeArtwork), ...Object.keys(afterArtwork)]);
  const upsert = [...artworkDates].filter(date => afterArtwork[date] && !same(beforeArtwork[date], afterArtwork[date])).sort();
  const remove = [...artworkDates].filter(date => beforeArtwork[date] && !afterArtwork[date]).sort();
  const changedIds = new Set(items.map(item => item.id));
  if (manifest.version === 2) {
    for (const item of manifest.items) {
      if (item.artwork && [...upsert, ...remove].includes(item.artwork.date)) {
        changedIds.add(item.id);
        if (!items.some(changed => changed.id === item.id)) items.push({ id: item.id, fields: ["$artwork"] });
      }
    }
    items.sort((left, right) => left.id.localeCompare(right.id));
  }
  const paths = manifest.version === 2
    ? [...new Set(manifest.items.filter(item => changedIds.has(item.id)).flatMap(item => item.impacts))].sort()
    : [];
  const body = {
    version: 1 as const,
    baseRevision: base.revision,
    targetRevision: target.revision,
    manifestRevision: manifest.version === 2 ? manifest.revision : "",
    fullBuild: manifest.version !== 2,
    items,
    paths,
    artwork: { upsert, remove },
  };
  return { ...body, revision: planRevision(body) };
}

export function validatePublicationPlan(value: unknown): TranslationPublicationPlan {
  if (!value || typeof value !== "object") throw new Error("PUBLICATION_PLAN_INVALID");
  const plan = value as TranslationPublicationPlan;
  const sha = /^[a-f0-9]{64}$/;
  if (plan.version !== 1 || !sha.test(plan.revision) || !sha.test(plan.baseRevision) || !sha.test(plan.targetRevision) ||
      typeof plan.manifestRevision !== "string" || typeof plan.fullBuild !== "boolean" || !Array.isArray(plan.items) ||
      !Array.isArray(plan.paths) || !plan.artwork || !Array.isArray(plan.artwork.upsert) || !Array.isArray(plan.artwork.remove)) {
    throw new Error("PUBLICATION_PLAN_INVALID");
  }
  if (plan.items.some(item => !item || typeof item.id !== "string" || !Array.isArray(item.fields) || item.fields.some(field => typeof field !== "string")) ||
      plan.paths.some(path => typeof path !== "string" || !path.startsWith("/") || path.includes("..")) ||
      [...plan.artwork.upsert, ...plan.artwork.remove].some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    throw new Error("PUBLICATION_PLAN_INVALID");
  }
  const { revision, ...body } = plan;
  if (revision !== planRevision(body)) throw new Error("PUBLICATION_PLAN_INVALID");
  return plan;
}

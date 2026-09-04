export const DEVELOPER_CREDIT = 1_000_000;
export const BACKFILL_CEILING = 700_000;

export function translationBudget(used: number | null, limit: number | null, novelty = false): number {
  if (used === null || limit === null || !Number.isSafeInteger(used) ||
      !Number.isSafeInteger(limit) || used < 0 || limit < 0) return 0;
  return Math.max(0, Math.min(limit, novelty ? DEVELOPER_CREDIT : BACKFILL_CEILING) - used);
}

export type LocalDraftFields = {
  title: string;
  category: string;
  description: string;
  tags: string[];
  privateNote: string;
};

export type LocalStorageArea = {
  get: (
    keys?: string | string[] | Record<string, unknown> | null,
  ) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

type StoredLocalDraft = {
  version: 1;
  url: string;
  savedAt: number;
  expiresAt: number;
  fields: LocalDraftFields;
};

const STORAGE_PREFIX = "curation-draft:";
export const LOCAL_DRAFT_TTL_MS = 24 * 60 * 60 * 1_000;
const TRACKING_KEYS = new Set([
  "_kx",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "nb_klid",
  "ref_src",
]);
const SENSITIVE_QUERY_KEY =
  /(?:^|[_-])(auth|code|credential|jwt|key|pass(?:word)?|secret|session|signature|token)(?:$|[_-])/i;
const SENSITIVE_PATH_SEGMENT =
  /\/(?:account|admin|auth|console|dashboard|login|oauth|signin)(?:\/|$)/i;

export const canonicalLocalDraftUrl = (rawUrl: string): string => {
  const url = new URL(rawUrl.trim());
  if (
    SENSITIVE_PATH_SEGMENT.test(url.pathname) ||
    [...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key))
  ) {
    throw new Error("SENSITIVE_URL");
  }
  const query = [...url.searchParams.entries()].filter(([key]) => {
    const lowered = key.toLowerCase();
    return !lowered.startsWith("utm_") && !TRACKING_KEYS.has(lowered);
  });
  url.search = "";
  for (const [key, value] of query) url.searchParams.append(key, value);
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  if (["fullscreen", "top"].includes(url.hash.slice(1).toLowerCase())) {
    url.hash = "";
  }
  return url.toString();
};

export const localDraftStorageKey = (rawUrl: string): string =>
  `${STORAGE_PREFIX}${canonicalLocalDraftUrl(rawUrl)}`;

const isLocalDraftFields = (value: unknown): value is LocalDraftFields => {
  if (!value || typeof value !== "object") return false;
  const fields = value as Record<string, unknown>;
  return (
    typeof fields.title === "string" &&
    typeof fields.category === "string" &&
    typeof fields.description === "string" &&
    Array.isArray(fields.tags) &&
    fields.tags.every((tag) => typeof tag === "string") &&
    typeof fields.privateNote === "string"
  );
};

const isStoredLocalDraft = (value: unknown): value is StoredLocalDraft => {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    draft.version === 1 &&
    typeof draft.url === "string" &&
    typeof draft.savedAt === "number" &&
    typeof draft.expiresAt === "number" &&
    isLocalDraftFields(draft.fields)
  );
};

export const saveLocalDraft = async (
  storage: LocalStorageArea,
  rawUrl: string,
  fields: LocalDraftFields,
  now = Date.now(),
): Promise<void> => {
  const url = canonicalLocalDraftUrl(rawUrl);
  await storage.set({
    [`${STORAGE_PREFIX}${url}`]: {
      version: 1,
      url,
      savedAt: now,
      expiresAt: now + LOCAL_DRAFT_TTL_MS,
      fields,
    } satisfies StoredLocalDraft,
  });
};

export const loadLocalDraft = async (
  storage: LocalStorageArea,
  rawUrl: string,
  now = Date.now(),
): Promise<LocalDraftFields | null> => {
  const key = localDraftStorageKey(rawUrl);
  const stored = (await storage.get(key))[key];
  if (!isStoredLocalDraft(stored) || stored.expiresAt <= now) {
    if (stored !== undefined) await storage.remove(key);
    return null;
  }
  return stored.fields;
};

export const clearLocalDraft = (
  storage: LocalStorageArea,
  rawUrl: string,
): Promise<void> => storage.remove(localDraftStorageKey(rawUrl));

export const pruneExpiredLocalDrafts = async (
  storage: LocalStorageArea,
  now = Date.now(),
): Promise<void> => {
  const entries = await storage.get(null);
  const expired = Object.entries(entries)
    .filter(([key]) => key.startsWith(STORAGE_PREFIX))
    .filter(([, value]) => {
      return !isStoredLocalDraft(value) || value.expiresAt <= now;
    })
    .map(([key]) => key);
  if (expired.length) await storage.remove(expired);
};

export type LocalDraftFields = {
  url: string;
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
  /\/(?:[a-z0-9]+[._-])*(?:account|admin|auth|console|dashboard|invites?|invitations?|login|magic-link|oauth|password-reset|reset(?:-password)?|signin|verification|verify)(?:[._-][a-z0-9-]+)*(?:\/|$)/i;
const SENSITIVE_COMPACT_KEYS = new Set([
  "accesstoken",
  "apikey",
  "authcode",
  "clientsecret",
  "code",
  "credential",
  "idtoken",
  "jwt",
  "key",
  "oauthcode",
  "password",
  "passwd",
  "refreshtoken",
  "secret",
  "session",
  "sessionid",
  "signature",
  "ticket",
  "token",
  "verificationtoken",
]);
const isSensitiveKey = (key: string): boolean => {
  const separated = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  const compact = separated.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    SENSITIVE_QUERY_KEY.test(separated) ||
    SENSITIVE_COMPACT_KEYS.has(compact) ||
    /^tickets?(?:id|key|token)?$/.test(compact)
  );
};
const decodeUrlComponent = (value: string): string => {
  let decoded = value;
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
};

export const canonicalLocalDraftUrl = (rawUrl: string): string => {
  const url = new URL(rawUrl.trim());
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const fragment = decodeUrlComponent(url.hash.slice(1));
  const fragmentSeparator = fragment.indexOf("?");
  const fragmentQuery =
    fragmentSeparator >= 0 ? fragment.slice(fragmentSeparator + 1) : fragment;
  const fragmentPath = `/${(fragmentSeparator >= 0
    ? fragment.slice(0, fragmentSeparator)
    : fragment
  ).replace(/^\/+/, "")}`;
  if (
    !isSupportedCaptureUrl(url.toString()) ||
    SENSITIVE_PATH_SEGMENT.test(decodeUrlComponent(url.pathname)) ||
    SENSITIVE_PATH_SEGMENT.test(fragmentPath) ||
    [...url.searchParams.keys()].some(isSensitiveKey) ||
    [...new URLSearchParams(fragmentQuery).keys()].some(isSensitiveKey)
  ) {
    throw new Error("SENSITIVE_URL");
  }
  const query = [...url.searchParams.entries()].filter(([key]) => {
    const lowered = key.toLowerCase();
    return !lowered.startsWith("utm_") && !TRACKING_KEYS.has(lowered);
  });
  url.search = "";
  for (const [key, value] of query) url.searchParams.append(key, value);
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
    typeof fields.url === "string" &&
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
  canonicalLocalDraftUrl(fields.url);
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

export const clearLocalDraft = async (
  storage: LocalStorageArea,
  rawUrl: string,
): Promise<void> => {
  await storage.remove(localDraftStorageKey(rawUrl));
};

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
import { isSupportedCaptureUrl } from "./capture";

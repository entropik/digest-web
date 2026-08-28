import { isIP } from "node:net";

const TRACKING_KEYS = new Set([
  "_kx",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "nb_klid",
  "ref_src",
]);

const PRIVATE_HOST_SUFFIXES = [".lan", ".local", ".internal"];
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

const decodeUrlComponent = (value: string, completedPasses = 0): string => {
  let decoded = value;
  for (let pass = completedPasses; pass < 3; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      if (pass > 0 && !/%[0-9a-f]{2}/i.test(decoded)) break;
      throw new UnsafeUrlError("INVALID_URL_ENCODING");
    }
  }
  if (/%[0-9a-f]{2}/i.test(decoded)) {
    throw new UnsafeUrlError("INVALID_URL_ENCODING");
  }
  return decoded;
};

const isSensitiveKey = (key: string): boolean => {
  const separated = decodeUrlComponent(key, 1).replace(
    /([a-z0-9])([A-Z])/g,
    "$1_$2",
  );
  const compact = separated.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    SENSITIVE_QUERY_KEY.test(separated) ||
    SENSITIVE_COMPACT_KEYS.has(compact) ||
    /^tickets?(?:id|key|token)?$/.test(compact)
  );
};

const isPrivateIpv4 = (host: string): boolean => {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
};

const mappedIpv4 = (host: string): string | null => {
  const withoutZone = host.split("%", 1)[0] ?? host;
  const dottedMatch = withoutZone.match(
    /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  const dotted = dottedMatch?.slice(2).map(Number);
  const ipv6 = dotted
    ? `${dottedMatch![1]}${((dotted[0]! << 8) | dotted[1]!).toString(16)}:${((dotted[2]! << 8) | dotted[3]!).toString(16)}`
    : withoutZone;
  const [left, right, ...extra] = ipv6.split("::");
  if (extra.length) return null;
  const leftGroups = left ? left.split(":") : [];
  const rightGroups = right === undefined || !right ? [] : right.split(":");
  const missing = right === undefined ? 0 : 8 - leftGroups.length - rightGroups.length;
  const groups = [
    ...leftGroups,
    ...Array(Math.max(0, missing)).fill("0"),
    ...rightGroups,
  ].map((group) => Number.parseInt(group, 16));
  if (
    groups.length !== 8 ||
    groups.slice(0, 5).some((group) => group !== 0) ||
    groups[5] !== 0xffff
  ) {
    return null;
  }
  const high = groups[6]!;
  const low = groups[7]!;
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
};

const isPrivateIpv6 = (host: string): boolean => {
  const normalized = host.toLowerCase();
  const ipv4 = mappedIpv4(normalized);
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    (ipv4 !== null && isPrivateIpv4(ipv4))
  );
};

export const isPrivateHost = (host: string): boolean => {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  const ipHost = normalized.replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  ) {
    return true;
  }
  const family = isIP(ipHost);
  return family === 4
    ? isPrivateIpv4(ipHost)
    : family === 6
      ? isPrivateIpv6(ipHost)
      : false;
};

export class UnsafeUrlError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const canonicalizePublicUrl = (rawUrl: string): string => {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new UnsafeUrlError("INVALID_URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new UnsafeUrlError("UNSUPPORTED_SCHEME");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URL_CREDENTIALS");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isPrivateHost(host)) {
    throw new UnsafeUrlError("PRIVATE_URL");
  }
  const fragment = decodeUrlComponent(url.hash.slice(1));
  const fragmentSeparator = fragment.indexOf("?");
  const fragmentPathValue =
    fragmentSeparator >= 0 ? fragment.slice(0, fragmentSeparator) : fragment;
  const fragmentRoute = fragmentPathValue.match(/^!?(\/.*)$/)?.[1];
  const fragmentPath = fragmentRoute
    ? `/${fragmentRoute.replace(/^\/+/, "")}`
    : "";
  const fragmentQuery =
    fragmentSeparator >= 0
      ? fragment.slice(fragmentSeparator + 1)
      : fragment.includes("=")
        ? fragment
        : "";
  if (
    SENSITIVE_PATH_SEGMENT.test(decodeUrlComponent(url.pathname)) ||
    SENSITIVE_PATH_SEGMENT.test(fragmentPath)
  ) {
    throw new UnsafeUrlError("AUTHENTICATED_PAGE");
  }

  if (
    [...url.searchParams.keys()].some(isSensitiveKey) ||
    [...new URLSearchParams(fragmentQuery).keys()].some(isSensitiveKey)
  ) {
    throw new UnsafeUrlError("SENSITIVE_QUERY");
  }

  const query = [...url.searchParams.entries()].filter(([key]) => {
    const lowered = key.toLowerCase();
    return !lowered.startsWith("utm_") && !TRACKING_KEYS.has(lowered);
  });
  url.search = "";
  for (const [key, value] of query) url.searchParams.append(key, value);

  url.hostname = host;
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  if (["fullscreen", "top"].includes(url.hash.slice(1).toLowerCase())) {
    url.hash = "";
  }
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }
  return url.toString();
};

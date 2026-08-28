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
  /\/(?:account|admin|auth|console|dashboard|login|oauth|signin)(?:\/|$)/i;

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
  if (SENSITIVE_PATH_SEGMENT.test(url.pathname)) {
    throw new UnsafeUrlError("AUTHENTICATED_PAGE");
  }

  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEY.test(key)) {
      throw new UnsafeUrlError("SENSITIVE_QUERY");
    }
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

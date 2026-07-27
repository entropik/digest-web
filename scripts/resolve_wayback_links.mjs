#!/usr/bin/env node
/**
 * Resolve stable Wayback destinations for links explicitly marked as dead.
 *
 * The original public URL remains the canonical `url`. We first look for the
 * latest successful capture of that exact URL, then fall back to the latest
 * capture of the same origin root. Private, local, credentialed, or malformed
 * URLs are never sent to the archive service.
 */

import { readFile, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { resolve } from "node:path";

const WAYBACK_AVAILABILITY = "https://archive.org/wayback/available";
const PRIVATE_HOST_SUFFIXES = [".lan", ".local", ".internal"];

const args = process.argv.slice(2);
const valueAfter = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};

const dataPath = resolve(valueAfter("--data", "data/links.json"));
const concurrency = Math.max(1, Number.parseInt(valueAfter("--concurrency", "6"), 10) || 6);
const refresh = args.includes("--refresh");
const checkOnly = args.includes("--check");
const checkedAt = new Date().toISOString().slice(0, 10);

const isPrivateIpv4 = (host) => {
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return false;
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
};

const isPrivateIpv6 = (host) => {
  const normalized = host.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") ||
    normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
    normalized.startsWith("fea") || normalized.startsWith("feb");
};

const parsePublicHttpUrl = (value) => {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!["http:", "https:"].includes(url.protocol) || !host || url.username || url.password) {
    throw new Error("URL publique HTTP(S) sans identifiants requise");
  }
  if (
    host === "localhost" ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix)) ||
    (isIP(host) === 4 && isPrivateIpv4(host)) ||
    (isIP(host) === 6 && isPrivateIpv6(host))
  ) {
    throw new Error("hôte privé ou local");
  }
  return url;
};

const normalizeSnapshot = (snapshot, expectedHost) => {
  if (!snapshot?.available || String(snapshot.status) !== "200") return null;
  const replay = new URL(snapshot.url);
  if (!["web.archive.org", "www.web.archive.org"].includes(replay.hostname.toLowerCase())) {
    return null;
  }
  const match = replay.pathname.match(/^\/web\/(\d{14})(?:[a-z_]+)?\/(https?:\/\/.+)$/i);
  if (!match) return null;
  const capturedUrl = new URL(match[2]);
  if (capturedUrl.hostname.toLowerCase() !== expectedHost.toLowerCase()) return null;
  replay.protocol = "https:";
  return {
    archive_url: replay.toString(),
    archive_timestamp: match[1],
  };
};

const wait = (milliseconds) => new Promise((resolvePromise) => {
  setTimeout(resolvePromise, milliseconds);
});

const fetchSnapshot = async (url, attempt = 1) => {
  const requestUrl = `${WAYBACK_AVAILABILITY}?url=${encodeURIComponent(url)}`;
  try {
    const response = await fetch(requestUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "OoblikDigestArchive/1.0 (+https://digest.ooblik.com/)",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      const retryAfter = Number.parseInt(response.headers.get("retry-after") || "", 10);
      await wait(Number.isFinite(retryAfter) ? retryAfter * 1000 : attempt * 1200);
      return fetchSnapshot(url, attempt + 1);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (attempt < 4) {
      await wait(attempt * 1200);
      return fetchSnapshot(url, attempt + 1);
    }
    throw error;
  }
};

const resolveArchive = async (item) => {
  const original = parsePublicHttpUrl(String(item.url));
  const exactPayload = await fetchSnapshot(original.href);
  const exact = normalizeSnapshot(exactPayload?.archived_snapshots?.closest, original.hostname);
  if (exact) return { ...exact, archive_scope: "url" };

  const root = new URL("/", original.origin).href;
  if (root !== original.href) {
    const rootPayload = await fetchSnapshot(root);
    const fallback = normalizeSnapshot(rootPayload?.archived_snapshots?.closest, original.hostname);
    if (fallback) return { ...fallback, archive_scope: "site" };
  }
  return null;
};

const payload = JSON.parse(await readFile(dataPath, "utf8"));
if (!Array.isArray(payload)) throw new Error(`${dataPath}: un tableau JSON était attendu`);

if (checkOnly) {
  const unresolved = payload.filter(
    (item) =>
      item.status === "dead" &&
      (
        (!item.archive_url && !(item.archive_status === "missing" && item.archive_checked_at)) ||
        (item.archive_url && !item.archive_checked_at)
      ),
  );
  if (unresolved.length) {
    for (const item of unresolved.slice(0, 20)) {
      process.stderr.write(`ARCHIVE NON VÉRIFIÉE: ${item.url}\n`);
    }
    if (unresolved.length > 20) {
      process.stderr.write(`… et ${unresolved.length - 20} autre(s)\n`);
    }
    process.exitCode = 1;
  }
  process.stdout.write(
    `${JSON.stringify({
      dead: payload.filter((item) => item.status === "dead").length,
      archived: payload.filter((item) => item.status === "dead" && item.archive_url).length,
      missing: payload.filter((item) => item.status === "dead" && item.archive_status === "missing").length,
      unchecked: unresolved.length,
    })}\n`,
  );
  process.exit();
}

for (const item of payload) {
  if (item.status === "dead" && item.archive_url && !item.archive_checked_at) {
    item.archive_checked_at = checkedAt;
  }
}

const pending = payload.filter(
  (item) =>
    item.status === "dead" &&
    (refresh || (!item.archive_url && item.archive_status !== "missing")),
);
let cursor = 0;
let resolved = 0;
let missing = 0;
let errors = 0;

const worker = async () => {
  while (cursor < pending.length) {
    const item = pending[cursor];
    cursor += 1;
    try {
      const archive = await resolveArchive(item);
      item.archive_checked_at = checkedAt;
      if (archive) {
        Object.assign(item, archive);
        delete item.archive_status;
        resolved += 1;
      } else {
        delete item.archive_url;
        delete item.archive_timestamp;
        delete item.archive_scope;
        item.archive_status = "missing";
        missing += 1;
      }
    } catch (error) {
      errors += 1;
      process.stderr.write(`ERREUR ${item.url}: ${error.message}\n`);
    }
  }
};

await Promise.all(Array.from({ length: Math.min(concurrency, pending.length || 1) }, worker));
await writeFile(dataPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const totalArchived = payload.filter(
  (item) => item.status === "dead" && item.archive_url,
).length;
process.stdout.write(
  `${JSON.stringify({
    dead: payload.filter((item) => item.status === "dead").length,
    checked: pending.length,
    resolved,
    missing,
    errors,
    archived_total: totalArchived,
  })}\n`,
);

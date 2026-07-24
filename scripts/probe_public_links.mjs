#!/usr/bin/env node
/**
 * Probe curated public links without changing their historical URLs.
 *
 * The JSON output is evidence for editorial review. Only definitive HTTP
 * disappearance signals (404/410) and DNS NXDOMAIN are candidates for an
 * automatic `dead` status; access blocks such as 401/403/429 are not.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const input = resolve(process.argv[2] ?? "import/pinboard/curated/all-public.json");
const output = resolve(process.argv[3] ?? "import/pinboard/probe-results.json");
const concurrency = Math.max(1, Number(process.argv[4] ?? 20));
const timeoutMs = Math.max(1000, Number(process.argv[5] ?? 12000));
const links = JSON.parse(await readFile(input, "utf8"));
const results = new Array(links.length);
let cursor = 0;

function normalizedHost(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function probe(item, index) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(item.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; OoblikDigestArchive/1.0; +https://digest.ooblik.com/)",
        accept: "text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.5",
      },
    });
    await response.body?.cancel();
    const originalHost = normalizedHost(item.url);
    const finalHost = normalizedHost(response.url);
    results[index] = {
      url: item.url,
      status: response.status,
      final_url: response.url,
      cross_host_redirect:
        Boolean(originalHost && finalHost) && originalHost !== finalHost,
      definitive_dead: [404, 410].includes(response.status),
    };
  } catch (error) {
    const code = error?.cause?.code ?? "";
    results[index] = {
      url: item.url,
      error: error?.name === "AbortError" ? "timeout" : String(code || error?.message || error),
      definitive_dead: code === "ENOTFOUND",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= links.length) return;
    await probe(links[index], index);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
await writeFile(output, `${JSON.stringify(results, null, 2)}\n`, "utf8");

const counts = {
  input: results.length,
  ok: results.filter((item) => item.status >= 200 && item.status < 400).length,
  blocked: results.filter((item) => [401, 403, 429].includes(item.status)).length,
  definitive_dead: results.filter((item) => item.definitive_dead).length,
  errors: results.filter((item) => item.error).length,
  cross_host_redirects: results.filter((item) => item.cross_host_redirect).length,
};
process.stdout.write(`${JSON.stringify(counts)}\n`);

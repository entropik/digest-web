import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const dataDirectory = path.join(root, "public", "data");
const files = (await readdir(dataDirectory)).filter(
  (name) => name.startsWith("digest-index-") && name.endsWith(".json"),
);

const budgets = {
  base: { gzip: 280 * 1024, brotli: 230 * 1024 },
  supplemental: { gzip: 240 * 1024, brotli: 200 * 1024 },
  details: { gzip: 140 * 1024, brotli: 120 * 1024 },
};

const artifacts = new Map();
for (const [name, budget] of Object.entries(budgets)) {
  const matches = files.filter((file) => file.startsWith(`digest-index-${name}.`));
  if (matches.length !== 1) {
    throw new Error(`Expected one ${name} search index, found ${matches.length}.`);
  }
  const contents = await readFile(path.join(dataDirectory, matches[0]));
  const gzip = gzipSync(contents, { level: 9 }).length;
  const brotli = brotliCompressSync(contents, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
  if (gzip > budget.gzip || brotli > budget.brotli) {
    throw new Error(
      `${name} index exceeds its budget: gzip ${gzip}/${budget.gzip}, Brotli ${brotli}/${budget.brotli} bytes.`,
    );
  }
  artifacts.set(name, {
    entries: JSON.parse(contents.toString("utf8")),
    gzip,
    brotli,
  });
}

const baseEntries = artifacts.get("base").entries;
const supplementalEntries = artifacts.get("supplemental").entries;
const detailEntries = artifacts.get("details").entries;
if (!baseEntries.length || !supplementalEntries.length) {
  throw new Error("Base and supplemental search indexes must both contain links.");
}
if (baseEntries.some((entry) => "m" in entry || "x" in entry)) {
  throw new Error("The initial index must not contain streams or archive text.");
}
if (detailEntries.some((entry) => !entry.i || typeof entry.x !== "string")) {
  throw new Error("The detail index must contain only addressable archive text.");
}

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
const links = baseEntries.map((entry) => ({ ...entry, searchText: "" }));
const queries = ["design", "intelligence artificielle", "github", "photographie", "outil"];
let longestSearch = 0;
for (const query of queries) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const startedAt = performance.now();
  links.filter((entry) => {
    entry.searchText ||= normalize(
      [
        entry.t,
        entry.c,
        entry.u,
        entry.d,
        entry.s,
        entry.n,
        ...(entry.g || []),
      ].join(" "),
    );
    return terms.every((term) => entry.searchText.includes(term));
  });
  longestSearch = Math.max(longestSearch, performance.now() - startedAt);
}
if (longestSearch >= 50) {
  throw new Error(
    `Search filtering exceeded the 50 ms long-task budget: ${longestSearch.toFixed(1)} ms.`,
  );
}

const summary = Object.fromEntries(
  [...artifacts].map(([name, artifact]) => [
    name,
    {
      entries: artifact.entries.length,
      gzipKiB: Math.ceil(artifact.gzip / 1024),
      brotliKiB: Math.ceil(artifact.brotli / 1024),
    },
  ]),
);
process.stdout.write(
  `Search indexes within budget: ${JSON.stringify(summary)}; longest filter ${longestSearch.toFixed(1)} ms.\n`,
);

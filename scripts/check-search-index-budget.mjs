import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const dataDirectory = path.join(root, "public", "data");
const files = (await readdir(dataDirectory)).filter(
  (name) => name.startsWith("digest-index-") && name.endsWith(".json"),
);

const budgets = {
  base: { gzip: 200 * 1024, brotli: 165 * 1024 },
  descriptions: { gzip: 180 * 1024, brotli: 150 * 1024 },
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
const descriptionEntries = artifacts.get("descriptions").entries;
const supplementalEntries = artifacts.get("supplemental").entries;
const detailEntries = artifacts.get("details").entries;
if (!baseEntries.length || !supplementalEntries.length || !descriptionEntries.length) {
  throw new Error("Base, supplemental, and description search indexes must all contain links.");
}
if (baseEntries.some((entry) => "d" in entry || "m" in entry || "x" in entry)) {
  throw new Error("The initial index must not contain descriptions, streams or archive text.");
}
if (descriptionEntries.some((entry) => !entry.i || typeof entry.d !== "string")) {
  throw new Error("The description index must contain only addressable descriptions.");
}
if (detailEntries.some((entry) => !entry.i || typeof entry.x !== "string")) {
  throw new Error("The detail index must contain only addressable archive text.");
}

// L'index Pagefind doit exister et ses tables doivent couvrir exactement le
// catalogue fusionné de chaque langue (base puis supplémentaire, dédoublonné).
const pagefindDirectory = path.join(dataDirectory, "..", "pagefind");
const pagefindLibrary = path.join(pagefindDirectory, "pagefind.js");
const libraryStat = await stat(pagefindLibrary).catch(() => null);
if (!libraryStat?.isFile()) {
  throw new Error("Pagefind index is missing: rebuild with scripts/build-pagefind-index.mjs.");
}
const readLanguageIndex = async (language, kind) => {
  const languageData = path.join(dataDirectory, "..", language === "en" ? "en/data" : "data");
  const match = (await readdir(languageData)).find(
    (name) => name.startsWith(`digest-index-${kind}.`) && name.endsWith(".json"),
  );
  return JSON.parse(await readFile(path.join(languageData, match), "utf8"));
};
const catalogLength = async (language) => {
  const seen = new Set();
  for (const entry of [
    ...(await readLanguageIndex(language, "base")),
    ...(await readLanguageIndex(language, "supplemental")),
  ]) {
    if (entry?.i) seen.add(entry.i);
  }
  return seen.size;
};
const mapBudgets = { fr: 60 * 1024, en: 60 * 1024 };
const mapSummary = {};
for (const [language, budget] of Object.entries(mapBudgets)) {
  const mapPath = path.join(pagefindDirectory, `link-map.${language}.json`);
  const contents = await readFile(mapPath).catch(() => null);
  if (!contents) {
    throw new Error(`Pagefind link map is missing for ${language}.`);
  }
  const gzip = gzipSync(contents, { level: 9 }).length;
  if (gzip > budget) {
    throw new Error(
      `Pagefind ${language} link map exceeds its budget: gzip ${gzip}/${budget} bytes.`,
    );
  }
  const positions = Object.values(JSON.parse(contents.toString("utf8")));
  if (new Set(positions).size !== positions.length) {
    throw new Error(`Pagefind ${language} link map contains duplicate positions.`);
  }
  const expected = await catalogLength(language);
  if (positions.length !== expected) {
    throw new Error(
      `Pagefind ${language} link map covers ${positions.length} positions, expected ${expected}.`,
    );
  }
  mapSummary[language] = { fragments: positions.length, gzipKiB: Math.ceil(gzip / 1024) };
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
  `Search indexes within budget: ${JSON.stringify({ ...summary, pagefind: mapSummary })}.\n`,
);

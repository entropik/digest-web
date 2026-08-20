import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { config as loadEnvironment } from "dotenv";

import { parseCatalog } from "../src/catalog.js";
import type { WordpressOverride } from "../src/wordpress-import.js";
import {
  acceptHighConfidenceWordpressDestinations,
  buildWordpressDestinationSearchReport,
  buildWordpressDestinationTargets,
  rankWordpressDestinationCandidates,
  renderWordpressDestinationSearchHtml,
  wordpressDestinationSearchQuery,
  type BraveWebResult,
  type WordpressDestinationSearchCache,
} from "../src/wordpress-destination-recovery.js";

const args = process.argv.slice(2);
const valueAfter = (name: string): string | undefined => {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
};
const inputPath = resolve(valueAfter("--input") ?? "../import/wordpress/export.xml");
const workDirectory = resolve(valueAfter("--workdir") ?? dirname(inputPath));
const siteRoot = resolve(valueAfter("--site") ?? "..");
const cachePath = join(workDirectory, "destination-search-cache.json");
const reportPath = join(workDirectory, "destination-search-report.json");
const htmlPath = join(workDirectory, "destination-recovery-review.html");
const overridesPath = resolve(
  valueAfter("--overrides") ?? join(workDirectory, "overrides.json"),
);
const limitRaw = valueAfter("--limit");
const limit = limitRaw ? Number.parseInt(limitRaw, 10) : Number.POSITIVE_INFINITY;
const onlyId = valueAfter("--wordpress-id");
const acceptHigh = args.includes("--accept-high");
if (!(limit > 0)) throw new Error("INVALID_LIMIT");

loadEnvironment({ path: join(workDirectory, ".env"), quiet: true });
const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
if (!apiKey) throw new Error(`BRAVE_SEARCH_API_KEY_MISSING:${join(workDirectory, ".env")}`);

const optionalJson = async <T>(path: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
};

const [xml, currentLinks, overrides, cache] = await Promise.all([
  readFile(inputPath, "utf8"),
  readFile(join(siteRoot, "data", "links.json"), "utf8").then(parseCatalog),
  optionalJson<Record<string, WordpressOverride>>(overridesPath, {}),
  optionalJson<WordpressDestinationSearchCache>(cachePath, {}),
]);
const allTargets = buildWordpressDestinationTargets({ xml, currentLinks });
const targets = onlyId
  ? allTargets.filter((target) => target.wordpress_id === onlyId)
  : allTargets;
if (onlyId && targets.length === 0) throw new Error(`WORDPRESS_TARGET_NOT_FOUND:${onlyId}`);

const pending = targets
  .filter((target) => {
    const cached = cache[target.wordpress_id];
    return !cached || cached.query !== wordpressDestinationSearchQuery(target.title);
  })
  .slice(0, limit);

const search = async (query: string): Promise<BraveWebResult[]> => {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "10");
  url.searchParams.set("country", "fr");
  url.searchParams.set("search_lang", "fr");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });
  if (!response.ok) throw new Error(`BRAVE_SEARCH_HTTP_${response.status}`);
  const payload = (await response.json()) as {
    web?: { results?: BraveWebResult[] };
  };
  return payload.web?.results ?? [];
};

for (let index = 0; index < pending.length; index += 5) {
  const batch = pending.slice(index, index + 5);
  const searched = await Promise.all(
    batch.map(async (target) => {
      const query = wordpressDestinationSearchQuery(target.title);
      const results = await search(query);
      return {
        ...target,
        query,
        searched_at: new Date().toISOString(),
        candidates: rankWordpressDestinationCandidates({
          target,
          results,
          currentLinks,
        }),
      };
    }),
  );
  for (const item of searched) cache[item.wordpress_id] = item;
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  process.stdout.write(
    `Recherche ${Math.min(index + batch.length, pending.length)}/${pending.length}\n`,
  );
}

const report = buildWordpressDestinationSearchReport({ targets, cache });
const accepted = acceptHigh
  ? acceptHighConfidenceWordpressDestinations(report, overrides)
  : { overrides, accepted: 0 };
await Promise.all([
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`),
  writeFile(htmlPath, renderWordpressDestinationSearchHtml(report, accepted.overrides)),
  ...(acceptHigh
    ? [writeFile(overridesPath, `${JSON.stringify(accepted.overrides, null, 2)}\n`)]
    : []),
]);
process.stdout.write(
  `${JSON.stringify(
    {
      targets: report.target_count,
      searched: report.searched_count,
      pending: report.pending_count,
      high_confidence: report.high_confidence,
      medium_confidence: report.medium_confidence,
      without_candidate: report.without_candidate,
      automatically_accepted: accepted.accepted,
      report_path: reportPath,
      html_path: htmlPath,
    },
    null,
    2,
  )}\n`,
);

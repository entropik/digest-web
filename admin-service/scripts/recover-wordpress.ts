import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { parseCatalog } from "../src/catalog.js";
import type { WordpressOverride, WordpressProbe } from "../src/wordpress-import.js";
import {
  archiveAllRemainingWordpressPosts,
  archiveUnresolvedWordpressPosts,
  buildWordpressRecoveryReport,
  buildWordpressValidationReport,
  renderWordpressRecoveryHtml,
  renderWordpressValidationHtml,
  restoreDetectedWordpressSources,
} from "../src/wordpress-recovery.js";

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
const overridesPath = resolve(
  valueAfter("--overrides") ?? join(workDirectory, "overrides.json"),
);
const probesPath = valueAfter("--probe-results")
  ? resolve(valueAfter("--probe-results")!)
  : null;
const archiveUnresolved = args.includes("--archive-unresolved");
const archiveAllRemaining = args.includes("--archive-all-remaining");
const restoreDetectedSources = args.includes("--restore-detected-sources");
if (
  [archiveUnresolved, archiveAllRemaining, restoreDetectedSources].filter(Boolean)
    .length > 1
) {
  throw new Error("INCOMPATIBLE_RECOVERY_ACTIONS");
}

const optionalJson = async <T>(path: string | null, fallback: T): Promise<T> => {
  if (!path) return fallback;
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
};

const [xml, currentLinks, overrides, probes] = await Promise.all([
  readFile(inputPath, "utf8"),
  readFile(join(siteRoot, "data", "links.json"), "utf8").then(parseCatalog),
  optionalJson<Record<string, WordpressOverride>>(overridesPath, {}),
  optionalJson<WordpressProbe[]>(probesPath, []),
]);
const report = buildWordpressRecoveryReport({
  xml,
  currentLinks,
  overrides,
  probes,
});
const validation = buildWordpressValidationReport({
  xml,
  currentLinks,
  overrides,
  probes,
});
await mkdir(workDirectory, { recursive: true });
const reportPath = join(workDirectory, "recovery-report.json");
const htmlPath = join(workDirectory, "recovery-review.html");
const validationHtmlPath = join(workDirectory, "validation-review.html");
const sourceGapHtmlPath = join(workDirectory, "source-gap-review.html");
const restored = restoreDetectedSources
  ? restoreDetectedWordpressSources({ xml, currentLinks, overrides })
  : null;
const updatedOverrides = restored
  ? restored.overrides
  : archiveAllRemaining
  ? archiveAllRemainingWordpressPosts({
      xml,
      currentLinks,
      overrides,
      probes,
    })
  : archiveUnresolved
    ? archiveUnresolvedWordpressPosts(report, overrides)
    : null;
const sourceGaps = restored?.review.filter((item) => item.candidates.length) ?? [];
await Promise.all([
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`),
  writeFile(htmlPath, renderWordpressRecoveryHtml(report)),
  writeFile(validationHtmlPath, renderWordpressValidationHtml(validation)),
  ...(restored
    ? [
        writeFile(
          sourceGapHtmlPath,
          renderWordpressValidationHtml({
            items: sourceGaps.map((item) => ({ ...item, reason: "source_gap" })),
            base_overrides: restored.overrides,
          }),
        ),
      ]
    : []),
  ...(updatedOverrides
    ? [writeFile(overridesPath, `${JSON.stringify(updatedOverrides, null, 2)}\n`)]
    : []),
]);
process.stdout.write(
  `${JSON.stringify(
    {
      missing_source: report.missing_source,
      unique_candidates: report.unique.length,
      ambiguous_candidates: report.ambiguous.length,
      unresolved_review: report.unresolved.length,
      excluded: report.excluded.length,
      report_path: reportPath,
      html_path: htmlPath,
      archived_unresolved: archiveUnresolved ? report.unresolved.length : 0,
      archived_remaining: archiveAllRemaining ? validation.items.length : 0,
      restored_detected: restored?.accepted ?? 0,
      restored_explicit: restored?.explicit ?? 0,
      restored_embedded: restored?.embedded ?? 0,
      restoration_duplicates: restored?.duplicates.length ?? 0,
      restoration_review: restored?.review.length ?? 0,
      source_gap_review: sourceGaps.length,
      source_gap_html_path: restored ? sourceGapHtmlPath : null,
      overrides_path: updatedOverrides ? overridesPath : null,
      validation_review: validation.items.length,
      validation_html_path: validationHtmlPath,
    },
    null,
    2,
  )}\n`,
);

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { segmentConfig, segmentNames } from "./translation-production.mjs";

const temporary = await mkdtemp(path.join(tmpdir(), "digest-segment-check-"));
try {
  await mkdir(".build-i18n", { recursive: true });
  await cp("public/translation-source.json", ".build-i18n/manifest.json");
  const config = path.join(temporary, "segments.yaml"), destination = path.join(temporary, "public");
  const paths = ["/a-propos/"];
  await writeFile(config, segmentConfig(paths));
  const result = spawnSync(process.env.HUGO_BINARY || "hugo", ["--gc", "--minify", "--panicOnWarning", "--baseURL", "https://digest.ooblik.com/", "--config", `hugo.yaml,${config}`, "--renderSegments", segmentNames(paths).join(","), "--destination", destination, "--cleanDestinationDir"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(await readFile(path.join(destination, "en/a-propos/index.html")), await readFile("public/en/a-propos/index.html"));
  assert.deepEqual(await readFile(path.join(destination, "translation-snapshot.json")), await readFile("public/translation-snapshot.json"));
  await assert.rejects(readFile(path.join(destination, "index.html")));
  await assert.rejects(readFile(path.join(destination, "en/archives/index.html")));
  process.stdout.write("Targeted Hugo output matches the complete build and excludes unrelated pages.\n");
} finally {
  await rm(temporary, { recursive: true, force: true });
}

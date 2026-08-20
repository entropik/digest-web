import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { canonicalizeTags } from "../src/tag-taxonomy.js";

test("tag aliases collapse to existing editorial themes", () => {
  assert.deepEqual(
    canonicalizeTags([
      "Bernard STIEGLER",
      "Photographes",
      "Livre / Book",
      "risographie",
      "Actualités",
    ]).tags,
    ["stiegler", "photographie", "livre", "riso"],
  );
});

test("registered tags control spelling and reject free-form taxonomy", () => {
  const result = canonicalizeTags(
    ["#PHOTO", "Bernard Stiegler", "sténopé"],
    ["photo", "stiegler"],
  );
  assert.deepEqual(result.tags, ["photo", "stiegler"]);
  assert.deepEqual(result.unknown, ["sténopé"]);
});

test("every retired tag route has a retrospective Hugo redirect", async () => {
  const legacyRoutes = [
    "photographes", "livre-book", "actualites", "camera-porn",
    "imprimerie-amp-technique", "risographie", "ai-workforce-platform",
    "technique", "selfhosted", "up", "zines", "ai-assistant",
    "ai-assitant", "alternative", "artgeneratif", "bernard-stiegler",
    "concours", "hasselblad", "ia-generative", "interview",
    "livre-d-artiste", "mcp", "messaging", "outil-riso", "separation",
    "thomas-boivin", "vibe-coding",
  ];
  const directory = new URL("../../content/tags/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".md"));
  const frontMatter = (
    await Promise.all(files.map((name) => readFile(new URL(name, directory), "utf8")))
  ).join("\n");

  for (const route of legacyRoutes) {
    assert.match(frontMatter, new RegExp(`\\"/tags/${route}/\\"`), route);
  }
});

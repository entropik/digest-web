import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  activeTagNames,
  canonicalizeTags,
  parseTagDefinitions,
  serializeTagDefinitions,
  tagLabelKey,
} from "../src/tag-taxonomy.js";

const definitions = parseTagDefinitions(JSON.stringify([
  { name: "automobile", description: "Mobilité", aliases: ["car"] },
  { name: "IA", description: "Intelligence artificielle", aliases: ["IA générative"] },
  { name: "photographie", description: "Images", aliases: ["Photographes"] },
]));

test("tag identity ignores accents, case and punctuation", () => {
  assert.equal(tagLabelKey("  MÉMORY / graph  "), tagLabelKey("memory-graph"));
});

test("tag aliases collapse to existing editorial themes", () => {
  assert.deepEqual(
    canonicalizeTags([
      "Photographes",
      "car",
      "IA générative",
    ], definitions).tags,
    ["photographie", "automobile", "IA"],
  );
});

test("registered tags control spelling and reject free-form taxonomy", () => {
  const result = canonicalizeTags(
    ["#PHOTOGRAPHIE", "car", "sténopé"],
    definitions,
  );
  assert.deepEqual(result.tags, ["photographie", "automobile"]);
  assert.deepEqual(result.unknown, ["sténopé"]);
});

test("the active registry is short, deterministic and round-trippable", () => {
  assert.deepEqual(activeTagNames(definitions), ["automobile", "IA", "photographie"]);
  assert.deepEqual(parseTagDefinitions(serializeTagDefinitions(definitions)), definitions);
  assert.throws(
    () => parseTagDefinitions('[{"name":"IA","aliases":["ia"]}]'),
    /Duplicate tag label/,
  );
});

test("an existing historical tag can be preserved without becoming active", () => {
  const result = canonicalizeTags(["mémoire-web"], definitions, ["mémoire-web"]);
  assert.deepEqual(result, { tags: ["mémoire-web"], unknown: [] });
  assert.doesNotMatch(activeTagNames(definitions).join(" "), /mémoire-web/);
});

test("archived themes reserve their names and aliases without remaining selectable", () => {
  const registry = parseTagDefinitions(JSON.stringify([
    ...definitions,
    { name: "ancien thème", description: "Mémoire", aliases: ["ancienne route"], active: false },
  ]));
  assert.doesNotMatch(activeTagNames(registry).join(" "), /ancien thème/);
  assert.deepEqual(canonicalizeTags(["ancienne route"], registry), {
    tags: [],
    unknown: ["ancienne route"],
  });
  assert.throws(
    () => parseTagDefinitions(serializeTagDefinitions([
      ...registry,
      { name: "nouveau", description: "", aliases: ["ancienne route"] },
    ])),
    /Duplicate tag label/,
  );
});

test("the production registry stays intentionally short and includes editorial aliases", async () => {
  const { readFile } = await import("node:fs/promises");
  const registry = parseTagDefinitions(
    await readFile(new URL("../../data/tags.json", import.meta.url), "utf8"),
  );
  assert.ok(activeTagNames(registry).length >= 30 && activeTagNames(registry).length <= 50);
  assert.deepEqual(canonicalizeTags(["car", "uk", "sociologie", "IA générative"], registry).tags, [
    "automobile",
    "Royaume-Uni",
    "société",
    "IA",
  ]);
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

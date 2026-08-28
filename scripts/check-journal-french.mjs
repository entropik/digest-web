import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusDirectory = path.join(root, "content", "flux", "journal-procrastinateur");
const importerPath = path.join(root, "scripts", "import-keredit-journal.ps1");
const datedFile = /^\d{4}-\d{2}-\d{2}\.md$/;

const importer = await readFile(importerPath, "utf8");
const replacements = new Map();
for (const match of importer.matchAll(/'([^'\r\n]+)'\s*=\s*'([^'\r\n]+)'/g)) {
  const [, plain, accented] = match;
  if (plain.toLocaleLowerCase("fr") !== accented.toLocaleLowerCase("fr")) {
    replacements.set(plain.toLocaleLowerCase("fr"), accented);
  }
}
assert(replacements.size > 400, "Le lexique français de l’importeur paraît incomplet.");

const contextualMistakes = [
  /\bce qui s['’]est passe\b/giu,
  /\bgenerent\b/giu,
  /\bpas lance(?:s)?\b/giu,
  /\bmal encapsule\b/giu,
  /\b(?:CI|build|test|pipeline|workflow) a casse\b/giu,
  /\bdesynchronise(?:e|es|s)?\b/giu,
  /\ba (?:chaque|cause|juste titre|Enter)\b/giu,
  /\ba ce (?:stade|moment|ping)\b/giu,
];
const protectedMarkdown = /```[\s\S]*?```|`[^`\r\n]+`|https?:\/\/[^\s)]+|\]\([^)]+\)/g;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const findings = [];

for (const filename of (await readdir(corpusDirectory)).filter((name) => datedFile.test(name)).sort()) {
  const source = await readFile(path.join(corpusDirectory, filename), "utf8");
  const prose = source.replace(protectedMarkdown, (match) => " ".repeat(match.length));
  const lowered = prose.toLocaleLowerCase("fr");

  for (const [plain, accented] of replacements) {
    const pattern = new RegExp(`(?<!\\p{L})${escapeRegExp(plain)}(?!\\p{L})`, "gu");
    if (pattern.test(lowered)) findings.push(`${filename}: « ${plain} » → « ${accented} »`);
  }
  for (const pattern of contextualMistakes) {
    pattern.lastIndex = 0;
    const match = pattern.exec(prose);
    if (match) findings.push(`${filename}: forme contextuelle « ${match[0]} »`);
  }
}

assert.equal(
  findings.length,
  0,
  `Graphies françaises ASCII détectées dans le journal :\n${findings.join("\n")}`,
);
process.stdout.write(`Contrôle français réussi : ${replacements.size} graphies surveillées.\n`);

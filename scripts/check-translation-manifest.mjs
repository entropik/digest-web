import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const file = process.argv[2] || "public/translation-source.json";
const manifest = JSON.parse(await readFile(file, "utf8"));
assert.equal(manifest.version, 2);
assert.match(manifest.revision, /^[a-f0-9]{64}$/);
const canonical = JSON.stringify(manifest.items).replaceAll("&", "\\u0026").replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
assert.equal(manifest.revision, createHash("sha256").update(canonical).digest("hex"));
const byId = new Map(manifest.items.map(item => [item.id, item]));
for (const item of manifest.items) {
  assert(Array.isArray(item.impacts) && item.impacts.length, `${item.id} has no impact route`);
  assert(item.impacts.includes(item.route), `${item.id} does not include its own route`);
}
for (const consumer of manifest.items.filter(item => item.kind === "page")) {
  for (const dependency of consumer.dependencies) {
    const source = byId.get(dependency);
    assert(source, `${consumer.id} references missing ${dependency}`);
    assert(source.impacts.includes(consumer.route), `${dependency} does not rebuild ${consumer.route}`);
  }
}
const archive = manifest.items.find(item => item.kind === "page" && /^\/archives\/\d{4}-/.test(item.route));
if (archive) assert(archive.impacts.includes("/archives/"));
const journal = manifest.items.find(item => item.kind === "page" && /^\/flux\/[^/]+\/\d{4}-/.test(item.route));
if (journal) {
  const parent = journal.route.split("/").slice(0, 3).join("/") + "/";
  assert(journal.impacts.includes("/flux/") && journal.impacts.includes(parent));
}
process.stdout.write(`Translation manifest v2 validated (${manifest.items.length} items).\n`);

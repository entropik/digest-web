import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  changePublishedMetadata,
  changeVisibility,
  parseCatalog,
  serializeCatalog,
  type DigestLink,
} from "../src/catalog.js";

const link = (): DigestLink => ({
  id: "ebd768df-0bfa-5e55-9af8-776fbb2fdd31",
  title: "Example",
  url: "https://example.com",
  category: "Développement",
  added: "2026-07-27",
});

test("published metadata correction preserves historical fields", () => {
  const original: DigestLink = {
    ...link(),
    status: "dead",
    status_note: "Conservé pour mémoire",
    archive_url: "https://web.archive.org/web/20200101000000/https://example.com",
  };
  const mutation = changePublishedMetadata([original], original.id, {
    title: "Titre corrigé",
    category: "Médias & Veille",
    description: "Description corrigée",
    tags: ["archive"],
  });
  assert.equal(mutation.link.url, original.url);
  assert.equal(mutation.link.added, original.added);
  assert.equal(mutation.link.status, "dead");
  assert.equal(mutation.link.archive_url, original.archive_url);
});

test("hide is reversible and keeps editorial metadata", () => {
  const hidden = changeVisibility(
    [link()],
    link().id,
    "hide",
    new Date("2026-07-27T10:00:00.000Z"),
  );
  assert.equal(hidden.changed, true);
  assert.equal(hidden.link.visibility, "hidden");
  assert.equal(hidden.link.hidden_at, "2026-07-27T10:00:00.000Z");
  assert.equal(hidden.link.title, "Example");

  const restored = changeVisibility(hidden.links, link().id, "restore");
  assert.equal(restored.changed, true);
  assert.equal(restored.link.visibility, undefined);
  assert.equal(restored.link.hidden_at, undefined);
});

test("repeated actions are idempotent", () => {
  const hidden = changeVisibility([link()], link().id, "hide");
  assert.equal(changeVisibility(hidden.links, link().id, "hide").changed, false);
  const restored = changeVisibility(hidden.links, link().id, "restore");
  assert.equal(
    changeVisibility(restored.links, link().id, "restore").changed,
    false,
  );
});

test("catalog parsing rejects duplicate ids", () => {
  const duplicate = [link(), { ...link(), url: "https://example.org" }];
  assert.throws(() => parseCatalog(JSON.stringify(duplicate)), /Duplicate link id/);
});

test("serialized hidden catalog remains valid", () => {
  const hidden = changeVisibility([link()], link().id, "hide");
  assert.deepEqual(parseCatalog(serializeCatalog(hidden.links)), hidden.links);
});

test("the production Digest catalog is accepted by the admin service", async () => {
  const catalogPath = new URL("../../data/links.json", import.meta.url);
  const catalog = parseCatalog(await readFile(catalogPath, "utf8"));
  assert.ok(catalog.length > 3900);
  assert.equal(new Set(catalog.map((item) => item.id)).size, catalog.length);
});

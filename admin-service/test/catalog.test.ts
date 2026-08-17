import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  addPublishedTags,
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
    url: original.url,
    title: "Titre corrigé",
    category: "Médias & Veille",
    description: "Description corrigée",
    tags: ["archive"],
    reactivate: false,
  });
  assert.equal(mutation.link.url, original.url);
  assert.equal(mutation.link.id, original.id);
  assert.equal(mutation.link.added, original.added);
  assert.equal(mutation.link.status, "dead");
  assert.equal(mutation.link.archive_url, original.archive_url);
});

test("published URL correction is included in change detection", () => {
  const original = link();
  const mutation = changePublishedMetadata([original], original.id, {
    url: "https://example.org",
    title: original.title,
    category: original.category,
    description: "",
    tags: [],
    reactivate: false,
  });
  assert.equal(mutation.changed, true);
  assert.equal(mutation.link.url, "https://example.org");
  assert.deepEqual(mutation.link.previous_urls, ["https://example.com"]);
});

test("successive URL corrections retain every distinct public address", () => {
  const original: DigestLink = {
    ...link(),
    previous_urls: ["https://old.example.com"],
  };
  const first = changePublishedMetadata([original], original.id, {
    url: "https://example.org",
    title: original.title,
    category: original.category,
    description: "",
    tags: [],
    reactivate: true,
  });
  const second = changePublishedMetadata(first.links, original.id, {
    url: "https://example.net",
    title: original.title,
    category: original.category,
    description: "",
    tags: [],
    reactivate: false,
  });
  assert.deepEqual(second.link.previous_urls, [
    "https://old.example.com",
    "https://example.com",
    "https://example.org",
  ]);
});

test("restoring an old URL removes it from the historical list", () => {
  const original: DigestLink = {
    ...link(),
    url: "https://example.org",
    previous_urls: ["https://example.com"],
  };
  const mutation = changePublishedMetadata([original], original.id, {
    url: "https://example.com",
    title: original.title,
    category: original.category,
    description: "",
    tags: [],
    reactivate: false,
  });
  assert.equal(mutation.link.url, "https://example.com");
  assert.deepEqual(mutation.link.previous_urls, ["https://example.org"]);
});

test("published URL correction rejects a URL already in the catalog", () => {
  const original = link();
  const duplicate = { ...link(), id: "link-2", url: "https://example.org" };
  assert.throws(
    () =>
      changePublishedMetadata([original, duplicate], original.id, {
        url: duplicate.url,
        title: original.title,
        category: original.category,
        description: "",
        tags: [],
        reactivate: false,
      }),
    /DUPLICATE_LINK_URL/,
  );
});

test("editorial revalidation removes every dead-link marker", () => {
  const original: DigestLink = {
    ...link(),
    status: "dead",
    status_note: "Conservé pour mémoire",
    archive_url: "https://web.archive.org/web/20200101000000/https://example.com",
    archive_status: "available",
    archive_checked_at: "2026-08-01T12:00:00.000Z",
    tags: ["design", "lien-mort", "archive"],
  };
  const mutation = changePublishedMetadata([original], original.id, {
    url: original.url,
    title: original.title,
    category: original.category,
    description: "",
    tags: original.tags ?? [],
    reactivate: true,
  });

  assert.equal(mutation.changed, true);
  assert.equal(mutation.reactivated, true);
  assert.equal(mutation.link.status, undefined);
  assert.equal(mutation.link.status_note, undefined);
  assert.equal(mutation.link.archive_url, undefined);
  assert.equal(mutation.link.archive_status, undefined);
  assert.equal(mutation.link.archive_checked_at, undefined);
  assert.deepEqual(mutation.link.tags, ["design", "archive"]);
  assert.equal(mutation.link.id, original.id);
  assert.equal(mutation.link.added, original.added);
});

test("adding tags preserves existing tags and is idempotent", () => {
  const original: DigestLink = {
    ...link(),
    description: "Description",
    tags: ["design", "outil"],
  };
  const mutation = addPublishedTags(
    [original],
    original.id,
    ["Outil", "grille", "mise-en-page"],
  );
  assert.equal(mutation.changed, true);
  assert.deepEqual(mutation.link.tags, [
    "design",
    "outil",
    "grille",
    "mise-en-page",
  ]);
  assert.equal(mutation.link.description, original.description);
  assert.equal(
    addPublishedTags(mutation.links, original.id, ["GRILLE"]).changed,
    false,
  );
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

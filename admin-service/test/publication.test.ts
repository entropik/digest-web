import assert from "node:assert/strict";
import test from "node:test";
import type { CurationDraft } from "../src/curation-types.js";
import { buildPublicationFiles, stableLinkId } from "../src/publication.js";

const draft: CurationDraft = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  url: "https://example.com/article",
  title: "Article",
  category: "Développement",
  description: "Résumé éditorial.",
  tags: ["web"],
  privateNote: "Ce texte privé ne doit jamais apparaître.",
  state: "draft",
  publicationId: null,
  publishedLinkId: null,
  publishedCommit: null,
  createdAt: "2026-07-27T10:00:00.000Z",
  updatedAt: "2026-07-27T10:00:00.000Z",
  publishedAt: null,
};

test("publication produces the catalog, archive and social image", async () => {
  const result = await buildPublicationFiles({
    currentLinks: [],
    drafts: [draft],
    digestDate: "2026-07-27",
    title: "27 juillet 2026",
    introduction: "Introduction",
    seoDescription: "Description SEO",
  });
  assert.deepEqual(Object.keys(result.files).sort(), [
    "content/archives/2026-07-27.md",
    "data/links.json",
    "static/social/2026-07-27-linkedin.png",
    "static/social/2026-07-27.png",
  ]);
  assert.equal(
    result.linkIdsByDraft.get(draft.id),
    stableLinkId(draft.url),
  );
  const combined = Object.values(result.files)
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  assert.doesNotMatch(combined, /Ce texte privé/);
  assert.match(combined, /Résumé éditorial/);
  assert.match(combined, /\/social\/2026-07-27\.png/);
  const image = result.files["static/social/2026-07-27.png"];
  assert.ok(Buffer.isBuffer(image));
  assert.deepEqual(image.subarray(0, 8), Buffer.from("89504e470d0a1a0a", "hex"));
  const linkedInImage = result.files["static/social/2026-07-27-linkedin.png"];
  assert.ok(Buffer.isBuffer(linkedInImage));
  assert.equal(linkedInImage.readUInt32BE(16), 1200);
  assert.equal(linkedInImage.readUInt32BE(20), 1200);
});

test("stable link ids match UUID v5 URL namespace", () => {
  assert.equal(
    stableLinkId("https://example.com/article"),
    "ded9467b-4ded-55ce-b3c1-2217b99bcc3e",
  );
});

test("Focus publication writes its type into the archive", async () => {
  const result = await buildPublicationFiles({
    currentLinks: [],
    drafts: [draft],
    digestDate: "2026-09-02",
    title: "Software Factory",
    introduction: "Introduction",
    seoDescription: "Description SEO",
    editorialType: "focus",
  });
  assert.match(
    result.files["content/archives/2026-09-02.md"] as string,
    /editorial_type: "focus"/,
  );
});

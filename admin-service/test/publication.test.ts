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

test("publication produces exactly the catalog and one archive", () => {
  const result = buildPublicationFiles({
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
  ]);
  assert.equal(
    result.linkIdsByDraft.get(draft.id),
    stableLinkId(draft.url),
  );
  const combined = Object.values(result.files).join("\n");
  assert.doesNotMatch(combined, /Ce texte privé/);
  assert.match(combined, /Résumé éditorial/);
});

test("stable link ids match UUID v5 URL namespace", () => {
  assert.equal(
    stableLinkId("https://example.com/article"),
    "ded9467b-4ded-55ce-b3c1-2217b99bcc3e",
  );
});

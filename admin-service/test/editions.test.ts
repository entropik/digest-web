import assert from "node:assert/strict";
import test from "node:test";
import {
  editEdition,
  parseEdition,
  renderEdition,
  setEditionDraft,
} from "../src/editions.js";

test("edition serialization safely quotes front matter and round trips", () => {
  const source = renderEdition({
    digestDate: "2026-07-27",
    title: 'Digest : "édition"',
    description: "IA & développement",
    introduction: "Une introduction.\n\nAvec deux paragraphes.",
  });
  assert.match(source, /images:\n  - "\/social\/2026-07-27\.png"/);
  assert.deepEqual(parseEdition(source), {
    digestDate: "2026-07-27",
    title: 'Digest : "édition"',
    description: "IA & développement",
    introduction: "Une introduction.\n\nAvec deux paragraphes.",
  });
});

test("an empty edition becomes a private draft and can be restored", () => {
  const published = renderEdition({
    digestDate: "2022-02-08",
    title: "8 février 2022",
    description: "Une édition historique.",
    introduction: "Une introduction.",
  });

  const hidden = setEditionDraft(published, true);
  assert.match(hidden, /\ndraft: true\n/);
  assert.equal(parseEdition(hidden).draft, true);
  assert.equal(setEditionDraft(hidden, true), hidden);

  const restored = setEditionDraft(hidden, false);
  assert.doesNotMatch(restored, /\ndraft:/);
  assert.equal(parseEdition(restored).draft, undefined);
});

test("editing an edition preserves its draft state", () => {
  const source = renderEdition({
    digestDate: "2026-08-29",
    title: "Titre initial",
    description: "Description initiale.",
    introduction: "Introduction initiale.",
    draft: true,
  });

  const edited = editEdition(source, {
    title: "Titre corrigé",
    description: "Description corrigée.",
    introduction: "Introduction corrigée.",
  });

  assert.deepEqual(parseEdition(edited), {
    digestDate: "2026-08-29",
    title: "Titre corrigé",
    description: "Description corrigée.",
    introduction: "Introduction corrigée.",
    draft: true,
  });
});

test("Focus editions round trip and keep their editorial type", () => {
  const source = renderEdition({
    digestDate: "2026-09-02",
    title: "Software Factory",
    description: "Un dossier thématique.",
    introduction: "Une introduction.",
    editorialType: "focus",
  });

  assert.match(source, /editorial_type: "focus"/);
  assert.equal(parseEdition(source).editorialType, "focus");
  assert.equal(setEditionDraft(source, true).includes('editorial_type: "focus"'), true);
});

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

test("toggling draft preserves unrelated front matter and visual artwork", () => {
  const customArchive = [
    "---",
    'title: "Après l’IDE, voici l’ADE"',
    "date: 2026-08-29",
    'digest_date: "2026-08-29"',
    "draft: true",
    'description: "Une description détaillée."',
    "images:",
    '  - "/social/2026-08-29.png"',
    'visual: "/social/2026-08-29-linkedin.png"',
    "# Un commentaire conservé",
    'custom_field: "valeur"',
    "---",
    "",
    "Le corps de l'archive.",
  ].join("\n");

  const published = setEditionDraft(customArchive, false);
  assert.doesNotMatch(published, /\ndraft:/);
  assert.match(published, /\nvisual: "\/social\/2026-08-29-linkedin\.png"/);
  assert.match(published, /\n# Un commentaire conservé/);
  assert.match(published, /\ncustom_field: "valeur"/);
  assert.match(published, /Le corps de l'archive\.$/);

  const draftAgain = setEditionDraft(published, true);
  assert.match(draftAgain, /\ndraft: true\n/);
  assert.match(draftAgain, /\nvisual: "\/social\/2026-08-29-linkedin\.png"/);
  assert.match(draftAgain, /\ncustom_field: "valeur"/);

  const edited = editEdition(draftAgain, {
    title: "Nouveau titre",
    description: "Nouvelle description",
    introduction: "Nouvelle intro",
  });
  assert.equal(parseEdition(edited).visual, "/social/2026-08-29-linkedin.png");
  assert.match(edited, /\nvisual: "\/social\/2026-08-29-linkedin\.png"/);
});

test("setEditionDraft targets only the column-zero draft property and preserves nested draft keys", () => {
  const source = [
    "---",
    'title: "Édition avec sous-clé draft"',
    'digest_date: "2026-08-29"',
    "metadata:",
    '  draft: "valeur imbriquée"',
    "draft: true",
    "---",
    "",
    "Contenu.",
  ].join("\n");

  const published = setEditionDraft(source, false);
  assert.match(published, /metadata:\n  draft: "valeur imbriquée"/);
  assert.doesNotMatch(published, /^draft:/m);

  const draftAgain = setEditionDraft(published, true);
  assert.match(draftAgain, /metadata:\n  draft: "valeur imbriquée"/);
  assert.match(draftAgain, /^draft: true/m);
});

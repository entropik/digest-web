import assert from "node:assert/strict";
import test from "node:test";
import {
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
    title: "Archive Pinboard",
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

import assert from "node:assert/strict";
import test from "node:test";
import { parseEdition, renderEdition } from "../src/editions.js";

test("edition serialization safely quotes front matter and round trips", () => {
  const source = renderEdition({
    digestDate: "2026-07-27",
    title: 'Digest : "édition"',
    description: "IA & développement",
    introduction: "Une introduction.\n\nAvec deux paragraphes.",
  });
  assert.deepEqual(parseEdition(source), {
    digestDate: "2026-07-27",
    title: 'Digest : "édition"',
    description: "IA & développement",
    introduction: "Une introduction.\n\nAvec deux paragraphes.",
  });
});


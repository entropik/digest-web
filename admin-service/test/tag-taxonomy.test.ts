import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeTags } from "../src/tag-taxonomy.js";

test("tag aliases collapse to existing editorial themes", () => {
  assert.deepEqual(
    canonicalizeTags([
      "Bernard STIEGLER",
      "Photographes",
      "Livre / Book",
      "risographie",
      "Actualités",
    ]).tags,
    ["stiegler", "photographie", "livre", "riso"],
  );
});

test("registered tags control spelling and reject free-form taxonomy", () => {
  const result = canonicalizeTags(
    ["#PHOTO", "Bernard Stiegler", "sténopé"],
    ["photo", "stiegler"],
  );
  assert.deepEqual(result.tags, ["photo", "stiegler"]);
  assert.deepEqual(result.unknown, ["sténopé"]);
});

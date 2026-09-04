import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { isTranslationOnly, segmentConfig, validatePlan } from "./translation-production.mjs";

const body = {
  version: 1, baseRevision: "a".repeat(64), targetRevision: "b".repeat(64), manifestRevision: "c".repeat(64), fullBuild: false,
  items: [{ id: "link:1", fields: ["title"] }], paths: ["/", "/archives/2026-09-04/"], artwork: { upsert: ["2026-09-04"], remove: [] },
};
const plan = { ...body, revision: createHash("sha256").update(JSON.stringify(body)).digest("hex") };

test("only the closed translation file set can use a targeted build", () => {
  assert.equal(isTranslationOnly(["data/translations_en.json", "data/translation_build_plan.json", "static/social/en/2026-09-04.png"], validatePlan(plan)), true);
  assert.equal(isTranslationOnly(["data/translations_en.json", "data/translation_build_plan.json", "hugo.yaml"], plan), false);
  assert.equal(isTranslationOnly(["data/translations_en.json"], plan), false);
  assert.equal(isTranslationOnly(["data/translations_en.json", "data/translation_build_plan.json"], { ...plan, fullBuild: true }), false);
  assert.throws(() => validatePlan({ ...plan, paths: ["../fr"] }), /INVALID/);
});

test("the render segment selects exact English paths and only the French public snapshot", () => {
  const config = segmentConfig(plan.paths);
  assert.match(config, /languages: \[en\]/);
  assert.match(config, /path: "\/archives\/2026-09-04"/);
  assert.match(config, /languages: \[fr\][\s\S]*path: "\/"[\s\S]*kind: home[\s\S]*output: "\{translationsnapshot\}"/);
});

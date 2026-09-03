import assert from "node:assert/strict";
import test from "node:test";
import { translationBudget } from "../src/translation-budget.js";

test("backfill includes existing account usage and never treats a new month as new credit", () => {
  assert.equal(translationBudget(200_000, 1_000_000), 500_000);
  assert.equal(translationBudget(700_000, 1_000_000), 0);
  assert.equal(translationBudget(750_000, 1_000_000, true), 250_000);
  assert.equal(translationBudget(null, null), 0);
  assert.equal(translationBudget(300_000, 500_000), 200_000);
});

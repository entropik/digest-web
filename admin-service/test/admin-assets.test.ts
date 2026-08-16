import assert from "node:assert/strict";
import test from "node:test";

import { adminJs, dashboardPage } from "../src/admin-assets.js";

test("publication wording uses Publier throughout the dashboard", () => {
  const page = dashboardPage("Marc");

  assert.doesNotMatch(page, /Composer/);
  assert.equal((page.match(/Publier/g) ?? []).length, 3);
});

test("draft toolbar exposes an accessible select-all toggle", () => {
  const page = dashboardPage("Marc");

  assert.match(
    page,
    /id="select-all-drafts" type="button" aria-pressed="false">Tout sélectionner/,
  );
  assert.match(adminJs, /Tout désélectionner/);
  assert.match(
    adminJs,
    /drafts\.forEach\(\(draft\)=>selected\.add\(draft\.id\)\)/,
  );
});

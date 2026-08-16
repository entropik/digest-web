import assert from "node:assert/strict";
import test from "node:test";

import { adminCss, adminJs, dashboardPage } from "../src/admin-assets.js";

test("the private dashboard links to the unlisted Chrome extension", () => {
  const page = dashboardPage("Marc");

  assert.match(
    page,
    /href="https:\/\/chromewebstore\.google\.com\/detail\/nlejcccmpbajpoaknlecegkpgdegiflf" target="_blank" rel="noreferrer">Installer l’extension<\/a>/,
  );
});

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
    /visibleDraftCards\(\)\.map\(\(card\)=>card\.dataset\.draftId\)/,
  );
  assert.match(adminJs, /visibleIds\.forEach\(\(id\)=>selected\.add\(id\)\)/);
  assert.doesNotMatch(
    adminJs,
    /drafts\.forEach\(\(draft\)=>selected\.add\(draft\.id\)\)/,
  );
});

test("publication uses one count-aware action and keeps server validation implicit", () => {
  const page = dashboardPage("Marc");

  assert.doesNotMatch(page, /Vérifier le lot|preview-publication/);
  assert.doesNotMatch(adminJs, /publications\/preview|previewPublication/);
  assert.match(
    page,
    /id="submit-publication" type="submit" disabled>Publier les liens/,
  );
  assert.match(adminJs, /Publier le lien/);
  assert.match(adminJs, /Publier les "\+selected\.size\+" liens/);
  assert.match(adminJs, /submit\.disabled=!selected\.size/);
});

test("publication progress exposes four real and accessible stages", () => {
  assert.match(
    adminJs,
    /publicationStepLabels=\["Préparation","Validation","Déploiement","En ligne"\]/,
  );
  assert.match(adminJs, /role="progressbar"/);
  assert.match(adminJs, /aria-valuemax="4"/);
  assert.match(adminJs, /Validation GitHub en cours/);
  assert.match(adminJs, /Comptez généralement 3 à 4 minutes/);
  assert.match(adminJs, /Voir l’édition/);
  assert.match(adminCss, /@keyframes progress-scan/);
  assert.match(adminCss, /@media\(prefers-reduced-motion:reduce\)/);
});

test("publication polling resumes and retries with a single managed timer", () => {
  assert.match(
    adminJs,
    /activePublicationStates=new Set\(\["committing","validating","deploying"\]\)/,
  );
  assert.match(adminJs, /clearTimeout\(publicationPollTimer\)/);
  assert.match(adminJs, /document\.visibilityState==="visible"/);
  assert.match(adminJs, /Nouvelle tentative automatique/);
  assert.match(
    adminJs,
    /loadPublications\(\)\.then\(\(items\)=>\{resumePublicationPolling\(items\);return items\}\)/,
  );
  assert.doesNotMatch(adminJs, /data-refresh-publication|>Actualiser</);
});

test("a confirmed publication is tracked before ancillary refreshes", () => {
  assert.match(
    adminJs,
    /startPublicationPolling\(publication\.id,false\);\s*try\{await Promise\.all\(\[loadDrafts\(\),loadPublications\(\)\]\)\}/,
  );
  assert.match(adminJs, /if\(error\.status\)pendingPublicationRequestId=null/);
  assert.doesNotMatch(adminJs, /error\.status&&error\.status<500/);
});

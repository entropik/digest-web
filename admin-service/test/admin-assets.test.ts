import assert from "node:assert/strict";
import test from "node:test";

import { adminCss, adminJs, dashboardPage } from "../src/admin-assets.js";

test("the admin uses the same browser icons as the public site", () => {
  const page = dashboardPage("Marc");

  assert.match(page, /<link rel="icon" href="\/favicon\.svg">/);
  assert.match(
    page,
    /<link rel="icon" type="image\/png" sizes="16x16" href="\/favicon-16x16\.png">/,
  );
  assert.match(
    page,
    /<link rel="icon" type="image\/png" sizes="32x32" href="\/favicon-32x32\.png">/,
  );
  assert.match(
    page,
    /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png">/,
  );
  assert.match(
    page,
    /<link rel="mask-icon" href="\/safari-pinned-tab\.svg">/,
  );
  assert.match(page, /<meta name="theme-color" content="#ff5c35">/);
  assert.match(
    page,
    /<meta name="msapplication-TileColor" content="#ff5c35">/,
  );
});

test("the private dashboard links to the unlisted Chrome extension", () => {
  const page = dashboardPage("Marc");

  assert.match(
    page,
    /href="https:\/\/chromewebstore\.google\.com\/detail\/nlejcccmpbajpoaknlecegkpgdegiflf" target="_blank" rel="noreferrer">Installer l’extension<\/a>/,
  );
});

test("the private dashboard displays the current site version after logout", () => {
  const page = dashboardPage("Marc");

  assert.match(
    page,
    /<button id="admin-logout" type="button">Se déconnecter<\/button>\s*<span class="admin-version" aria-label="Version v1\.12\.1">v1\.12\.1<\/span>/,
  );
  assert.match(adminCss, /\.admin-version\{/);
});

test("categories can be created, renamed and deleted from a dedicated panel", () => {
  const page = dashboardPage("Marc");

  assert.match(page, /data-panel-button="categories">Catégories/);
  assert.match(page, /id="category-create-form"/);
  assert.match(page, /id="category-list"/);
  assert.match(page, /name="description" maxlength="500"/);
  assert.match(adminJs, /name="categoryDescription"/);
  assert.match(adminJs, /description:form\.elements\.description\.value/);
  assert.match(adminJs, /POST/);
  assert.match(adminJs, /PATCH/);
  assert.match(adminJs, /DELETE/);
  assert.match(adminJs, /CATEGORY_IN_USE/);
  assert.match(adminJs, /data-rename-category/);
  assert.match(adminJs, /data-delete-category/);
});

test("publication wording uses Publier throughout the dashboard", () => {
  const page = dashboardPage("Marc");

  assert.doesNotMatch(page, /Composer/);
  assert.equal((page.match(/Publier/g) ?? []).length, 3);
});

test("LinkedIn credentials can be configured without server access", () => {
  const page = dashboardPage("Marc");
  assert.match(page, /data-panel-button="linkedin"/);
  assert.match(page, /id="linkedin-config-form"/);
  assert.match(page, /name="clientSecret" type="password"/);
  assert.match(adminJs, /\/api\/admin\/linkedin\/configure/);
  assert.match(page, /Connecter mon compte LinkedIn/);
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

test("draft saves render the persisted server response without a stale reload", () => {
  assert.match(adminJs, /Tags, séparés par des virgules/);
  assert.match(
    adminJs,
    /drafts=drafts\.map\(\(draft\)=>draft\.id===data\.draft\.id\?data\.draft:draft\);renderDrafts\(\)/,
  );
  assert.match(adminJs, /data\.draft\.tags\.length\+" tag"/);
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
  assert.match(adminJs, /Validation et build GitHub en cours/);
  assert.match(adminJs, /Mise en ligne en cours/);
  assert.doesNotMatch(adminJs, /3 à 4 minutes/);
  assert.match(adminJs, /Voir l’édition/);
  assert.match(adminCss, /@keyframes progress-scan/);
  assert.match(adminCss, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(adminJs, />GitHub Actions<\/a>/);
  assert.match(adminJs, /item\.deployUrl\|\|item\.validateUrl/);
  assert.doesNotMatch(adminJs, />Validation<\/a>|>Déploiement<\/a>/);
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

test("published link correction exposes and submits an editable URL", () => {
  assert.match(adminJs, /<input name="url" type="url"/);
  assert.match(adminJs, /url:urlInput\.value/);
  assert.match(adminJs, /urlInput\.checkValidity\(\)/);
  assert.match(adminJs, /urlInput\.value=data\.link\.url/);
  assert.match(adminJs, /DUPLICATE_LINK_URL:"Cette URL est déjà utilisée/);
  assert.match(adminJs, /L’identifiant et la date d’ajout ne changeront pas/);
});

test("dead links can be explicitly revalidated and report reactivation", () => {
  assert.match(adminJs, /name="reactivate" type="checkbox" checked/);
  assert.match(adminJs, /Retirer le statut « lien mort » et la marquer active/);
  assert.match(adminJs, /reactivate:Boolean\(reactivateControl\?\.checked\)/);
  assert.match(adminJs, /Lien corrigé et réactivé/);
  assert.match(adminJs, /if\(data\.reactivated\)/);
  assert.match(adminJs, /data\.link\.tags\.join\(", "\)/);
});

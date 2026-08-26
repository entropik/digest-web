import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { adminCss, adminJs, dashboardPage } from "../src/admin-assets.js";

test("the public header reveals its admin switch only to the owner", () => {
  const header = readFileSync(
    new URL("../../layouts/_partials/header.html", import.meta.url),
    "utf8",
  );
  const footer = readFileSync(
    new URL("../../layouts/_partials/extend_footer.html", import.meta.url),
    "utf8",
  );
  const publicCss = readFileSync(
    new URL("../../assets/css/extended/digest.css", import.meta.url),
    "utf8",
  );

  assert.match(header, /data-admin-switch[\s\S]*href=.*admin[\s\S]*hidden>/);
  assert.match(footer, /fetch\("\/api\/admin\/session"/);
  assert.match(footer, /session\?\.isAdmin === true/);
  assert.match(footer, /adminSwitch\.hidden = false/);
  assert.match(publicCss, /\.header-admin-switch \{[\s\S]*?border: 0;/);
});

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
    /href="https:\/\/chromewebstore\.google\.com\/detail\/nlejcccmpbajpoaknlecegkpgdegiflf" target="_blank" rel="noreferrer"><span>Extension<\/span><span aria-hidden="true">↗<\/span><\/a>/,
  );
  assert.doesNotMatch(page, /Voir le Digest/);
  assert.match(page, /<a href="\/\"><span>Digest<\/span><span aria-hidden="true">↗<\/span><\/a>/);
});

test("the private dashboard displays the current site version after logout", () => {
  const page = dashboardPage("Marc");

  assert.match(
    page,
    /<button id="admin-logout" type="button">Déconnexion<\/button>\s*<span class="admin-version" aria-label="Version v1\.22\.2">v1\.22\.2<\/span>/,
  );
  assert.match(adminCss, /\.admin-version\{/);
  assert.match(adminCss, /\.admin-version\{[^}]*background:var\(--ink\);color:var\(--paper\)/);
});

test("categories can be created, renamed and deleted from a dedicated panel", () => {
  const page = dashboardPage("Marc");

  assert.match(page, /data-panel-button="categories" aria-pressed="false">[\s\S]*Catégories/);
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

test("drafts use a compact optional tag picker instead of the historical tag list", () => {
  assert.doesNotMatch(adminJs, /Tags, séparés par des virgules|known-tags|datalist/);
  assert.match(adminJs, /Tags <small>· facultatifs · 5 maximum/);
  assert.match(adminJs, /role="combobox"/);
  assert.match(adminJs, /role="listbox"/);
  assert.match(adminJs, /aria-autocomplete="list"/);
  assert.match(adminJs, /aria-activedescendant/);
  assert.match(adminJs, /event\.key==="ArrowDown"\|\|event\.key==="ArrowUp"/);
  assert.match(adminJs, /data-theme-status role="status" aria-live="polite"/);
  assert.match(adminCss, /min-width:44px;min-height:44px/);
  assert.match(adminJs, /options\.themes\.filter/);
  assert.match(adminJs, /pickerTags\(card\.querySelector/);
  assert.match(
    adminJs,
    /drafts=drafts\.map\(\(draft\)=>draft\.id===data\.draft\.id\?data\.draft:draft\);renderDrafts\(\)/,
  );
  assert.match(adminJs, /data\.draft\.tags\.length\+" tag"/);
});

test("the admin exposes the complete tag register and its lifecycle", () => {
  const page = dashboardPage("Marc");
  assert.match(page, /data-panel-button="themes" aria-pressed="false">[\s\S]*Tags/);
  assert.match(page, /id="theme-search"/);
  assert.match(page, /id="theme-count"/);
  assert.match(page, /id="theme-archived-count"/);
  assert.match(page, /id="theme-undocumented-count"/);
  assert.match(page, /id="theme-create-form"/);
  assert.match(page, /data-theme-view="active"/);
  assert.match(page, /data-theme-view="archived"/);
  assert.match(page, /data-theme-view="undocumented"/);
  assert.match(adminJs, /renderThemes/);
  assert.match(adminJs, /data-save-theme/);
  assert.match(adminJs, /data-merge-theme/);
  assert.match(adminJs, /data-archive-theme/);
  assert.match(adminJs, /data-reactivate-theme/);
  assert.match(adminJs, /Tags fusionnés/);
  assert.match(adminJs, /À documenter/);
  assert.match(adminJs, /draftCount/);
  assert.match(adminJs, /\/api\/admin\/themes/);
  assert.match(adminJs, /\/reactivate/);
  assert.match(adminCss, /\.theme-row/);
  assert.match(page, /class="admin-nav-index">01<\/span>/);
  assert.match(page, /class="admin-nav-index">09<\/span>/);
  assert.match(page, /class="admin-nav-label">Liens retirés<\/span>/);
  assert.match(adminCss, /\.admin-nav\{display:grid;grid-template-columns:repeat\(5/);
  assert.match(adminCss, /@media\(max-width:900px\)\{\.admin-nav\{grid-template-columns:repeat\(3/);
  assert.match(adminCss, /@media\(max-width:520px\)[\s\S]*\.admin-nav\{grid-template-columns:repeat\(2/);
  assert.match(adminJs, /button\.setAttribute\("aria-pressed",String\(active\)\)/);
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
  assert.match(adminJs, /data-refresh-publication/);
  assert.match(adminJs, />Revérifier</);
  assert.match(
    adminJs,
    /\/api\/admin\/curation\/publications\/"\+encodeURIComponent\(id\)/,
  );
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
  assert.match(adminJs, /updateThemePicker\(card\.querySelector/);
});

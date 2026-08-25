import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  generateLinkedInImage,
  generateOptimizedLinkedInImage,
  generateSocialImage,
  generateOptimizedSocialImage,
  MAX_SOCIAL_IMAGE_BYTES,
  socialImageSvg,
  type SocialImageFamily,
} from "../src/social-image.js";

const input = {
  digestDate: "2026-08-16",
  title: "16 août 2026",
  description:
    "Intelligence artificielle, développement, design, édition et création numérique.",
  linkCount: 13,
};

test("social image generation is deterministic and produces a 1200 by 627 PNG", () => {
  const first = generateSocialImage(input);
  const second = generateSocialImage(input);
  assert.deepEqual(first, second);
  assert.deepEqual(first.subarray(0, 8), Buffer.from("89504e470d0a1a0a", "hex"));
  assert.equal(first.readUInt32BE(16), 1200);
  assert.equal(first.readUInt32BE(20), 627);
});

test("social PNG optimization stays deterministic and under its byte budget", async () => {
  const first = await generateOptimizedSocialImage(input);
  const second = await generateOptimizedSocialImage(input);
  assert.deepEqual(first, second);
  assert.ok(first.length < MAX_SOCIAL_IMAGE_BYTES);
  assert.ok(first.length < generateSocialImage(input).length);
  assert.deepEqual(first.subarray(0, 8), Buffer.from("89504e470d0a1a0a", "hex"));
});

test("LinkedIn image generation is deterministic and produces a square PNG", async () => {
  const first = generateLinkedInImage(input);
  const second = generateLinkedInImage(input);
  assert.deepEqual(first, second);
  assert.equal(first.readUInt32BE(16), 1200);
  assert.equal(first.readUInt32BE(20), 1200);
  const optimized = await generateOptimizedLinkedInImage(input);
  assert.ok(optimized.length < MAX_SOCIAL_IMAGE_BYTES);
});

test("the seeded system reaches every composition family", () => {
  const families = new Set<SocialImageFamily>();
  const accents = new Set<string>();
  for (let day = 1; day <= 31; day += 1) {
    const variation = socialImageSvg({
      ...input,
      digestDate: `2026-08-${String(day).padStart(2, "0")}`,
    });
    families.add(variation.family);
    accents.add(variation.accent);
  }
  assert.deepEqual(
    [...families].sort(),
    ["broken-grid", "collision", "screens"],
  );
  assert.deepEqual(
    [...accents].sort(),
    ["#00AEEF", "#1646D8", "#EC008C", "#FFD500"],
  );
});

test("the SVG keeps editorial content and palette constraints", () => {
  const { svg, accent } = socialImageSvg(input);
  assert.match(svg, /OOBLIK/);
  assert.match(svg, /13 LIENS/);
  assert.match(svg, /INTELLIGENCE ARTIFICIELLE/);
  assert.match(svg, /#E10600/);
  assert.ok(["#00AEEF", "#FFD500", "#EC008C", "#1646D8"].includes(accent));
  assert.match(svg, /linearGradient id="background"/);
  assert.match(svg, /pattern id="texture-accent"/);
  assert.match(svg, /pattern id="texture-primary"/);
  assert.match(svg, /fill="url\(#texture-(?:accent|primary|black|red)\)"/);
  assert.match(svg, /aria-hidden="true"/);
  assert.match(svg, /data-layer="accidents"/);
  assert.doesNotMatch(svg, /width="1000" height="150" fill="#F4F2ED"/);
  assert.doesNotMatch(svg, /width="410" height="138" fill="#F4F2ED"/);
  assert.doesNotMatch(svg, /width="940" height="350" fill="#F4F2ED"/);
});

test("waves vary between editions instead of appearing systematically", () => {
  const variants = Array.from({ length: 31 }, (_, index) =>
    socialImageSvg({
      ...input,
      digestDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
    }).svg,
  );
  assert.ok(variants.some((svg) => / Q\d+/.test(svg)));
  assert.ok(variants.some((svg) => !/ Q\d+/.test(svg)));
});

test("archive pages expose a native LinkedIn publication with image, text and permalink", async () => {
  const [layout, composer] = await Promise.all([
    readFile(
      new URL("../../layouts/archives/single.html", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../layouts/partials/linkedin-composer.html", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(layout, /data-linkedin-share/);
  assert.match(layout, /data-share-image/);
  assert.match(layout, /data-share-title="Web Digest — \{\{ \$\.Title \}\}"/);
  assert.match(layout, /type="button"\s+hidden\s+data-linkedin-share/);
  assert.doesNotMatch(layout, /data-share-text=/);
  assert.match(layout, /data-share-tags="\{\{ \$tags \| jsonify \}\}"/);
  assert.match(layout, /data-share-url="\{\{ \$\.Permalink \}\}"/);
  assert.match(layout, /Publier sur LinkedIn/);
  assert.doesNotMatch(layout, /linkedin\.com\/feed\/\?shareActive=true/);
  assert.match(layout, /data-linkedin-feedback/);
  assert.match(layout, /partial "linkedin-composer\.html"/);
  assert.match(layout, /-linkedin\.png/);
  assert.match(layout, /\$linkedinFormat = "square"/);
  assert.match(layout, /"format" \$linkedinFormat/);
  assert.match(composer, /data-linkedin-composer/);
  assert.match(composer, /data-linkedin-text/);
  assert.match(composer, /data-linkedin-tags-note/);
  assert.match(composer, /data-linkedin-hashtags/);
  assert.match(layout, /data-linkedin-link-share/);
  assert.match(layout, /data-link-id="\{\{ \.id \}\}"/);
  assert.doesNotMatch(
    layout,
    /data-linkedin-link-share[\s\S]{0,240}data-share-image/,
  );
  assert.match(layout, /class="archive-item-actions"/);
  assert.match(layout, /\.previous_urls/);
  assert.match(layout, /Anciennes adresses/);
  assert.match(composer, /Confirmer la publication/);
  assert.match(layout, /archive-social-visual/);
  assert.match(layout, /\.Params\.images/);
  assert.match(composer, /width="1200"/);
  assert.match(composer, /1200\{\{ else \}\}627/);
  assert.match(layout, /data-archive-delete-link/);
  assert.match(layout, /class="archive-delete-link"/);
  assert.match(layout, /Retirer/);
});

test("the root link modal exposes LinkedIn before tag editing for admins", async () => {
  const [layout, script] = await Promise.all([
    readFile(new URL("../../layouts/index.html", import.meta.url), "utf8"),
    readFile(new URL("../../assets/js/digest.js", import.meta.url), "utf8"),
  ]);
  const linkedInPosition = layout.indexOf("id=\"digest-modal-linkedin\"");
  const tagsPosition = layout.indexOf("id=\"digest-modal-tag-editor\"");
  assert.ok(linkedInPosition > 0 && linkedInPosition < tagsPosition);
  assert.match(layout, /data-linkedin-link-share/);
  assert.match(layout, /partial "linkedin-composer\.html"/);
  assert.match(script, /modalLinkedIn\.dataset\.linkId = link\.id/);
  assert.match(script, /delete modalLinkedIn\.dataset\.shareImage/);
  assert.match(script, /digest:linkedin-published/);
});

test("the root link modal keeps provenance below its primary actions", async () => {
  const [layout, script] = await Promise.all([
    readFile(new URL("../../layouts/index.html", import.meta.url), "utf8"),
    readFile(new URL("../../assets/js/digest.js", import.meta.url), "utf8"),
  ]);
  const urlPosition = layout.indexOf('id="digest-modal-url"');
  const favoritePosition = layout.indexOf('id="digest-modal-favorite"');
  const visitPosition = layout.indexOf('id="digest-modal-link"');
  const originPosition = layout.indexOf('id="digest-modal-origin"');
  assert.ok(
    urlPosition > 0 &&
      urlPosition < favoritePosition &&
      favoritePosition < visitPosition &&
      visitPosition < originPosition,
  );
  assert.match(layout, /id="digest-modal-origin-row" hidden/);
  assert.match(script, /modalOriginRow\.hidden = !link\.origin_url/);
});

test("the root modal links only registered tag destinations", async () => {
  const [layout, script] = await Promise.all([
    readFile(new URL("../../layouts/index.html", import.meta.url), "utf8"),
    readFile(new URL("../../assets/js/digest.js", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /id="digest-tag-routes" type="application\/json"/);
  assert.match(layout, /where site\.RegularPages "Section" "tags"/);
  assert.match(script, /document\.createElement\(route \? "a" : "span"\)/);
  assert.match(script, /if \(route\) chip\.href = route/);
  assert.doesNotMatch(script, /slugifyTag|dataset\.base/);
});

test("link icons never disclose catalog URLs to a third party", async () => {
  const [partial, layout, script] = await Promise.all([
    readFile(
      new URL("../../layouts/partials/link-favicon.html", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../../layouts/index.html", import.meta.url), "utf8"),
    readFile(new URL("../../assets/js/digest.js", import.meta.url), "utf8"),
  ]);
  const implementation = `${partial}\n${layout}\n${script}`;
  assert.doesNotMatch(implementation, /domain_url/i);
  assert.doesNotMatch(implementation, /encodeURIComponent\(link\.url\)/);
  assert.match(partial, /\$faviconHost := \(urls\.Parse \$url\)\.Hostname/);
  assert.match(
    partial,
    /favicons\?domain=%s&sz=32" \(\$faviconHost \| urlquery\)/,
  );
  assert.match(script, /return new URL\(url\)\.hostname;/);
  assert.match(
    script,
    /favicons\?domain=\$\{encodeURIComponent\(faviconHost\)\}&sz=32/,
  );
  assert.match(layout, /data-fallback-src=/);
});

test("the home loads its compact search index only when interaction needs it", async () => {
  const [layout, script] = await Promise.all([
    readFile(new URL("../../layouts/index.html", import.meta.url), "utf8"),
    readFile(new URL("../../assets/js/digest.js", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /resources\.FromString "data\/digest-index\.json"/);
  assert.match(layout, /\$allLinks := sort \$publicLinks "added" "desc"/);
  assert.match(layout, /"m" \(\.stream \| default ""\)/);
  assert.match(layout, /dict "p" \.image "l" \(\.image_alt/);
  assert.match(layout, /"q" \./);
  assert.match(layout, /dict "x" \./);
  assert.match(layout, /where \$allLinks "category" \$category/);
  assert.match(layout, /data-index-url="\{\{ \$digestIndex\.RelPermalink \}\}"/);
  assert.doesNotMatch(layout, /id="digest-data"/);
  assert.match(layout, /class="digest-favorite"/);
  assert.match(layout, /Folio 01\/\{\{ printf "%02d" \$pageCount \}\}/);
  assert.match(script, /const loadLinks = \(\) =>/);
  assert.match(script, /stream: entry\.m \|\| ""/);
  assert.match(script, /image: entry\.p \|\| ""/);
  assert.match(script, /origin_url: entry\.q \|\| ""/);
  assert.match(script, /archive_text: entry\.x \|\| ""/);
  assert.match(script, /modalArchiveText\.textContent = link\.archive_text \|\| ""/);
  assert.match(script, /category === "all" && \(!link\.stream \|\| \(link\.stream === "blog-ooblik" && link\.origin_url\)\)/);
  assert.match(script, /gridTop - headerHeight - stickyToolsHeight/);
  assert.match(script, /getComputedStyle\(tools\)\.position === "sticky"/);
  assert.match(script, /requestAnimationFrame\(\(\) => \{\s*window\.requestAnimationFrame/);
  assert.match(script, /fetch\(indexUrl,/);
  assert.match(script, /const withLinks = async \(task, onError = null\) =>/);
  assert.match(script, /search\.addEventListener\("input",[\s\S]*?withLinks/);
  assert.match(script, /searchRevision \+= 1/);
  assert.match(script, /if \(searchRevision > renderedSearchRevision\) \{/);
  assert.match(script, /renderedSearchRevision = searchRevision/);
  assert.match(script, /let renderedPage = 1/);
  assert.match(script, /else if \(currentPage !== renderedPage\)/);
  assert.match(script, /renderedPage = currentPage/);
  assert.match(
    script,
    /pagePrev\.addEventListener[\s\S]*?const displayedPage = renderedPage[\s\S]*?const requestedSearchRevision = searchRevision[\s\S]*?if \(requestedSearchRevision !== searchRevision\) return;[\s\S]*?currentPage = displayedPage - 1/,
  );
  assert.match(
    script,
    /pageNext\.addEventListener[\s\S]*?const displayedPage = renderedPage[\s\S]*?const requestedSearchRevision = searchRevision[\s\S]*?if \(requestedSearchRevision !== searchRevision\) return;[\s\S]*?currentPage = displayedPage \+ 1/,
  );
  assert.match(
    script,
    /randomButton\.addEventListener[\s\S]*?const requestedSearchRevision = searchRevision[\s\S]*?if \(requestedSearchRevision !== searchRevision\) return;/,
  );
  assert.match(
    script,
    /if \(requestedCategory === "favorites"\)[\s\S]*?search\.value = ""[\s\S]*?void withLinks/,
  );
  assert.match(script, /calendarRequestedOpen = !calendarRequestedOpen/);
  assert.match(script, /if \(!calendarRequestedOpen\) return/);
  assert.match(
    script,
    /if \(calendarRequestedOpen && !event\.target\.closest\("\.digest-date"\)\)/,
  );
  assert.match(script, /empty\.textContent = emptyMessage/);
  assert.match(script, /empty\.textContent = emptyMessage;\s*empty\.hidden = true/);
  assert.match(script, /if \(currentPage > 1\) void withLinks\(\(\) => undefined\)/);
  assert.doesNotMatch(
    script,
    /randomButton\.setAttribute\("aria-pressed", "false"\);\s*render\(/,
  );
});

test("the tag explorer uses one fingerprinted Hugo asset", async () => {
  const [layout, script] = await Promise.all([
    readFile(new URL("../../layouts/tags/list.html", import.meta.url), "utf8"),
    readFile(new URL("../../assets/js/tag-explorer.js", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /resources\.Get "js\/tag-explorer\.js" \| minify \| fingerprint/);
  assert.match(layout, /integrity="\{\{ \$tagExplorer\.Data\.Integrity \}\}"/);
  assert.doesNotMatch(layout, /tag-explorer-\d+\.js|\?build=/);
  assert.match(script, /document\.querySelector\("\[data-tag-explorer\]"\)/);
});

test("Hugo language metadata uses the current APIs", async () => {
  const [base, rss, openGraph] = await Promise.all([
    readFile(new URL("../../layouts/baseof.html", import.meta.url), "utf8"),
    readFile(new URL("../../layouts/rss.xml", import.meta.url), "utf8"),
    readFile(new URL("../../layouts/partials/templates/opengraph.html", import.meta.url), "utf8"),
  ]);
  assert.match(base, /\.Language\.Direction/);
  assert.match(rss, /site\.Language\.Locale/);
  assert.match(openGraph, /site\.Language\.Locale/);
  assert.doesNotMatch(`${base}\n${rss}\n${openGraph}`, /LanguageDirection|LanguageCode/);
});

test("local, CI and deployment verification share one cross-platform command", async () => {
  const [verification, ci, deployment, readme] = await Promise.all([
    readFile(new URL("../../scripts/verify.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"),
    readFile(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8"),
    readFile(new URL("../../README.md", import.meta.url), "utf8"),
  ]);
  for (const consumer of [ci, deployment, readme]) {
    assert.match(consumer, /node scripts\/verify\.mjs/);
  }
  assert.match(verification, /process\.platform === "win32" \? "npm\.cmd" : "npm"/);
  assert.match(verification, /"python3", "python"/);
  assert.match(verification, /Development URL found in production output/);
  assert.match(verification, /contents\.toString\("latin1"\)/);
  assert.doesNotMatch(verification, /contents\.includes\(0\)/);
  assert.doesNotMatch(`${ci}\n${deployment}`, /npm test|check_digest_consistency|grep -R/);
});

test("social image counts follow public link visibility", async () => {
  const [backfill, curation] = await Promise.all([
    readFile(
      new URL("../scripts/social-backfill.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/curation.ts", import.meta.url), "utf8"),
  ]);
  assert.match(backfill, /link\.visibility === "hidden"/);
  assert.match(backfill, /argument\("--date"\)/);
  assert.match(backfill, /generateOptimizedLinkedInImage/);
  assert.match(backfill, /`\$\{digestDate\}-linkedin\.png`/);
  assert.match(curation, /async updateLinkVisibility/);
  assert.match(curation, /link\.visibility !== "hidden"/);
  assert.match(curation, /\[`static\/social\/\$\{date\}\.png`\]: socialImage/);
  assert.match(
    curation,
    /\[`static\/social\/\$\{date\}-linkedin\.png`\]: linkedInImage/,
  );
});

test("LinkedIn native publishing uses the authenticated server API", async () => {
  const [script, headPartial, composer, stylesheet] = await Promise.all([
    readFile(new URL("../../assets/js/linkedin-image.js", import.meta.url), "utf8"),
    readFile(new URL("../../layouts/_partials/extend_head.html", import.meta.url), "utf8"),
    readFile(
      new URL("../../layouts/partials/linkedin-composer.html", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../assets/css/extended/digest.css", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(script, /api\("\/api\/admin\/linkedin\/status"\)/);
  assert.match(script, /revealForAuthenticatedAdmin/);
  assert.match(script, /shareButtons\.forEach/);
  assert.match(script, /\/api\/admin\/linkedin\/connect\?returnTo=/);
  assert.match(script, /"\/api\/admin\/linkedin\/publish-link"/);
  assert.match(script, /"\/api\/admin\/linkedin\/link-preview"/);
  assert.match(script, /Régénérer l.image|generateLinkPreview/);
  assert.match(
    script,
    /composer\.addEventListener\("close",[\s\S]*?confirmButton\.disabled = false/,
  );
  assert.match(script, /"\/api\/admin\/linkedin\/publish"/);
  assert.match(script, /LINKEDIN_PUBLICATION_OUTCOME_UNKNOWN/);
  assert.match(script, /Vérifiez votre profil LinkedIn avant toute action/);
  assert.match(script, /Republier sur LinkedIn/);
  assert.match(script, /Confirmer la republication/);
  assert.match(script, /republish: republishRequested/);
  assert.match(script, /Modifiez si besoin le texte et les hashtags/);
  assert.match(
    script,
    /if \(publication\.alreadyPublished\) \{\s*return;/,
  );
  assert.match(script, /confirm: true/);
  assert.match(script, /composer\.showModal\(\)/);
  assert.match(script, /shareButton\.closest\("dialog\[open\]"\)/);
  assert.match(script, /parentDialog\.close\(\)/);
  assert.match(script, /suspendedDialog\.showModal\(\)/);
  assert.match(script, /textField\.value\.trim\(\)/);
  assert.match(script, /textField\.value = ""/);
  assert.match(script, /maxCommentaryLength = 3000/);
  assert.match(script, /updateCharacterCount/);
  assert.match(script, /setCustomValidity/);
  assert.match(script, /hashtagsField\.value = hashtags\.join/);
  assert.match(script, /automaticHashtags/);
  assert.match(script, /\.slice\(0, 5\)/);
  assert.match(script, /preview\.naturalWidth === preview\.naturalHeight/);
  assert.match(script, /preview\.classList\.toggle\("is-square", isSquare\)/);
  assert.match(script, /Retirer « \$\{title\} » du Digest/);
  assert.doesNotMatch(script, /navigator\.share/);
  assert.match(headPartial, /resources\.Get "js\/linkedin-image\.js"/);
  assert.match(headPartial, /\$linkedinImage\.RelPermalink/);
  assert.match(composer, /data-linkedin-character-count/);
  assert.doesNotMatch(composer, /maxlength="1250"|maxlength="200"/);
  assert.match(stylesheet, /font-variant-ligatures: none/);
  assert.match(stylesheet, /font-feature-settings: "liga" 0, "calt" 0/);
});

test("archive Open Graph images declare their large preview dimensions", async () => {
  const template = await readFile(
    new URL("../../layouts/partials/templates/opengraph.html", import.meta.url),
    "utf8",
  );
  assert.match(template, /property="og:image:secure_url"/);
  assert.match(template, /property="og:image:type" content="image\/png"/);
  assert.match(template, /property="og:image:width" content="1200"/);
  assert.match(template, /property="og:image:height" content="627"/);
  assert.match(template, /property="og:image:alt"/);
});

test("the archive index uses social images as lazily loaded edition posters", async () => {
  const [layout, loader, stylesheet] = await Promise.all([
    readFile(
      new URL("../../layouts/archives/list.html", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../assets/js/archive-posters.js", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../assets/css/extended/digest.css", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(layout, /archive-edition-poster/);
  assert.match(layout, /\.Paginate \.Pages\.ByDate\.Reverse 24/);
  assert.match(layout, /archive-pagination/);
  assert.match(layout, /Folio {{ printf "%02d" \$paginator\.PageNumber }}\/{{ printf "%02d" \$paginator\.TotalPages }}/);
  assert.match(layout, /\$paginator\.TotalNumberOfElements }} éditions/);
  assert.match(layout, /data-src="{{ \. \| relURL }}"/);
  assert.match(layout, /archive-posters\.js/);
  assert.match(loader, /IntersectionObserver/);
  assert.match(loader, /rootMargin: "600px 0px"/);
  assert.match(
    stylesheet,
    /\.archive-editions\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s,
  );
  assert.match(
    stylesheet,
    /\.archive-edition-poster::before\s*\{[^}]*background:\s*var\(--digest-accent\);[^}]*mix-blend-mode:\s*color/s,
  );
  assert.match(
    stylesheet,
    /\.archive-edition a:hover \.archive-edition-poster::before,\s*\.archive-edition a:focus-visible \.archive-edition-poster::before\s*\{[^}]*opacity:\s*0/s,
  );
});

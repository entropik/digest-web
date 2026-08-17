import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
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
  assert.match(composer, /height="627"/);
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
  assert.match(layout, /data-index-url="\{\{ \$digestIndex\.RelPermalink \}\}"/);
  assert.doesNotMatch(layout, /id="digest-data"/);
  assert.match(layout, /class="digest-favorite"/);
  assert.match(layout, /Page 1 sur \{\{ \$pageCount \}\}/);
  assert.match(script, /const loadLinks = \(\) =>/);
  assert.match(script, /fetch\(indexUrl,/);
  assert.match(script, /const withLinks = async \(task, onError = null\) =>/);
  assert.match(script, /search\.addEventListener\("input",[\s\S]*?withLinks/);
  assert.match(script, /const revision = \+\+searchRevision/);
  assert.match(script, /if \(revision !== searchRevision\) return/);
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
  assert.match(script, /if \(currentPage > 1\) void withLinks/);
  assert.doesNotMatch(
    script,
    /randomButton\.setAttribute\("aria-pressed", "false"\);\s*render\(/,
  );
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
  assert.match(curation, /async updateLinkVisibility/);
  assert.match(curation, /link\.visibility !== "hidden"/);
  assert.match(curation, /\[`static\/social\/\$\{date\}\.png`\]: socialImage/);
});

test("LinkedIn native publishing uses the authenticated server API", async () => {
  const [script, headPartial, composer] = await Promise.all([
    readFile(new URL("../../assets/js/linkedin-image.js", import.meta.url), "utf8"),
    readFile(new URL("../../layouts/_partials/extend_head.html", import.meta.url), "utf8"),
    readFile(
      new URL("../../layouts/partials/linkedin-composer.html", import.meta.url),
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
  assert.match(script, /confirm: true/);
  assert.match(script, /composer\.showModal\(\)/);
  assert.match(script, /textField\.value\.trim\(\)/);
  assert.match(script, /textField\.value = ""/);
  assert.match(script, /maxCommentaryLength = 3000/);
  assert.match(script, /updateCharacterCount/);
  assert.match(script, /setCustomValidity/);
  assert.match(script, /hashtagsField\.value = hashtags\.join/);
  assert.match(script, /automaticHashtags/);
  assert.match(script, /\.slice\(0, 5\)/);
  assert.match(script, /Retirer « \$\{title\} » du Digest/);
  assert.doesNotMatch(script, /navigator\.share/);
  assert.match(headPartial, /resources\.Get "js\/linkedin-image\.js"/);
  assert.match(headPartial, /\$linkedinImage\.RelPermalink/);
  assert.match(composer, /data-linkedin-character-count/);
  assert.doesNotMatch(composer, /maxlength="1250"|maxlength="200"/);
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
  const layout = await readFile(
    new URL("../../layouts/archives/list.html", import.meta.url),
    "utf8",
  );
  const loader = await readFile(
    new URL("../../assets/js/archive-posters.js", import.meta.url),
    "utf8",
  );

  assert.match(layout, /archive-edition-poster/);
  assert.match(layout, /\.Paginate \.Pages\.ByDate\.Reverse 24/);
  assert.match(layout, /archive-pagination/);
  assert.match(layout, /Page {{ \$paginator\.PageNumber }} \/ {{ \$paginator\.TotalPages }}/);
  assert.match(layout, /data-src="{{ \. \| relURL }}"/);
  assert.match(layout, /archive-posters\.js/);
  assert.match(loader, /IntersectionObserver/);
  assert.match(loader, /rootMargin: "600px 0px"/);
});

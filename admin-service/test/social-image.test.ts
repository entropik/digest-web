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
  const layout = await readFile(
    new URL("../../layouts/archives/single.html", import.meta.url),
    "utf8",
  );
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
  assert.match(layout, /data-linkedin-composer/);
  assert.match(layout, /data-linkedin-text/);
  assert.match(layout, /data-linkedin-tags-note/);
  assert.match(layout, /data-linkedin-hashtags/);
  assert.match(layout, /data-linkedin-link-share/);
  assert.match(layout, /data-link-id="\{\{ \.id \}\}"/);
  assert.match(layout, /class="archive-item-actions"/);
  assert.match(layout, /Confirmer la publication/);
  assert.match(layout, /archive-social-visual/);
  assert.match(layout, /\.Params\.images/);
  assert.match(layout, /width="1200"/);
  assert.match(layout, /height="627"/);
});

test("LinkedIn native publishing uses the authenticated server API", async () => {
  const [script, headPartial] = await Promise.all([
    readFile(new URL("../../assets/js/linkedin-image.js", import.meta.url), "utf8"),
    readFile(new URL("../../layouts/_partials/extend_head.html", import.meta.url), "utf8"),
  ]);
  assert.match(script, /api\("\/api\/admin\/linkedin\/status"\)/);
  assert.match(script, /revealForAuthenticatedAdmin/);
  assert.match(script, /shareButtons\.forEach/);
  assert.match(script, /\/api\/admin\/linkedin\/connect\?returnTo=/);
  assert.match(script, /"\/api\/admin\/linkedin\/publish-link"/);
  assert.match(script, /"\/api\/admin\/linkedin\/publish"/);
  assert.match(script, /confirm: true/);
  assert.match(script, /composer\.showModal\(\)/);
  assert.match(script, /textField\.value\.trim\(\)/);
  assert.match(script, /textField\.value = ""/);
  assert.match(script, /hashtagsField\.value = hashtags\.join/);
  assert.match(script, /automaticHashtags/);
  assert.match(script, /\.slice\(0, 5\)/);
  assert.doesNotMatch(script, /window\.confirm/);
  assert.doesNotMatch(script, /navigator\.share/);
  assert.match(headPartial, /resources\.Get "js\/linkedin-image\.js"/);
  assert.match(headPartial, /\$linkedinImage\.RelPermalink/);
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

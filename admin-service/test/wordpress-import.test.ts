import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";

import type { DigestLink } from "../src/catalog.js";
import {
  archiveAllRemainingWordpressPosts,
  archiveUnresolvedWordpressPosts,
  buildWordpressRecoveryReport,
  buildWordpressValidationReport,
  renderWordpressRecoveryHtml,
  renderWordpressValidationHtml,
} from "../src/wordpress-recovery.js";
import {
  BLOG_ARCHIVE_CATEGORY,
  BLOG_ARCHIVE_STREAM,
  buildWordpressImportPreview,
  optimizeWordpressImage,
  parseWordpressExport,
  wordpressDigestCategory,
  wordpressFallbackSourceLinks,
  wordpressMediaRelativePath,
  wordpressImagePath,
} from "../src/wordpress-import.js";

const fixturePath = fileURLToPath(
  new URL("fixtures/wordpress-export.xml", import.meta.url),
);
const fixture = () => readFile(fixturePath, "utf8");
const duplicate: DigestLink = {
  id: "ebd768df-0bfa-5e55-9af8-776fbb2fdd31",
  title: "Déjà là",
  url: "https://duplicate.example/",
  category: "Médias & Veille",
  added: "2020-01-01",
  tags: ["photographie", "livre", "blog-ooblik", "lien-mort"],
};

test("WXR parsing keeps published posts, sources, taxonomy and image priority", async () => {
  const posts = parseWordpressExport(await fixture());
  assert.equal(posts.length, 7);
  const normal = posts.find((post) => post.wordpressId === "101");
  assert.deepEqual(normal?.sourceUrls, ["https://normal.example/project"]);
  assert.match(normal?.archiveText ?? "", /Source : Projet normal/);
  assert.equal(normal?.imageUrl.endsWith("featured.jpg"), true);
  assert.equal(normal?.imageAlt, "Alt WordPress");
  assert.equal(normal?.description, "Une description propre.");
  assert.deepEqual(normal?.tags, ["Photographes", "Livre", "blog-ooblik"]);
  const fallback = posts.find((post) => post.wordpressId === "102");
  assert.equal(fallback?.imageUrl.endsWith("fallback.png"), true);
  assert.equal(fallback?.imageAlt, "Secours");
});

test("preview separates safe imports, duplicates and editorial review", async () => {
  const preview = buildWordpressImportPreview({
    xml: await fixture(),
    currentLinks: [duplicate],
    probes: [{ url: "https://dead.example/", status: 410, definitive_dead: true }],
  });
  assert.deepEqual(preview.ready.map((item) => item.wordpress_id), ["101", "102", "107"]);
  assert.equal(preview.duplicates[0]?.wordpress_id, "106");
  assert.deepEqual(
    preview.review.map((item) => item.reason).sort(),
    ["ambiguous_source", "missing_source", "unsafe_source:PRIVATE_URL"],
  );
  const normal = preview.ready[0]?.link;
  assert.equal(normal?.category, "Photographie");
  assert.deepEqual(normal?.tags, ["photographie", "livre", "blog-ooblik"]);
  assert.equal(normal?.stream, BLOG_ARCHIVE_STREAM);
  assert.equal(normal?.origin_url, "https://blog.ooblik.com/2025/normal/");
  const dead = preview.ready.find((item) => item.wordpress_id === "107")?.link;
  assert.equal(dead?.status, "dead");
  assert.equal(dead?.tags?.includes("lien-mort"), true);
});

test("WordPress photography categories map to the Digest taxonomy", () => {
  assert.equal(wordpressDigestCategory(["Photographes", "Livre"]), "Photographie");
  assert.equal(wordpressDigestCategory(["Livre / Book", "Geek"]), "Design & Création");
  assert.equal(wordpressDigestCategory(["Livre / Book", "Camera Porn"]), "Photographie");
  assert.equal(wordpressDigestCategory(["Geek"]), BLOG_ARCHIVE_CATEGORY);
});

test("overrides resolve one exception, skip another and remain idempotent", async () => {
  const xml = await fixture();
  const overrides = {
    "103": { source_url: "https://resolved.example/" },
    "104": { skip: true },
  };
  const first = buildWordpressImportPreview({
    xml,
    currentLinks: [duplicate],
    overrides,
  });
  assert.equal(first.ready.some((item) => item.wordpress_id === "103"), true);
  assert.equal(first.skipped[0]?.wordpress_id, "104");
  const second = buildWordpressImportPreview({
    xml,
    currentLinks: first.catalog,
    overrides,
  });
  assert.equal(second.ready.length, first.ready.length);
  assert.equal(second.ready.every((item) => item.existing), true);
  assert.deepEqual(second.catalog, first.catalog);
  assert.equal(second.duplicates.length, 1);
});

test("image conversion is deterministic, 16:9 and strips metadata", async () => {
  const source = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#d4422f" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  assert.notEqual((await sharp(source).metadata()).exif, undefined);
  const first = await optimizeWordpressImage(source);
  const second = await optimizeWordpressImage(source);
  assert.deepEqual(first, second);
  const metadata = await sharp(first).metadata();
  assert.equal(metadata.format, "webp");
  assert.ok((metadata.width ?? 0) <= 960);
  assert.ok((metadata.height ?? 0) <= 540);
  assert.ok(Math.abs((metadata.width ?? 0) / (metadata.height ?? 1) - 16 / 9) < 0.01);
  assert.equal(metadata.exif, undefined);
});

test("image paths derive from provenance and WordPress id", () => {
  const link: DigestLink = {
    ...duplicate,
    added: "2025-02-27",
    origin_url: "https://blog.ooblik.com/2025/Un été à Zürich/",
  };
  assert.equal(
    wordpressImagePath(link, "42"),
    "/media/blog-ooblik/2025/un-ete-a-zurich-42.webp",
  );
});

test("FTP media paths stay inside wp-content uploads", () => {
  assert.deepEqual(
    wordpressMediaRelativePath(
      "https://blog.ooblik.com/wp-content/uploads/2025/02/un%20fichier.jpg",
      "blog.ooblik.com",
    ),
    ["2025", "02", "un fichier.jpg"],
  );
  assert.throws(
    () =>
      wordpressMediaRelativePath(
        "https://blog.ooblik.com/wp-content/uploads/%2e%2e/secret.txt",
        "blog.ooblik.com",
      ),
    /(UNSAFE_IMAGE_PATH|IMAGE_OUTSIDE_UPLOADS)/,
  );
});

test("fallback recovery finds ordinary links and cleans legacy embeds", () => {
  assert.deepEqual(
    wordpressFallbackSourceLinks(
      '<p><a href="https://example.com/page?utm_source=blog">Voir</a></p><p>https://vimeo.com/42[/embed]</p>',
      "blog.ooblik.com",
    ),
    ["https://example.com/page", "https://vimeo.com/42"],
  );
  assert.deepEqual(
    wordpressFallbackSourceLinks(
      '<a href="http://127.0.0.1/admin">Privé</a><a href="https://blog.ooblik.com/interne/">Interne</a>',
      "blog.ooblik.com",
    ),
    [],
  );
});

test("recovery report separates unique suggestions from unresolved review", async () => {
  const xml = (await fixture()).replace(
    "<p>Texte seul.</p>",
    '<p><a href="https://candidate.example/projet">Projet probable</a></p>',
  );
  const report = buildWordpressRecoveryReport({
    xml,
    currentLinks: [duplicate],
  });
  assert.equal(report.missing_source, 1);
  assert.equal(report.unique[0]?.wordpress_id, "103");
  assert.deepEqual(report.unique[0]?.candidates, ["https://candidate.example/projet"]);
  assert.equal(report.unresolved.length, 0);
  const html = renderWordpressRecoveryHtml({
    ...report,
    unique: [],
    unresolved: report.unique,
  });
  assert.match(html, /Billets sans source/);
  assert.match(html, /Exporter overrides\.json/);
  assert.match(html, /candidate\.example/);
  assert.doesNotMatch(html, /<script[^>]*>[^<]*<\/script><script>/);
});

test("unresolved posts can be archived under their WordPress permalink", async () => {
  const xml = (await fixture()).replace(
    "<wp:post_id>103</wp:post_id>",
    '<category domain="post_tag"><![CDATA[Ancien tag libre]]></category><wp:post_id>103</wp:post_id>',
  );
  const report = buildWordpressRecoveryReport({ xml, currentLinks: [] });
  const overrides = archiveUnresolvedWordpressPosts(report);
  assert.deepEqual(overrides, {
    "103": { source_url: "https://blog.ooblik.com/2023/sans-source/" },
  });
  const preview = buildWordpressImportPreview({
    xml,
    currentLinks: [],
    overrides,
  });
  assert.deepEqual(
    preview.ready.find((item) => item.wordpress_id === "103")?.link.archive_tags,
    ["Ancien tag libre"],
  );
  assert.equal(
    preview.review.some((item) => item.wordpress_id === "103"),
    false,
  );
  assert.equal(
    parseWordpressExport(xml).find((post) => post.wordpressId === "103")
      ?.description,
    "Texte seul.",
  );
});

test("validation review combines detected candidates and existing overrides", async () => {
  const xml = (await fixture()).replace(
    "<p>Texte seul.</p>",
    '<p><a href="https://candidate.example/projet">Projet probable</a></p>',
  );
  const report = buildWordpressValidationReport({
    xml,
    currentLinks: [duplicate],
    overrides: { "999": { skip: true } },
  });
  const candidate = report.items.find((item) => item.wordpress_id === "103");
  assert.deepEqual(candidate?.candidates, ["https://candidate.example/projet"]);
  assert.deepEqual(report.base_overrides, { "999": { skip: true } });
  const html = renderWordpressValidationHtml(report);
  assert.match(html, /Destinations à valider/);
  assert.match(html, /Archiver tel quel/);
  assert.match(html, /candidate\.example/);
  assert.match(html, /merged=\{\.\.\.base,\.\.\.decisions\}/);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.doesNotThrow(() => new Function(scripts.at(-1)?.[1] ?? ""));
});

test("all remaining real posts can be archived while the WordPress sample is skipped", async () => {
  const xml = (await fixture()).replace(
    "<wp:post_id>103</wp:post_id>",
    '<category domain="post_tag"><![CDATA[Ancien tag libre]]></category><wp:post_id>103</wp:post_id>',
  );
  const withDefault = xml.replace(
    "</channel>",
    '<item><title>Bonjour tout le monde !</title><link>https://blog.ooblik.com/bonjour/</link><content:encoded><![CDATA[Bienvenue.]]></content:encoded><excerpt:encoded><![CDATA[]]></excerpt:encoded><wp:post_id>1</wp:post_id><wp:post_name>bonjour</wp:post_name><wp:post_date>2023-01-01 10:00:00</wp:post_date><wp:post_type>post</wp:post_type><wp:status>publish</wp:status></item></channel>',
  );
  const overrides = archiveAllRemainingWordpressPosts({
    xml: withDefault,
    currentLinks: [duplicate],
  });
  assert.deepEqual(overrides["1"], { skip: true });
  assert.deepEqual(overrides["103"], {
    source_url: "https://blog.ooblik.com/2023/sans-source/",
  });
  assert.deepEqual(overrides["106"], {
    source_url: "https://blog.ooblik.com/2023/doublon/",
  });
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";

import { parseCatalog, serializeCatalog, type DigestLink } from "../src/catalog.js";
import {
  archiveAllRemainingWordpressPosts,
  archiveUnresolvedWordpressPosts,
  buildWordpressRecoveryReport,
  buildWordpressValidationReport,
  renderWordpressRecoveryHtml,
  renderWordpressValidationHtml,
  restoreDetectedWordpressSources,
} from "../src/wordpress-recovery.js";
import {
  BLOG_ARCHIVE_CATEGORY,
  BLOG_ARCHIVE_STREAM,
  buildWordpressImportPreview,
  loadWordpressImageSource,
  normalizeWordpressMediaUrl,
  optimizeWordpressImage,
  parseWordpressExport,
  renderWordpressImageReviewHtml,
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
  assert.equal(normal?.imageSource, "featured");
  assert.equal(normal?.description, "Une description propre.");
  assert.deepEqual(normal?.tags, ["Photographes", "Livre", "blog-ooblik"]);
  const fallback = posts.find((post) => post.wordpressId === "102");
  assert.equal(fallback?.imageUrl.endsWith("fallback.png"), true);
  assert.equal(fallback?.imageAlt, "Secours");
  assert.equal(fallback?.imageSource, "content");
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

test("a recovered destination replaces its self-archived card", async () => {
  const xml = await fixture();
  const selfArchived: DigestLink = {
    id: "old-self-id",
    title: "Sans source",
    url: "https://blog.ooblik.com/2023/sans-source",
    origin_url: "https://blog.ooblik.com/2023/sans-source/",
    category: BLOG_ARCHIVE_CATEGORY,
    added: "2023-01-01",
    stream: BLOG_ARCHIVE_STREAM,
  };
  const overrides = { "103": { source_url: "https://resolved.example/project" } };
  const first = buildWordpressImportPreview({
    xml,
    currentLinks: [selfArchived],
    overrides,
    probes: [{
      url: "https://resolved.example/project/",
      status: 410,
      definitive_dead: true,
    }],
  });
  const recovered = first.ready.find((item) => item.wordpress_id === "103");
  assert.equal(recovered?.existing, true);
  assert.equal(recovered?.previous_id, "old-self-id");
  assert.equal(recovered?.link.url, "https://resolved.example/project");
  assert.equal(recovered?.link.status, "dead");
  assert.equal(recovered?.link.tags?.includes("lien-mort"), true);
  assert.equal(
    first.catalog.some((link) => link.url === selfArchived.url),
    false,
  );
  const second = buildWordpressImportPreview({
    xml,
    currentLinks: first.catalog,
    overrides,
    probes: [{
      url: "https://resolved.example/project/",
      status: 410,
      definitive_dead: true,
    }],
  });
  assert.deepEqual(second.catalog, first.catalog);
});

test("two archived posts cannot be recovered onto the same destination", async () => {
  const xml = await fixture();
  const archived = ["103", "104"].map((wordpressId) => ({
    id: `old-self-${wordpressId}`,
    title: `Archive ${wordpressId}`,
    url:
      wordpressId === "103"
        ? "https://blog.ooblik.com/2023/sans-source"
        : "https://blog.ooblik.com/2023/deux",
    origin_url:
      wordpressId === "103"
        ? "https://blog.ooblik.com/2023/sans-source/"
        : "https://blog.ooblik.com/2023/deux/",
    category: BLOG_ARCHIVE_CATEGORY,
    added: "2023-01-01",
    stream: BLOG_ARCHIVE_STREAM,
  } satisfies DigestLink));
  const sharedDestination = "https://resolved.example/project";
  const preview = buildWordpressImportPreview({
    xml,
    currentLinks: archived,
    overrides: {
      "103": { source_url: sharedDestination },
      "104": { source_url: sharedDestination },
    },
  });

  assert.equal(
    preview.ready.filter((item) => ["103", "104"].includes(item.wordpress_id))
      .length,
    1,
  );
  assert.equal(
    preview.duplicates.filter((item) => ["103", "104"].includes(item.wordpress_id))
      .length,
    1,
  );
  assert.equal(
    preview.catalog.filter((link) => link.url === sharedDestination).length,
    1,
  );
  assert.equal(new Set(preview.catalog.map((link) => link.id)).size, 2);
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

test("historical WordPress media URLs normalize without widening host trust", () => {
  const origin = "https://blog.ooblik.com/2025/article/";
  assert.equal(
    normalizeWordpressMediaUrl(
      "http://blog.ooblik.com/wp-content/uploads/2025/02/image.jpg",
      origin,
    ).toString(),
    "http://blog.ooblik.com/wp-content/uploads/2025/02/image.jpg",
  );
  assert.equal(
    normalizeWordpressMediaUrl(
      "//blog.ooblik.com/wp-content/uploads/2025/02/image.jpg",
      origin,
    ).toString(),
    "https://blog.ooblik.com/wp-content/uploads/2025/02/image.jpg",
  );
  assert.equal(
    normalizeWordpressMediaUrl("/wp-content/uploads/2025/02/image.jpg", origin)
      .toString(),
    "https://blog.ooblik.com/wp-content/uploads/2025/02/image.jpg",
  );
  assert.throws(
    () =>
      normalizeWordpressMediaUrl(
        "https://cdn.example/image.jpg",
        origin,
      ),
    /UNSAFE_IMAGE_HOST/,
  );
  assert.throws(
    () =>
      normalizeWordpressMediaUrl(
        "https://www.blog.ooblik.com/wp-content/uploads/2025/02/image.jpg",
        origin,
      ),
    /UNSAFE_IMAGE_HOST/,
  );
  assert.throws(
    () =>
      normalizeWordpressMediaUrl(
        "/wp-content/uploads/2025/02/%2e%2e/secret.jpg",
        origin,
      ),
    /(UNSAFE_IMAGE_PATH|IMAGE_OUTSIDE_UPLOADS)/,
  );
});

test("external content images are reported but not accepted for publication", async () => {
  const xml = (await fixture()).replace(
    "https://blog.ooblik.com/wp-content/uploads/2024/fallback.png",
    "https://images.example/fallback.png",
  );
  const preview = buildWordpressImportPreview({ xml, currentLinks: [duplicate] });
  const item = preview.ready.find((candidate) => candidate.wordpress_id === "102");
  assert.equal(item?.image_source, "content");
  assert.equal(item?.image_url, "");
  assert.equal(item?.image_rejection, "external");
  assert.equal(item?.image_candidate_url, "https://images.example/fallback.png");
});

test("an explicit null override records a deliberate image absence", async () => {
  const initial = buildWordpressImportPreview({
    xml: await fixture(),
    currentLinks: [duplicate],
  });
  const illustrated = initial.ready.find(
    (candidate) => candidate.wordpress_id === "101",
  )!.link;
  illustrated.image = wordpressImagePath(illustrated, "101");
  illustrated.image_alt = "Ancienne légende";
  const preview = buildWordpressImportPreview({
    xml: await fixture(),
    currentLinks: [duplicate, illustrated],
    overrides: { "101": { image_url: null } },
  });
  const item = preview.ready.find((candidate) => candidate.wordpress_id === "101");
  assert.equal(item?.image_source, "none");
  assert.equal(item?.image_rejection, "none_by_override");
  assert.equal(item?.image_url, "");
  assert.equal(item?.link.image, undefined);
  assert.equal(item?.link.image_alt, undefined);
  assert.equal(
    preview.catalog.find((link) => link.origin_url === illustrated.origin_url)?.image,
    undefined,
  );
  assert.throws(
    () =>
      buildWordpressImportPreview({
        xml: "<rss/>",
        currentLinks: [],
        overrides: { "101": { image_url: "" } },
      }),
    /INVALID_OVERRIDE:101/,
  );
});

test("applying a null override removes the obsolete managed WebP", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "digest-wordpress-null-image-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const site = join(temporary, "site");
  const work = join(temporary, "work");
  const media = join(temporary, "uploads");
  const xmlPath = join(work, "export.xml");
  const overridesPath = join(work, "overrides.json");
  const catalogPath = join(site, "data", "links.json");
  await mkdir(dirname(catalogPath), { recursive: true });
  await mkdir(media, { recursive: true });
  await mkdir(work, { recursive: true });

  const xml = await fixture();
  const initial = buildWordpressImportPreview({ xml, currentLinks: [duplicate] });
  const illustrated = initial.ready.find(
    (candidate) => candidate.wordpress_id === "101",
  )!.link;
  illustrated.image = wordpressImagePath(illustrated, "101");
  illustrated.image_alt = "Ancienne légende";
  const obsoleteImage = join(
    site,
    "static",
    ...illustrated.image.split("/").filter(Boolean),
  );
  await mkdir(dirname(obsoleteImage), { recursive: true });
  await writeFile(obsoleteImage, "obsolete");
  await writeFile(catalogPath, serializeCatalog([duplicate, illustrated]));
  await writeFile(xmlPath, xml);
  await writeFile(overridesPath, JSON.stringify({ "101": { image_url: null } }));

  const script = fileURLToPath(new URL("../scripts/import-wordpress.ts", import.meta.url));
  const runImport = () =>
    spawnSync(
      process.execPath,
      [
      "--import",
      "tsx",
      script,
      "--input",
      xmlPath,
      "--workdir",
      work,
      "--site",
      site,
      "--overrides",
      overridesPath,
      "--media-root",
      media,
      "--local-only",
      "--apply",
      "--skip-images",
      ],
      { encoding: "utf8", cwd: fileURLToPath(new URL("..", import.meta.url)) },
    );

  const blockedReadyPath = join(work, "ready.json");
  await mkdir(blockedReadyPath);
  const failed = runImport();
  assert.notEqual(failed.status, 0);
  assert.equal((await stat(obsoleteImage)).isFile(), true);
  const unchanged = parseCatalog(await readFile(catalogPath, "utf8"));
  assert.equal(
    unchanged.find((link) => link.origin_url === illustrated.origin_url)?.image,
    illustrated.image,
  );
  await rm(blockedReadyPath, { recursive: true });

  const result = runImport();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(await stat(obsoleteImage).catch(() => null), null);
  const catalog = parseCatalog(await readFile(catalogPath, "utf8"));
  const updated = catalog.find((link) => link.origin_url === illustrated.origin_url);
  assert.equal(updated?.image, undefined);
  assert.equal(updated?.image_alt, undefined);
});

test("an explicit image override has distinct report provenance", async () => {
  const preview = buildWordpressImportPreview({
    xml: await fixture(),
    currentLinks: [duplicate],
    overrides: {
      "101": {
        image_url:
          "https://blog.ooblik.com/wp-content/uploads/2025/override.jpg",
      },
    },
  });
  const item = preview.ready.find((candidate) => candidate.wordpress_id === "101");
  assert.equal(item?.image_source, "override");
  assert.equal(
    item?.image_url,
    "https://blog.ooblik.com/wp-content/uploads/2025/override.jpg",
  );
});

test("local-only image loading never falls back to the network", async () => {
  let downloads = 0;
  await assert.rejects(
    loadWordpressImageSource({
      rawUrl: "/wp-content/uploads/2025/02/missing.jpg",
      blogOrigin: "https://blog.ooblik.com/2025/post/",
      localOnly: true,
      readLocal: async () => {
        const error = new Error("missing") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      },
      download: async () => {
        downloads += 1;
        return Buffer.from("network");
      },
    }),
    /IMAGE_LOCAL_NOT_FOUND/,
  );
  assert.equal(downloads, 0);
});

test("non-strict image loading can fall back after a local miss", async () => {
  const loaded = await loadWordpressImageSource({
    rawUrl: "/wp-content/uploads/2025/02/missing.jpg",
    blogOrigin: "https://blog.ooblik.com/2025/post/",
    localOnly: false,
    readLocal: async () => {
      const error = new Error("missing") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    },
    download: async () => Buffer.from("network"),
  });
  assert.equal(loaded.from, "network");
  assert.equal(loaded.buffer.toString(), "network");
});

test("image review HTML is escaped, deterministic and exposes required filters", () => {
  const item = {
    wordpress_id: "42",
    title: '<script>alert("x")</script>',
    year: "2025",
    origin_url: "https://blog.ooblik.com/2025/revue/",
    source: "content" as const,
    status: "ready" as const,
    low_resolution: true,
    source_width: 320,
    source_height: 240,
    final_width: 320,
    final_height: 180,
    ftp_path: "2025/02/source.jpg",
    webp_path: "media/revue-42.webp",
  };
  const first = renderWordpressImageReviewHtml([item]);
  const second = renderWordpressImageReviewHtml([item]);
  assert.equal(first, second);
  assert.match(first, /data-filter="content"/);
  assert.match(first, /data-filter="low_resolution"/);
  assert.match(first, /data-filter="missing_local"/);
  assert.match(first, /data-filter="external"/);
  assert.match(first, /src="media\/revue-42\.webp"/);
  assert.match(first, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(first, /<script>alert/);
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

test("detected explicit and strongly labelled embedded sources replace self archives", async () => {
  const xml = (await fixture())
    .replace("<title>Sans source</title>", "<title>Projet typographique retrouvé</title>")
    .replace(
      "<p>Texte seul.</p>",
      '<p><a href="https://candidate.example/sans-source">Projet typographique retrouvé</a></p>',
    );
  const selfArchived = (id: string, title: string, origin_url: string): DigestLink => ({
    id,
    title,
    url: origin_url.replace(/\/$/, ""),
    origin_url,
    category: BLOG_ARCHIVE_CATEGORY,
    added: "2023-01-01",
    stream: BLOG_ARCHIVE_STREAM,
  });
  const recovered = restoreDetectedWordpressSources({
    xml,
    currentLinks: [
      selfArchived("normal", "Projet normal", "https://blog.ooblik.com/2025/normal/"),
      selfArchived(
        "missing",
        "Projet typographique retrouvé",
        "https://blog.ooblik.com/2023/sans-source/",
      ),
    ],
  });

  assert.equal(recovered.accepted, 2);
  assert.equal(recovered.explicit, 1);
  assert.equal(recovered.embedded, 1);
  assert.equal(recovered.overrides["101"]?.source_url, "https://normal.example/project");
  assert.equal(
    recovered.overrides["103"]?.source_url,
    "https://candidate.example/sans-source",
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

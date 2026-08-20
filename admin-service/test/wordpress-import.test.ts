import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";

import type { DigestLink } from "../src/catalog.js";
import {
  BLOG_ARCHIVE_CATEGORY,
  BLOG_ARCHIVE_STREAM,
  buildWordpressImportPreview,
  optimizeWordpressImage,
  parseWordpressExport,
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
};

test("WXR parsing keeps published posts, sources, taxonomy and image priority", async () => {
  const posts = parseWordpressExport(await fixture());
  assert.equal(posts.length, 7);
  const normal = posts.find((post) => post.wordpressId === "101");
  assert.deepEqual(normal?.sourceUrls, ["https://normal.example/project"]);
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
  assert.equal(normal?.category, BLOG_ARCHIVE_CATEGORY);
  assert.equal(normal?.stream, BLOG_ARCHIVE_STREAM);
  assert.equal(normal?.origin_url, "https://blog.ooblik.com/2025/normal/");
  const dead = preview.ready.find((item) => item.wordpress_id === "107")?.link;
  assert.equal(dead?.status, "dead");
  assert.equal(dead?.tags?.includes("lien-mort"), true);
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

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  capturePublicPage,
  LinkSocialImageService,
  pruneCaptureCache,
} from "../src/link-social-image.js";

const link = {
  id: "3583bb99-c9f5-53fc-832c-9d92933c1ad4",
  title: "Design Better Periodic Table",
  url: "https://db-periodic-table.vercel.app/",
};

test("capture rejects a private IPv4-mapped IPv6 destination before launch", async () => {
  await assert.rejects(
    capturePublicPage("http://[::ffff:127.0.0.1]/"),
    /PRIVATE_URL/,
  );
});

test("a link screenshot becomes a cached 1200 by 1200 editorial image", async () => {
  const directory = await mkdtemp(join(tmpdir(), "digest-link-image-"));
  let captures = 0;
  try {
    const screenshot = await sharp({
      create: {
        width: 1440,
        height: 752,
        channels: 3,
        background: { r: 35, g: 120, b: 220 },
      },
    }).png().toBuffer();
    const service = new LinkSocialImageService(directory, async () => {
      captures += 1;
      return screenshot;
    });

    const first = await service.imageFor(link);
    assert.equal(first.source, "screenshot");
    assert.match(
      first.imageUrl,
      /^\/api\/linkedin-images\/3583bb99-c9f5-53fc-832c-9d92933c1ad4-[0-9a-f]{16}\.png\?v=\d+&reservation=[0-9a-f]{48}$/,
    );
    const firstUrl = new URL(first.imageUrl, "https://digest.ooblik.com");
    const name = basename(firstUrl.pathname);
    const image = await service.read(
      name,
      firstUrl.searchParams.get("reservation") ?? undefined,
    );
    assert.ok(image);
    const metadata = await sharp(image).metadata();
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 1200);
    assert.equal(metadata.format, "png");

    const cached = await service.imageFor(link);
    const cachedUrl = new URL(cached.imageUrl, "https://digest.ooblik.com");
    assert.equal(cachedUrl.pathname, firstUrl.pathname);
    assert.equal(cachedUrl.searchParams.get("v"), firstUrl.searchParams.get("v"));
    assert.notEqual(
      cachedUrl.searchParams.get("reservation"),
      firstUrl.searchParams.get("reservation"),
    );
    assert.equal(captures, 1);

    const retitled = await service.imageFor({
      ...link,
      title: "Design Better — nouveau titre",
    });
    assert.notEqual(retitled.imageUrl, first.imageUrl);
    assert.equal(captures, 2);

    await service.imageFor(link, true);
    assert.equal(captures, 3);
    assert.equal(await service.read("../../auth.sqlite"), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a blocked screenshot produces a link-specific branded fallback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "digest-link-fallback-"));
  try {
    const service = new LinkSocialImageService(directory, async () => {
      throw new Error("SITE_BLOCKED_CAPTURE");
    });
    const result = await service.imageFor(link);
    assert.equal(result.source, "fallback");
    const name = basename(new URL(result.imageUrl, "https://digest.ooblik.com").pathname);
    const image = await service.read(name);
    assert.ok(image);
    const metadata = await sharp(image).metadata();
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 1200);
    assert.ok(image.length < 500_000);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a cache hit is reserved before its files are read", async () => {
  const directory = await mkdtemp(join(tmpdir(), "digest-link-reserved-hit-"));
  try {
    const screenshot = await sharp({
      create: {
        width: 1440,
        height: 752,
        channels: 3,
        background: { r: 35, g: 120, b: 220 },
      },
    }).png().toBuffer();
    const writer = new LinkSocialImageService(directory, async () => screenshot);
    const generated = await writer.imageFor(link);
    const name = basename(new URL(generated.imageUrl, "https://digest.ooblik.com").pathname);
    const generatedUrl = new URL(generated.imageUrl, "https://digest.ooblik.com");
    assert.ok(
      await writer.read(name, generatedUrl.searchParams.get("reservation") ?? undefined),
    );

    let allowRead!: () => void;
    const readAllowed = new Promise<void>((resolve) => {
      allowRead = resolve;
    });
    let announceRead!: () => void;
    const readAnnounced = new Promise<void>((resolve) => {
      announceRead = resolve;
    });
    const reader = new LinkSocialImageService(
      directory,
      async () => screenshot,
      async (path, metadataPath) => {
        announceRead();
        await readAllowed;
        const [info, metadata] = await Promise.all([
          stat(path),
          readFile(metadataPath, "utf8"),
        ]);
        return { info, metadata };
      },
    );

    const cached = reader.imageFor(link);
    await readAnnounced;
    await pruneCaptureCache(directory, {
      maxAgeMs: Number.POSITIVE_INFINITY,
      maxBytes: 0,
      nowMs: Date.now(),
    });
    assert.ok(await readFile(join(directory, name)));

    allowRead();
    const cachedResult = await cached;
    const cachedUrl = new URL(cachedResult.imageUrl, "https://digest.ooblik.com");
    assert.ok(
      await reader.read(name, cachedUrl.searchParams.get("reservation") ?? undefined),
    );
    await pruneCaptureCache(directory, {
      maxAgeMs: Number.POSITIVE_INFINITY,
      maxBytes: 0,
      nowMs: Date.now(),
    });
    await assert.rejects(readFile(join(directory, name)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("one reader cannot release another reader's cache reservation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "digest-link-token-reservation-"));
  try {
    const screenshot = await sharp({
      create: {
        width: 1440,
        height: 752,
        channels: 3,
        background: { r: 35, g: 120, b: 220 },
      },
    }).png().toBuffer();
    const service = new LinkSocialImageService(directory, async () => screenshot);
    const first = await service.imageFor(link);
    const firstUrl = new URL(first.imageUrl, "https://digest.ooblik.com");
    const name = basename(firstUrl.pathname);
    assert.ok(
      await service.read(name, firstUrl.searchParams.get("reservation") ?? undefined),
    );

    const publication = await service.imageFor(link);
    const unrelated = await service.imageFor(link);
    const publicationUrl = new URL(publication.imageUrl, "https://digest.ooblik.com");
    const unrelatedUrl = new URL(unrelated.imageUrl, "https://digest.ooblik.com");

    assert.ok(await service.read(name));
    assert.ok(
      await service.read(
        name,
        unrelatedUrl.searchParams.get("reservation") ?? undefined,
      ),
    );
    await pruneCaptureCache(directory, {
      maxAgeMs: Number.POSITIVE_INFINITY,
      maxBytes: 0,
      nowMs: Date.now(),
    });
    assert.ok(await readFile(join(directory, name)));

    assert.ok(
      await service.read(
        name,
        publicationUrl.searchParams.get("reservation") ?? undefined,
      ),
    );
    await pruneCaptureCache(directory, {
      maxAgeMs: Number.POSITIVE_INFINITY,
      maxBytes: 0,
      nowMs: Date.now(),
    });
    await assert.rejects(readFile(join(directory, name)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

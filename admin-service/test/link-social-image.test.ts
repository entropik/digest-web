import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { LinkSocialImageService } from "../src/link-social-image.js";

const link = {
  id: "3583bb99-c9f5-53fc-832c-9d92933c1ad4",
  title: "Design Better Periodic Table",
  url: "https://db-periodic-table.vercel.app/",
};

test("a link screenshot becomes a cached 1200 by 627 editorial image", async () => {
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
      /^\/api\/linkedin-images\/3583bb99-c9f5-53fc-832c-9d92933c1ad4-[0-9a-f]{16}\.png\?v=\d+$/,
    );
    const name = basename(new URL(first.imageUrl, "https://digest.ooblik.com").pathname);
    const image = await service.read(name);
    assert.ok(image);
    const metadata = await sharp(image).metadata();
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 627);
    assert.equal(metadata.format, "png");

    const cached = await service.imageFor(link);
    assert.equal(cached.imageUrl, first.imageUrl);
    assert.equal(captures, 1);

    await service.imageFor(link, true);
    assert.equal(captures, 2);
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
    assert.equal(metadata.height, 627);
    assert.ok(image.length < 500_000);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

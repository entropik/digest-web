import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  pruneCaptureCache,
  withCaptureCacheLock,
} from "../src/link-social-image.js";

const names = [
  "11111111-1111-5111-8111-111111111111-1111111111111111.png",
  "22222222-2222-5222-8222-222222222222-2222222222222222.png",
  "33333333-3333-5333-8333-333333333333-3333333333333333.png",
];

const writeCachedImage = async (
  directory: string,
  name: string,
  size: number,
  timestamp: Date,
) => {
  const path = join(directory, name);
  await writeFile(path, Buffer.alloc(size, 1));
  await writeFile(`${path}.json`, "{}");
  await utimes(path, timestamp, timestamp);
  await utimes(`${path}.json`, timestamp, timestamp);
};

test("capture cache removes expired image and metadata pairs by timestamp", async () => {
  const directory = await mkdtemp(join(tmpdir(), "digest-capture-age-"));
  try {
    const now = new Date("2026-08-17T12:00:00.000Z");
    await writeCachedImage(directory, names[0]!, 10, new Date("2026-07-01T00:00:00.000Z"));
    await writeCachedImage(directory, names[1]!, 10, new Date("2026-08-16T00:00:00.000Z"));

    await pruneCaptureCache(directory, {
      maxAgeMs: 30 * 24 * 60 * 60 * 1_000,
      maxBytes: 1_000,
      nowMs: now.valueOf(),
    });

    await assert.rejects(readFile(join(directory, names[0]!)));
    await assert.rejects(readFile(join(directory, `${names[0]}.json`)));
    assert.equal((await readFile(join(directory, names[1]!))).length, 10);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("capture cache evicts oldest files until it fits the byte limit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "digest-capture-size-"));
  try {
    await writeCachedImage(directory, names[0]!, 40, new Date("2026-08-15T00:00:00.000Z"));
    await writeCachedImage(directory, names[1]!, 40, new Date("2026-08-16T00:00:00.000Z"));
    await writeCachedImage(directory, names[2]!, 40, new Date("2026-08-17T00:00:00.000Z"));

    await pruneCaptureCache(directory, {
      maxAgeMs: Number.POSITIVE_INFINITY,
      maxBytes: 84,
      nowMs: new Date("2026-08-17T12:00:00.000Z").valueOf(),
    });

    await assert.rejects(readFile(join(directory, names[0]!)));
    assert.equal((await readFile(join(directory, names[1]!))).length, 40);
    assert.equal((await readFile(join(directory, names[2]!))).length, 40);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("capture cache lock serializes maintenance for the same directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "digest-capture-lock-"));
  let active = 0;
  let maximum = 0;
  const task = () =>
    withCaptureCacheLock(directory, async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
    });
  try {
    await Promise.all([task(), task(), task()]);
    assert.equal(maximum, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

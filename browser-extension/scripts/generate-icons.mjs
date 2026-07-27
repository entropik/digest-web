import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { constants, deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (name, data) => {
  const type = Buffer.from(name);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, checksum]);
};

const isRoundedSquare = (x, y, size) => {
  const min = size * 0.125;
  const max = size * 0.875;
  const radius = size * 0.172;
  const clampedX = Math.max(min + radius, Math.min(x, max - radius));
  const clampedY = Math.max(min + radius, Math.min(y, max - radius));
  return Math.hypot(x - clampedX, y - clampedY) <= radius;
};

const isDigestMark = (x, y, size) => {
  const sx = (x / size) * 128;
  const sy = (y / size) * 128;
  const vertical = sx >= 40 && sx <= 54 && sy >= 34 && sy <= 94;
  const outer = ((sx - 66) / 32) ** 2 + ((sy - 64) / 30) ** 2 <= 1;
  const inner = ((sx - 68) / 16) ** 2 + ((sy - 64) / 17) ** 2 <= 1;
  return vertical || (sx >= 40 && outer && !inner);
};

const icon = (size) => {
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      const offset = 1 + x * 4;
      const dark = isDigestMark(x + 0.5, y + 0.5, size);
      const coral = isRoundedSquare(x + 0.5, y + 0.5, size);
      row[offset] = dark ? 22 : 255;
      row[offset + 1] = dark ? 22 : 92;
      row[offset + 2] = dark ? 22 : 53;
      row[offset + 3] = dark || coral ? 255 : 0;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk(
      "IDAT",
      deflateSync(Buffer.concat(rows), {
        level: constants.Z_BEST_COMPRESSION,
        strategy: constants.Z_FIXED,
      }),
    ),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

const check = process.argv.includes("--check");
for (const size of [16, 32, 48, 128]) {
  const path = resolve(`public/icon/${size}.png`);
  const expected = icon(size);
  if (check) {
    const current = await readFile(path).catch(() => undefined);
    if (!current?.equals(expected)) {
      throw new Error(
        `public/icon/${size}.png is stale; run "npm run icons" and commit the result.`,
      );
    }
    continue;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, expected);
}
console.log(
  check
    ? "Chrome extension icons are reproducible and current."
    : "Chrome extension icons generated.",
);

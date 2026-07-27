import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";

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

const icon = (size) => {
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      const offset = 1 + x * 4;
      const margin = Math.max(2, Math.round(size * 0.17));
      const stroke = Math.max(1, Math.round(size * 0.09));
      const inVertical =
        x >= margin && x < margin + stroke && y >= margin && y < size - margin;
      const centerY = size / 2;
      const radius = size / 2 - margin;
      const ring =
        x >= margin &&
        x <= size - margin &&
        Math.abs(Math.hypot(x - margin, y - centerY) - radius) < stroke;
      const dark = inVertical || (ring && x >= margin);
      row[offset] = dark ? 23 : 255;
      row[offset + 1] = dark ? 23 : 90;
      row[offset + 2] = dark ? 23 : 54;
      row[offset + 3] = 255;
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
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

for (const size of [16, 32, 48, 128]) {
  const path = resolve(`public/icon/${size}.png`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, icon(size));
}
console.log("Chrome extension icons generated.");

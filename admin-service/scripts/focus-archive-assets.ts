import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { TECHNICAL_ARCHIVES } from "../src/social-image.js";

const dates = [
  ...new Set(
    TECHNICAL_ARCHIVES.map((entry) => {
      const match = entry.file.match(/(\d{4}-\d{2}-\d{2})\.jpg$/);
      return match ? match[1]! : "";
    }).filter(Boolean),
  ),
];
const sourceDirectory = resolve(
  "../static/media/journal-procrastinateur/collections/v2-nasa",
);
const destinationDirectory = resolve("../static/social/focus-archives");

await mkdir(destinationDirectory, { recursive: true });
await Promise.all(
  dates.map((date) =>
    sharp(resolve(sourceDirectory, `${date}.webp`))
      .resize(1200, 800, { fit: "cover", position: "centre" })
      .grayscale()
      .normalize()
      .jpeg({ quality: 78, chromaSubsampling: "4:4:4", mozjpeg: true })
      .toFile(resolve(destinationDirectory, `${date}.jpg`)),
  ),
);

console.log(`Prepared ${dates.length} technical archive images.`);

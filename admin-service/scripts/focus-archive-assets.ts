import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const dates = ["2026-03-12", "2026-03-13", "2026-04-16", "2026-04-17"];
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

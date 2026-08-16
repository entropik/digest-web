import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import {
  generateOptimizedSocialImage,
  generateSocialImage,
  socialImageSvg,
  type SocialImageFamily,
  type SocialImageInput,
} from "../src/social-image.js";

const outputArgument = process.argv.indexOf("--out");
const outputDirectory = resolve(
  outputArgument >= 0 && process.argv[outputArgument + 1]
    ? process.argv[outputArgument + 1]!
    : "../.social-preview",
);

const descriptions = [
  "Intelligence artificielle, développement, design, édition et création numérique.",
  "Images synthétiques, outils libres, interfaces et pratiques créatives.",
  "Code, typographie, culture visuelle et mémoire fragile du Web.",
];

const samples: Array<
  SocialImageInput & { family: SocialImageFamily; accent: string; file: string }
> = [];
const perFamily = new Map<SocialImageFamily, number>();

for (let offset = 0; offset < 180 && samples.length < 9; offset += 1) {
  const date = new Date(Date.UTC(2026, 0, 1 + offset));
  const digestDate = date.toISOString().slice(0, 10);
  const input: SocialImageInput = {
    digestDate,
    title: new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date),
    description: descriptions[offset % descriptions.length]!,
    linkCount: 7 + (offset % 17),
  };
  const { family, accent } = socialImageSvg(input);
  const familyCount = perFamily.get(family) ?? 0;
  if (familyCount >= 3) continue;
  const file = `${String(samples.length + 1).padStart(2, "0")}-${family}-${digestDate}.png`;
  samples.push({ ...input, family, accent, file });
  perFamily.set(family, familyCount + 1);
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  samples.map(async (sample) => {
    await writeFile(
      resolve(outputDirectory, sample.file),
      await generateOptimizedSocialImage(sample),
    );
  }),
);

const cellWidth = 400;
const cellImageHeight = 209;
const captionHeight = 45;
const gap = 14;
const sheetWidth = cellWidth * 3 + gap * 4;
const sheetHeight = (cellImageHeight + captionHeight) * 3 + gap * 4;
const cells = samples
  .map((sample, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = gap + column * (cellWidth + gap);
    const y = gap + row * (cellImageHeight + captionHeight + gap);
    const png = generateSocialImage(sample).toString("base64");
    return `
      <image x="${x}" y="${y}" width="${cellWidth}" height="${cellImageHeight}" href="data:image/png;base64,${png}"/>
      <text x="${x}" y="${y + cellImageHeight + 23}" class="caption">${sample.family} · ${sample.digestDate} · ${sample.accent}</text>`;
  })
  .join("");
const sheetSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}">
  <rect width="100%" height="100%" fill="#D7D5D0"/>
  <style>.caption{font:700 15px sans-serif;fill:#0A0A0A}</style>
  ${cells}
</svg>`;
await writeFile(resolve(outputDirectory, "contact-sheet.svg"), sheetSvg);
await writeFile(
  resolve(outputDirectory, "contact-sheet.png"),
  new Resvg(sheetSvg).render().asPng(),
);
await writeFile(
  resolve(outputDirectory, "manifest.json"),
  `${JSON.stringify(samples, null, 2)}\n`,
);

console.log(`Generated ${samples.length} social images in ${outputDirectory}`);

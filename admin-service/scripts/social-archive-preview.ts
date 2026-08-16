import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import {
  generateOptimizedSocialImage,
  generateSocialImage,
  socialImageSvg,
  type SocialImageInput,
} from "../src/social-image.js";

type CatalogLink = { added?: string };

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const outputDirectory = resolve(argument("--out") ?? "../.social-archive-preview");
const requestedCount = Number.parseInt(argument("--count") ?? "24", 10);
const sampleCount = Number.isFinite(requestedCount)
  ? Math.max(1, Math.min(60, requestedCount))
  : 24;

const scalar = (frontMatter: string, key: string): string => {
  const match = frontMatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return "";
  const value = match[1]!.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
};

const archiveDirectory = resolve("../content/archives");
const archiveFiles = (await readdir(archiveDirectory))
  .filter((file) => /^\d{4}-\d{2}-\d{2}\.md$/.test(file))
  .sort();
const selectedFiles = Array.from({ length: Math.min(sampleCount, archiveFiles.length) }, (_, index) => {
  const position = Math.round((index * (archiveFiles.length - 1)) / (Math.min(sampleCount, archiveFiles.length) - 1 || 1));
  return archiveFiles[position]!;
});

const catalog = JSON.parse(
  await readFile(resolve("../data/links.json"), "utf8"),
) as CatalogLink[];
const linksByDate = new Map<string, number>();
for (const link of catalog) {
  if (!link.added) continue;
  linksByDate.set(link.added, (linksByDate.get(link.added) ?? 0) + 1);
}

const samples = await Promise.all(
  selectedFiles.map(async (file) => {
    const source = await readFile(resolve(archiveDirectory, file), "utf8");
    const frontMatter = source.split("---", 3)[1] ?? "";
    const digestDate = scalar(frontMatter, "digest_date") || basename(file, ".md");
    const input: SocialImageInput = {
      digestDate,
      title: scalar(frontMatter, "title") || digestDate,
      description: scalar(frontMatter, "description") || "Archive du Digest Ooblik.",
      linkCount: linksByDate.get(digestDate) ?? 0,
    };
    const variation = socialImageSvg(input);
    return {
      ...input,
      family: variation.family,
      accent: variation.accent,
      file: `${digestDate}.png`,
    };
  }),
);

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  samples.map((sample) =>
    generateOptimizedSocialImage(sample).then((image) =>
      writeFile(resolve(outputDirectory, sample.file), image),
    ),
  ),
);

const columns = 4;
const cellWidth = 360;
const cellImageHeight = 188;
const captionHeight = 40;
const gap = 14;
const rows = Math.ceil(samples.length / columns);
const sheetWidth = columns * cellWidth + (columns + 1) * gap;
const sheetHeight = rows * (cellImageHeight + captionHeight) + (rows + 1) * gap;
const cells = samples
  .map((sample, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gap + column * (cellWidth + gap);
    const y = gap + row * (cellImageHeight + captionHeight + gap);
    const png = generateSocialImage(sample).toString("base64");
    return `
      <image x="${x}" y="${y}" width="${cellWidth}" height="${cellImageHeight}" href="data:image/png;base64,${png}"/>
      <text x="${x}" y="${y + cellImageHeight + 23}" class="caption">${sample.digestDate} · ${sample.linkCount} liens · ${sample.family}</text>`;
  })
  .join("");
const sheetSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}">
  <rect width="100%" height="100%" fill="#D7D5D0"/>
  <style>.caption{font:700 14px sans-serif;fill:#0A0A0A}</style>
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

console.log(
  `Generated ${samples.length} historical social images in ${outputDirectory}`,
);

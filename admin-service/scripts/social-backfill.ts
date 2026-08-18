import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  generateOptimizedLinkedInImage,
  generateOptimizedSocialImage,
  type SocialImageInput,
} from "../src/social-image.js";

type CatalogLink = { added?: string; visibility?: "hidden" };

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(name);

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

const withSocialImage = (source: string, digestDate: string): string => {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`Missing front matter for ${digestDate}`);
  const image = `/social/${digestDate}.png`;
  if (match[1]!.includes(image)) return source;
  if (/^images:\s*$/m.test(match[1]!)) {
    throw new Error(`An unrelated images list already exists for ${digestDate}`);
  }
  const updated = `${match[1]}\nimages:\n  - ${JSON.stringify(image)}`;
  return `${source.slice(0, match.index!)}---\n${updated}\n---${source.slice(match.index! + match[0].length)}`;
};

const archiveDirectory = resolve("../content/archives");
const socialDirectory = resolve("../static/social");
const force = hasFlag("--force");
const requestedDate = argument("--date");
const requestedConcurrency = Number.parseInt(argument("--concurrency") ?? "6", 10);
const concurrency = Number.isFinite(requestedConcurrency)
  ? Math.max(1, Math.min(12, requestedConcurrency))
  : 6;

const archiveFiles = (await readdir(archiveDirectory))
  .filter((file) => /^\d{4}-\d{2}-\d{2}\.md$/.test(file))
  .filter((file) => !requestedDate || file === `${requestedDate}.md`)
  .sort();
const catalog = JSON.parse(
  await readFile(resolve("../data/links.json"), "utf8"),
) as CatalogLink[];
const linksByDate = new Map<string, number>();
for (const link of catalog) {
  if (!link.added || link.visibility === "hidden") continue;
  linksByDate.set(link.added, (linksByDate.get(link.added) ?? 0) + 1);
}

await mkdir(socialDirectory, { recursive: true });

let generated = 0;
let preserved = 0;
let updatedFrontMatter = 0;
let totalBytes = 0;
let cursor = 0;

const worker = async (): Promise<void> => {
  while (cursor < archiveFiles.length) {
    const file = archiveFiles[cursor++]!;
    const path = resolve(archiveDirectory, file);
    const source = await readFile(path, "utf8");
    const frontMatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
    const digestDate = scalar(frontMatter, "digest_date") || basename(file, ".md");
    const input: SocialImageInput = {
      digestDate,
      title: scalar(frontMatter, "title") || digestDate,
      description: scalar(frontMatter, "description") || "Archive du Digest Ooblik.",
      linkCount: linksByDate.get(digestDate) ?? 0,
    };
    const destination = resolve(socialDirectory, `${digestDate}.png`);
    const linkedInDestination = resolve(
      socialDirectory,
      `${digestDate}-linkedin.png`,
    );

    for (const [path, generate] of [
      [destination, generateOptimizedSocialImage],
      [linkedInDestination, generateOptimizedLinkedInImage],
    ] as const) {
      let exists = false;
      try {
        const metadata = await stat(path);
        exists = metadata.isFile();
        if (exists && !force) totalBytes += metadata.size;
      } catch {
        exists = false;
      }

      if (!exists || force) {
        const image = await generate(input);
        await writeFile(path, image);
        totalBytes += image.length;
        generated += 1;
        if (generated % 50 === 0) {
          console.log(`Generated ${generated} social images…`);
        }
      } else {
        preserved += 1;
      }
    }

    const updatedSource = withSocialImage(source, digestDate);
    if (updatedSource !== source) {
      await writeFile(path, updatedSource);
      updatedFrontMatter += 1;
    }
  }
};

await Promise.all(Array.from({ length: concurrency }, () => worker()));

console.log(
  `Social backfill complete: ${generated} generated, ${preserved} preserved, ` +
    `${updatedFrontMatter} archives updated, ${(totalBytes / 1_000_000).toFixed(1)} MB total.`,
);

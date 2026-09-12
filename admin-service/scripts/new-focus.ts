import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  generateOptimizedLinkedInImage,
  generateOptimizedSocialImage,
  TECHNICAL_ARCHIVES,
  FOCUS_ARCHIVES_BY_DATE,
} from "../src/social-image.js";

const rootDir = resolve(fileURLToPath(import.meta.url), "../../../");
const adminDir = resolve(rootDir, "admin-service");
const staticDir = resolve(rootDir, "static");
const archivesDir = resolve(rootDir, "content/archives");
const nasaDataPath = resolve(rootDir, "data/journal-documents-v2-nasa.json");
const linksDataPath = resolve(rootDir, "data/links.json");
const socialImageTsPath = resolve(adminDir, "src/social-image.ts");

type NasaDoc = {
  title: string;
  creator: string;
  date: string;
  image: string;
  theme?: string;
  themeLabel?: string;
  sourceUrl?: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1]!.startsWith("--")) {
        options[key] = args[i + 1]!;
        i++;
      } else {
        options[key] = "true";
      }
    }
  }
  return options;
}

function getUsedArchiveImages(): Set<string> {
  const used = new Set<string>();
  // 1. From FOCUS_ARCHIVES_BY_DATE
  for (const img of Object.values(FOCUS_ARCHIVES_BY_DATE)) {
    const match = img.match(/(\d{4}-\d{2}-\d{2})\.jpg$/);
    if (match) used.add(match[1]!);
  }
  // 2. From markdown files
  if (existsSync(archivesDir)) {
    for (const file of readdirSync(archivesDir)) {
      if (!file.endsWith(".md") || file.startsWith("_")) continue;
      const content = readFileSync(resolve(archivesDir, file), "utf-8");
      const match = content.match(/archive_image:\s*["']?\/social\/focus-archives\/(\d{4}-\d{2}-\d{2})\.jpg/);
      if (match) used.add(match[1]!);
    }
  }
  return used;
}

async function listAvailableImages() {
  const used = getUsedArchiveImages();
  const nasaRaw = await readFile(nasaDataPath, "utf-8");
  const nasaDocs: Record<string, NasaDoc> = JSON.parse(nasaRaw);

  console.log(`\n=== Visuels d'archives NASA disponibles (inédits) ===\n`);
  let count = 0;
  for (const [date, doc] of Object.entries(nasaDocs)) {
    if (!used.has(date)) {
      console.log(`- [${date}] ${doc.title} (${doc.date}) · Thème : ${doc.themeLabel || doc.theme || "N/A"}`);
      count++;
      if (count >= 20) {
        console.log(`\n... et encore ${Object.keys(nasaDocs).length - used.size - count} autres visuels disponibles.`);
        break;
      }
    }
  }
  console.log(`\nTotal visuels utilisés : ${used.size}`);
  console.log(`Total visuels disponibles : ${Object.keys(nasaDocs).length - used.size}\n`);
}

async function createFocus(opts: Record<string, string>) {
  const date = opts.date;
  const slug = opts.slug;
  const title = opts.title;
  const description = opts.description || "Dossier thématique OOBLIK Focus.";
  const urls = opts.urls ? opts.urls.split(",").map((u) => u.trim()).filter(Boolean) : [];
  let chosenImage = opts.image;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error("Erreur : --date YYYY-MM-DD est obligatoire.");
    process.exit(1);
  }
  if (!slug || !/^[a-z0-9-]+$/.test(slug) || slug === date) {
    console.error("Erreur : --slug <slug> est obligatoire (lettres minuscules, chiffres et tirets).");
    process.exit(1);
  }
  if (!title) {
    console.error("Erreur : --title <titre> est obligatoire.");
    process.exit(1);
  }

  const editionKey = `${date}-${slug}`;
  const targetMd = resolve(archivesDir, `${editionKey}.md`);
  if (existsSync(targetMd)) {
    console.error(`Erreur : Le fichier ${targetMd} existe déjà.`);
    process.exit(1);
  }

  // Check URLs in catalog
  if (urls.length > 0) {
    const linksRaw = await readFile(linksDataPath, "utf-8");
    const links = JSON.parse(linksRaw);
    const catalogUrls = new Set(
      links.filter((l: any) => l.visibility !== "hidden").map((l: any) => l.url)
    );
    const missingUrls = urls.filter((u) => !catalogUrls.has(u));
    if (missingUrls.length > 0) {
      console.warn(`\n⚠️ Attention : Les URLs suivantes ne sont pas encore présentes dans data/links.json :`);
      for (const u of missingUrls) console.warn(`   - ${u}`);
      console.warn(`Pensez à les ajouter au catalogue pour qu'elles s'affichent correctement.\n`);
    }
  }

  const usedImages = getUsedArchiveImages();
  const nasaRaw = await readFile(nasaDataPath, "utf-8");
  const nasaDocs: Record<string, NasaDoc> = JSON.parse(nasaRaw);

  if (!chosenImage) {
    // Pick first unused
    for (const d of Object.keys(nasaDocs)) {
      if (!usedImages.has(d)) {
        chosenImage = d;
        break;
      }
    }
    if (!chosenImage) {
      console.error("Erreur : Aucun visuel NASA disponible.");
      process.exit(1);
    }
    console.log(`Visuel NASA sélectionné automatiquement : ${chosenImage}`);
  } else {
    if (usedImages.has(chosenImage)) {
      console.error(`Erreur : Le visuel ${chosenImage} a déjà été utilisé pour une autre édition Focus !`);
      process.exit(1);
    }
    if (!nasaDocs[chosenImage]) {
      console.error(`Erreur : Le visuel ${chosenImage} n'existe pas dans data/journal-documents-v2-nasa.json`);
      process.exit(1);
    }
  }

  const doc = nasaDocs[chosenImage]!;
  const sourceWebp = resolve(staticDir, `media/journal-procrastinateur/collections/v2-nasa/${chosenImage}.webp`);
  const destDir = resolve(staticDir, "social/focus-archives");
  const destJpg = resolve(destDir, `${chosenImage}.jpg`);

  await mkdir(destDir, { recursive: true });
  if (!existsSync(destJpg)) {
    console.log(`Conversion de l'image d'archive ${chosenImage}.webp -> ${chosenImage}.jpg...`);
    await sharp(sourceWebp)
      .resize(1200, 800, { fit: "cover", position: "centre" })
      .grayscale()
      .normalize()
      .jpeg({ quality: 78, chromaSubsampling: "4:4:4", mozjpeg: true })
      .toFile(destJpg);
  }

  // Register in social-image.ts if needed
  const label = `${doc.title.toUpperCase().slice(0, 45)} · ${doc.creator.toUpperCase()}`;
  let tsContent = await readFile(socialImageTsPath, "utf-8");

  if (!tsContent.includes(`"${chosenImage}.jpg"`)) {
    const archiveEntry = `  {\n    file: "social/focus-archives/${chosenImage}.jpg",\n    label: "${label}",\n  },\n`;
    tsContent = tsContent.replace(
      /export const TECHNICAL_ARCHIVES = \[\n/,
      `export const TECHNICAL_ARCHIVES = [\n${archiveEntry}`
    );
  }

  if (!tsContent.includes(`"${editionKey}":`)) {
    const mappingEntry = `  "${editionKey}": "social/focus-archives/${chosenImage}.jpg",\n`;
    tsContent = tsContent.replace(
      /export const FOCUS_ARCHIVES_BY_DATE: Record<string, string> = \{\n/,
      `export const FOCUS_ARCHIVES_BY_DATE: Record<string, string> = {\n${mappingEntry}`
    );
    await writeFile(socialImageTsPath, tsContent, "utf-8");
    console.log(`Enregistrement du visuel dans admin-service/src/social-image.ts effectué.`);
  }

  // Scaffolding Markdown
  const frontMatter = [
    "---",
    `title: "${title}"`,
    `date: ${date}`,
    `digest_date: "${date}"`,
    `editorial_type: "focus"`,
    `images:`,
    `  - "/social/${editionKey}.png"`,
    `archive_image: "/social/focus-archives/${chosenImage}.jpg"`,
  ];
  if (urls.length > 0) {
    frontMatter.push("link_urls:");
    for (const u of urls) {
      frontMatter.push(`  - "${u}"`);
    }
  }
  frontMatter.push(`description: "${description}"`);
  frontMatter.push("---");
  frontMatter.push("");
  frontMatter.push("## Contexte");
  frontMatter.push("");
  frontMatter.push("Introduction du dossier...");
  frontMatter.push("");

  await writeFile(targetMd, frontMatter.join("\n"), "utf-8");
  console.log(`Billet Focus créé : content/archives/${editionKey}.md`);

  // Generate social images
  console.log(`Génération des visuels sociaux...`);
  const socialInput = {
    digestDate: editionKey,
    title,
    description,
    linkCount: urls.length,
    editorialType: "focus" as const,
  };
  const [socialImg, linkedInImg] = await Promise.all([
    generateOptimizedSocialImage(socialInput),
    generateOptimizedLinkedInImage(socialInput),
  ]);

  await writeFile(resolve(staticDir, `social/${editionKey}.png`), socialImg);
  await writeFile(resolve(staticDir, `social/${editionKey}-linkedin.png`), linkedInImg);
  console.log(`Visuels sociaux générés : static/social/${editionKey}.png et -linkedin.png`);

  console.log(`\n✅ Dossier Focus ${editionKey} initialisé avec succès et sans risque d'écrasement.`);
}

async function main() {
  const opts = parseArgs();
  if (opts["list-available"] || opts["list"]) {
    await listAvailableImages();
    return;
  }
  if (!opts.date && !opts.slug && !opts.title) {
    console.log(`
Usage :
  npm run focus:new -- --date YYYY-MM-DD --slug <slug> --title "<titre>" [options]

Options :
  --date <YYYY-MM-DD>       Date du Focus (obligatoire)
  --slug <slug>             Identifiant unique du Focus (obligatoire)
  --title "<titre>"         Titre du Focus (obligatoire)
  --description "<desc>"    Description SEO
  --image <YYYY-MM-DD>      Date du document NASA (choisi auto si omis)
  --urls "<url1,url2,...>"  URLs des ressources à documenter
  --list-available          Lister les visuels NASA disponibles (non utilisés)
    `);
    return;
  }
  await createFocus(opts);
}

main().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});

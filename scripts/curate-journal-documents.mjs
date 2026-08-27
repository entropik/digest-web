#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const contentDirectory = path.join(root, "content", "flux", "journal-procrastinateur");
const outputDirectory = path.join(root, "static", "media", "journal-procrastinateur", "documents");
const dataFile = path.join(root, "data", "journal-documents.json");
const cacheDirectory = path.join(os.tmpdir(), "digest-loc-free-to-use");
const metadataFile = path.join(cacheDirectory, "metadata.json");
const manifestFile = path.join(cacheDirectory, "manifest.json");
const refresh = process.argv.includes("--refresh");

const metadataUrl = "https://data.labs.loc.gov/free-to-use/metadata.json";
const manifestUrl = "https://data.labs.loc.gov/free-to-use/manifest.json";

const themes = [
  {
    id: "architecture",
    label: "Plans et structures",
    detect: ["architecture", "canvas", "cadre", "format", "gabarit", "geometr", "interface", "layout", "panneau", "scaffold", "shell", "template", "ui", "ux", "zone", "bloc"],
    sets: ["Architecture-And-Design", "Maps-Of-Cities", "Skyscrapers", "Bridges"],
    terms: ["architecture", "building", "design", "drawing", "plan", "structure", "work area", "bridge", "construction"],
  },
  {
    id: "image",
    label: "Images et optique",
    detect: ["photo", "image", "upload", "crop", "filtre", "pixel", "rotation", "clipart", "metadonn", "tirage"],
    sets: ["Flickrcommons", "Work-In-America", "Historical-Travel-Pictures", "Poster-Parade"],
    terms: ["camera", "film", "image", "laboratory", "lens", "photo", "photograph", "picture", "printing"],
  },
  {
    id: "print",
    label: "Imprimés et caractères",
    detect: ["pdf", "print", "zine", "typo", "police", "texte", "document", "export", "pagination", "imprim", "livrable", "blog", "docs"],
    sets: ["Art-Of-The-Book", "Books-Maps-More", "Libraries", "Poster-Parade", "Wpa-Posters"],
    terms: ["book", "document", "letter", "library", "manuscript", "poster", "press", "print", "reading", "type"],
  },
  {
    id: "commerce",
    label: "Commerce et circulation",
    detect: ["woo", "commerce", "prix", "pricing", "tarif", "panier", "commande", "boutique", "prestashop", "client", "tenant"],
    sets: ["Main-Streets", "Diners-Drive-Ins-Restaurants", "Advertising-Food", "Work-In-America", "Hotels-Motels-Inns"],
    terms: ["advertising", "business", "customer", "market", "restaurant", "shop", "store", "street", "trade", "worker"],
  },
  {
    id: "infrastructure",
    label: "Infrastructures",
    detect: ["deploy", "vps", "docker", "cloud", "r2", "ovh", "ghcr", "ssh", "wsl", "serveur", "prod", "route", "migration"],
    sets: ["Bridges", "Skyscrapers", "Aircraft", "Lighthouses", "Historical-Travel-Pictures"],
    terms: ["aircraft", "bridge", "communication", "construction", "highway", "lighthouse", "railroad", "road", "tower", "transportation"],
  },
  {
    id: "security",
    label: "Accès et protection",
    detect: ["auth", "rbac", "permission", "secu", "verrou", "risque", "acces", "durcir", "porte", "confiance", "sauver"],
    sets: ["Wpa-Posters", "Historic-Sites", "Lighthouses", "Natural-Disasters", "Work-In-America"],
    terms: ["careful", "danger", "door", "entrance", "fire", "guard", "keep", "protect", "safe", "warning"],
  },
  {
    id: "network",
    label: "Réseaux et liaisons",
    detect: ["partage", "pont", "connecteur", "wordpress", "relier", "sync", "distribu", "chaine", "flux", "r2", "route"],
    sets: ["Bridges", "Maps-Of-Cities", "Main-Streets", "Aircraft", "Discovery-And-Exploration"],
    terms: ["bridge", "city", "connection", "map", "network", "railroad", "route", "street", "telephone", "transportation"],
  },
  {
    id: "measurement",
    label: "Mesure et observation",
    detect: ["metri", "heure", "temps", "mesur", "performance", "charge", "observ", "audit", "minute", "600", "10h", "terrain"],
    sets: ["Work-In-America", "Aircraft", "Discovery-And-Exploration", "Maps-Of-Cities", "Teachers-And-Students"],
    terms: ["clock", "instrument", "laboratory", "measure", "observation", "scale", "survey", "test", "time", "work"],
  },
  {
    id: "memory",
    label: "Archives et mémoire",
    detect: ["archive", "memoire", "sauvegarde", "database", "donnee", "json", "snapshot", "provenance", "obsidian", "histor", "nettoyer"],
    sets: ["Libraries", "Genealogy", "Art-Of-The-Book", "Books-Maps-More", "Presidential-Papers"],
    terms: ["archive", "book", "catalog", "collection", "history", "library", "manuscript", "memory", "paper", "record"],
  },
  {
    id: "production",
    label: "Ateliers et production",
    detect: ["workflow", "pipeline", "bullmq", "forge", "production", "sprint", " ci ", "merge", "branche", "release", "atelier", "builder", "process"],
    sets: ["Work-In-America", "Farm-Life", "Kitchens-And-Baths", "Aircraft", "Wpa-Posters"],
    terms: ["assembly", "factory", "machine", "plant", "production", "shop", "tool", "worker", "working", "workshop"],
  },
  {
    id: "health",
    label: "Corps et repos",
    detect: ["off", "sante", "corps", "fatigue", "crise", "coronar", "stop", "dimanche", "peur"],
    sets: ["Nurses-And-Nursing", "Swimming-Beaches", "Games-For-Fun-And-Relaxation", "Older-People", "Holidays"],
    terms: ["health", "hospital", "nurse", "patient", "recreation", "relaxation", "rest", "swimming", "vacation"],
  },
  {
    id: "assistant",
    label: "Machines et agents",
    detect: ["assistant", "agent", "claude", "kimi", "contexte", "instruction", "autom", "codex"],
    sets: ["Work-In-America", "Discovery-And-Exploration", "Teachers-And-Students", "Aircraft", "Libraries"],
    terms: ["computer", "electronic", "laboratory", "machine", "office", "research", "science", "student", "technology"],
  },
  {
    id: "atelier",
    label: "Carnet d’atelier",
    detect: [],
    sets: ["Work-In-America", "Architecture-And-Design", "Main-Streets", "Libraries", "Wpa-Posters"],
    terms: ["craft", "making", "office", "shop", "tool", "work", "worker", "workshop"],
  },
];

const manualDocuments = {
  "2026-08-26": {
    itemId: "2026162814",
    image: "media/journal-procrastinateur/paperless-office-1980.webp",
    width: 702,
    height: 1024,
    alt: "Une employée de bureau saisit du texte sur un terminal informatique en 1980.",
    theme: "assistant",
    themeLabel: "Machines et agents",
    title: "Paperless office of the future",
    creator: "Thomas J. O’Halloran",
    date: "7 mai 1980",
    sourceUrl: "https://www.loc.gov/item/2026162814/",
    identifier: "LC-DIG-ppmsca-98243",
    rights: "Aucune restriction connue sur la publication.",
  },
};

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function textArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extractFrontMatter(file) {
  const source = fs.readFileSync(file, "utf8");
  const value = (name) => {
    const match = source.match(new RegExp(`^${name}:\\s*["']?(.+?)["']?\\s*$`, "m"));
    return match?.[1] ?? "";
  };
  return {
    date: path.basename(file, ".md"),
    title: value("title"),
    description: value("description"),
    source,
  };
}

function selectTheme(post) {
  const title = normalize(post.title);
  const description = normalize(post.description);
  const contains = (haystack, term) => {
    const normalizedTerm = normalize(term).trim();
    if (normalizedTerm.length > 3) return haystack.includes(normalizedTerm);
    return new RegExp(`(^|[^a-z0-9])${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(haystack);
  };
  let best = themes.at(-1);
  let score = 0;
  for (const theme of themes.slice(0, -1)) {
    const themeScore = theme.detect.reduce((total, term) => {
      return total + (contains(title, term) ? 4 : 0) + (contains(description, term) ? 1 : 0);
    }, 0);
    if (themeScore > score) {
      score = themeScore;
      best = theme;
    }
  }
  return best;
}

function stableJitter(value) {
  return Number.parseInt(crypto.createHash("sha256").update(value).digest("hex").slice(0, 8), 16) / 0xffffffff;
}

async function ensureDownload(url, destination) {
  if (!refresh && fs.existsSync(destination) && fs.statSync(destination).size > 1_000) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  const temporary = `${destination}.download`;
  fs.writeFileSync(temporary, Buffer.from(await response.arrayBuffer()));
  fs.renameSync(temporary, destination);
}

function itemKey(value) {
  return String(value ?? "").match(/item\/([^/]+)/)?.[1] ?? "";
}

function describeCreator(item) {
  const names = textArray(item.Creators).map((creator) => creator?.Name ?? creator).filter(Boolean);
  return names.slice(0, 2).join(" · ") || "Auteur non identifié";
}

function describeRights(item) {
  const rights = textArray(item.Rights).map((value) => String(value).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());
  if (rights.some((value) => /no known restrictions/i.test(value))) return "Aucune restriction connue sur la publication.";
  if (rights.some((value) => /public domain/i.test(value))) return "Document signalé dans le domaine public.";
  return "Sélection Free to Use and Reuse de la Library of Congress.";
}

function scoreCandidate(post, theme, candidate) {
  const item = candidate.item;
  const sets = textArray(item.Set);
  const title = normalize(item.Title);
  const haystack = normalize([
    item.Title,
    ...textArray(item.Description),
    ...textArray(item.Subjects),
    ...textArray(item.Subject_headings),
    ...textArray(item.Genre),
    ...sets,
  ].join(" "));
  let score = 0;
  score += sets.some((set) => theme.sets.includes(set)) ? 48 : -20;
  for (const term of theme.terms) {
    if (haystack.includes(term)) score += 7;
    if (title.includes(term)) score += 5;
  }
  if (textArray(item.Type_of_resource).includes("Still image")) score += 10;
  if (textArray(item.Original_format).some((value) => /photo|print|drawing/i.test(value))) score += 8;
  if (/portrait/i.test(haystack) && !/portrait|person|client|health|assistant/i.test(theme.id)) score -= 5;
  if (/map|cartographic/i.test(haystack) && !["network", "architecture", "memory"].includes(theme.id)) score -= 6;
  score += Math.min(candidate.size / 500_000, 5);
  score += stableJitter(`${post.date}:${candidate.itemId}`) * 18;
  return score;
}

async function main() {
  fs.mkdirSync(cacheDirectory, { recursive: true });
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  await ensureDownload(metadataUrl, metadataFile);
  await ensureDownload(manifestUrl, manifestFile);

  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const existingDocuments = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, "utf8")) : {};
  const manifestByItem = new Map(manifest.rows.map((row) => {
    const record = Object.fromEntries(manifest.cols.map((column, index) => [column, row[index]]));
    return [itemKey(record.item_id), record];
  }));
  const candidates = metadata.flatMap((item) => {
    const itemId = itemKey(item.Id || item.Url);
    const image = manifestByItem.get(itemId);
    if (!itemId || !image || image.size < 100_000) return [];
    if (!textArray(item.Type_of_resource).includes("Still image")) return [];
    return [{ itemId, item, image, size: image.size }];
  });

  const posts = fs.readdirSync(contentDirectory)
    .filter((name) => /^2026-\d\d-\d\d\.md$/.test(name))
    .sort()
    .map((name) => extractFrontMatter(path.join(contentDirectory, name)));
  if (posts.length !== 137) throw new Error(`137 billets attendus, ${posts.length} trouvés.`);

  const used = new Set(Object.values(manualDocuments).map((document) => document.itemId));
  const assignments = new Map();
  for (const post of posts) {
    if (manualDocuments[post.date]) continue;
    const theme = selectTheme(post);
    const ranked = candidates
      .filter((candidate) => !used.has(candidate.itemId))
      .map((candidate) => ({ candidate, score: scoreCandidate(post, theme, candidate) }))
      .sort((a, b) => b.score - a.score);
    if (!ranked.length) throw new Error(`Aucun document disponible pour ${post.date}.`);
    const selected = ranked[0].candidate;
    used.add(selected.itemId);
    assignments.set(post.date, { post, theme, selected });
  }

  let completed = 0;
  for (const [date, assignment] of assignments) {
    const { image } = assignment.selected;
    const original = path.join(cacheDirectory, image.filename);
    const destination = path.join(outputDirectory, `${date}.webp`);
    await ensureDownload(`https://${image.object_key}`, original);
    if (refresh || !fs.existsSync(destination) || existingDocuments[date]?.itemId !== assignment.selected.itemId) {
      execFileSync("magick", [original, "-auto-orient", "-strip", "-resize", "1800x1800>", "-quality", "80", destination]);
    }
    completed += 1;
    if (completed % 20 === 0 || completed === assignments.size) {
      console.log(`Images optimisées : ${completed}/${assignments.size}`);
    }
  }

  const documents = {};
  posts.forEach((post, index) => {
    const manual = manualDocuments[post.date];
    if (manual) {
      documents[post.date] = { number: index + 1, ...manual };
      return;
    }
    const { theme, selected } = assignments.get(post.date);
    const item = selected.item;
    const destination = path.join(outputDirectory, `${post.date}.webp`);
    const dimensions = execFileSync("magick", ["identify", "-format", "%w %h", destination], { encoding: "utf8" }).trim().split(" ").map(Number);
    documents[post.date] = {
      number: index + 1,
      itemId: selected.itemId,
      image: `media/journal-procrastinateur/documents/${post.date}.webp`,
      width: dimensions[0],
      height: dimensions[1],
      alt: `Document historique de la Library of Congress : ${item.Title}`,
      theme: theme.id,
      themeLabel: theme.label,
      title: item.Title,
      creator: describeCreator(item),
      date: item.Date_text || item.Date || "Date non renseignée",
      sourceUrl: String(item.Url || item.Id).replace(/^http:/, "https:"),
      identifier: item.Call_number || item.Lccn || selected.itemId,
      rights: describeRights(item),
    };
  });

  fs.writeFileSync(dataFile, `${JSON.stringify(documents, null, 2)}\n`);
  const totalBytes = fs.readdirSync(outputDirectory).reduce((total, name) => total + fs.statSync(path.join(outputDirectory, name)).size, 0);
  console.log(`Catalogue écrit : ${path.relative(root, dataFile)}`);
  console.log(`Documents uniques : ${new Set(Object.values(documents).map((document) => document.itemId)).size}/${posts.length}`);
  console.log(`Poids WebP généré : ${(totalBytes / 1024 / 1024).toFixed(1)} Mio`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

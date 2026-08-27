#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const contentDirectory = path.join(root, "content", "flux", "journal-procrastinateur");
const candidateFile = path.join(root, "data", "journal-visuals-v2.json");
const dataFile = path.join(root, "data", "journal-documents.json");
const archiveFile = path.join(root, "data", "journal-documents-v2-nasa.json");
const outputDirectory = path.join(root, "static", "media", "journal-procrastinateur", "collections", "v2-nasa");
const cacheDirectory = path.join(os.tmpdir(), "digest-journal-nasa-v2");
const refresh = process.argv.includes("--refresh");

const categorySignals = {
  computing: ["agent", "assistant", "autom", "builder", "claude", "codex", "code", "computer", "contexte", "éditeur", "frontend", "logiciel", "script", "test", "typescript", "ui"],
  control: ["audit", "contrat", "contrôle", "donnée", "état", "mesure", "métrique", "observ", "permission", "pipeline", "preuve", "qualité", "sécurité", "validation", "vérif"],
  communications: ["api", "cloud", "connect", "déploi", "flux", "github", "internet", "network", "partage", "réseau", "route", "saas", "serveur", "sync", "web", "wordpress"],
  electronics: ["appareil", "asset", "capture", "couleur", "écran", "fichier", "image", "instrument", "optique", "pdf", "photo", "pixel", "print", "scanner", "upload"],
  robotics: ["agent", "autom", "commande", "forge", "machine", "outil", "process", "production", "robot", "worker", "workflow"],
  laboratories: ["analyse", "essai", "expérience", "laboratoire", "prototype", "recette", "recherche", "simulation", "test", "validation"],
  "space-systems": ["architecture", "assembl", "chaîne", "compos", "infrastructure", "migration", "module", "système", "structure", "tenant"],
};

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function stableJitter(value) {
  return Number.parseInt(crypto.createHash("sha256").update(value).digest("hex").slice(0, 8), 16) / 0xffffffff;
}

function extractPost(file) {
  const source = fs.readFileSync(file, "utf8");
  const value = (name) => source.match(new RegExp(`^${name}:\\s*["']?(.+?)["']?\\s*$`, "m"))?.[1] ?? "";
  return {
    date: path.basename(file, ".md"),
    title: value("title"),
    description: value("description"),
    text: normalize(source.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]+`/g, " ")),
  };
}

function categoryScore(post, category) {
  const signals = categorySignals[category] ?? [];
  const heading = normalize(`${post.title} ${post.description}`);
  return signals.reduce((score, signal) => {
    const term = normalize(signal);
    return score + (heading.includes(term) ? 16 : 0) + (post.text.includes(term) ? 3 : 0);
  }, 0);
}

function lexicalScore(post, item) {
  const candidate = normalize(`${item.title} ${item.description} ${(item.keywords ?? []).join(" ")}`);
  const meaningful = new Set(post.text.match(/[a-z0-9]{5,}/g) ?? []);
  let score = 0;
  for (const token of new Set(candidate.match(/[a-z0-9]{5,}/g) ?? [])) {
    if (meaningful.has(token)) score += 2;
  }
  return Math.min(score, 16);
}

// Maximum-weight one-to-one assignment (Hungarian algorithm, minimization form).
function assign(posts, items) {
  const scores = posts.map((post) => items.map((item) =>
    categoryScore(post, item.category) + lexicalScore(post, item) + stableJitter(`${post.date}:${item.id}`) * 12
  ));
  const maximum = Math.max(...scores.flat());
  const n = posts.length;
  const u = Array(n + 1).fill(0);
  const v = Array(n + 1).fill(0);
  const p = Array(n + 1).fill(0);
  const way = Array(n + 1).fill(0);
  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = Array(n + 1).fill(Infinity);
    const used = Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j += 1) {
        if (used[j]) continue;
        const current = maximum - scores[i0 - 1][j - 1] - u[i0] - v[j];
        if (current < minv[j]) {
          minv[j] = current;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j += 1) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const result = Array(n);
  for (let j = 1; j <= n; j += 1) result[p[j] - 1] = items[j - 1];
  return result;
}

async function download(url, destination) {
  if (!refresh && fs.existsSync(destination) && fs.statSync(destination).size > 1_000) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

function dimensions(file) {
  const value = execFileSync("magick", ["identify", "-format", "%w %h", file], { encoding: "utf8" }).trim();
  const [width, height] = value.split(/\s+/).map(Number);
  return { width, height };
}

function frenchDate(item) {
  if (!item.date) return item.year ? String(item.year) : "Date non précisée";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(item.date));
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(candidateFile, "utf8"));
  const posts = fs.readdirSync(contentDirectory)
    .filter((name) => /^2026-\d\d-\d\d\.md$/.test(name))
    .sort()
    .map((name) => extractPost(path.join(contentDirectory, name)));
  if (posts.length !== catalog.items.length) throw new Error(`${posts.length} billets pour ${catalog.items.length} visuels.`);
  if (new Set(catalog.items.map((item) => item.id)).size !== catalog.items.length) throw new Error("Le catalogue NASA contient des doublons.");

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.mkdirSync(cacheDirectory, { recursive: true });
  const assignments = assign(posts, catalog.items);
  const documents = {};

  for (let index = 0; index < posts.length; index += 1) {
    const post = posts[index];
    const item = assignments[index];
    const extension = new URL(item.image).pathname.match(/\.(jpe?g|png|tiff?)$/i)?.[1] ?? "jpg";
    const source = path.join(cacheDirectory, `${item.id}.${extension}`);
    const output = path.join(outputDirectory, `${post.date}.webp`);
    await download(item.image, source);
    execFileSync("magick", [source, "-auto-orient", "-strip", "-resize", "1800x1800>", "-quality", "80", output]);
    const size = dimensions(output);
    documents[post.date] = {
      number: index + 1,
      itemId: item.id,
      image: `media/journal-procrastinateur/collections/v2-nasa/${post.date}.webp`,
      ...size,
      alt: `Document NASA : ${item.title}`,
      theme: item.category,
      themeLabel: item.categoryLabel,
      title: item.title,
      creator: item.photographer || item.center || "NASA",
      date: frenchDate(item),
      sourceUrl: item.sourceUrl,
      sourceLabel: "NASA Image and Video Library",
      identifier: item.id,
      rights: "NASA · usage éditorial et informatif selon les règles média de l’agence.",
    };
    process.stdout.write(`[${String(index + 1).padStart(3, "0")}/${posts.length}] ${post.date} ← ${item.id}\n`);
  }

  const serialized = `${JSON.stringify(documents, null, 2)}\n`;
  fs.writeFileSync(dataFile, serialized);
  fs.writeFileSync(archiveFile, serialized);
  console.log(`Collection NASA installée : ${posts.length} visuels uniques.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

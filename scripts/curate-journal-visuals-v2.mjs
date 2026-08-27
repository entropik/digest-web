#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "data", "journal-visuals-v2.json");
const apiRoot = "https://images-api.nasa.gov/search";

const categories = [
  {
    id: "computing",
    label: "Ordinateurs & calcul",
    shortLabel: "Calcul",
    quota: 28,
    queries: ["IBM computer", "computer room", "data processing computer", "digital computer", "guidance computer", "computing system", "computer operator", "computer hardware NASA"],
    terms: ["computer", "computing", "data processing", "ibm", "mainframe", "programmer", "operator", "digital", "guidance"],
  },
  {
    id: "control",
    label: "Contrôle & données",
    shortLabel: "Contrôle",
    quota: 24,
    queries: ["mission control room", "flight control room", "telemetry system", "data recording room", "control console", "tracking station", "flight director console"],
    terms: ["control room", "mission control", "console", "telemetry", "data", "recording", "tracking", "display"],
  },
  {
    id: "communications",
    label: "Télécommunications",
    shortLabel: "Télécom",
    quota: 20,
    queries: ["communications satellite", "radio antenna", "deep space antenna", "radar equipment", "communications system", "tracking antenna"],
    terms: ["antenna", "communication", "radio", "radar", "signal", "satellite", "tracking", "transmitter", "receiver"],
  },
  {
    id: "electronics",
    label: "Électronique & instruments",
    shortLabel: "Électronique",
    quota: 18,
    queries: ["electronics circuit", "integrated circuit", "silicon chip", "electronic equipment", "instrumentation", "sensor technology", "circuit board", "microelectronics", "computer hardware", "instrument panel", "avionics"],
    terms: ["circuit", "chip", "electronic", "instrument", "sensor", "silicon", "semiconductor", "equipment", "processor", "hardware", "avionics", "panel"],
  },
  {
    id: "robotics",
    label: "Robotique",
    shortLabel: "Robotique",
    quota: 16,
    queries: ["robotic arm engineering", "space robot laboratory", "Mars rover engineering", "robot technology", "autonomous robot", "rover testing"],
    terms: ["robot", "robotic", "rover", "autonomous", "arm", "automation", "mobility", "test"],
  },
  {
    id: "laboratories",
    label: "Laboratoires & simulation",
    shortLabel: "Laboratoire",
    quota: 16,
    queries: ["research laboratory scientist", "wind tunnel instrumentation", "simulation laboratory", "laboratory equipment", "scientist at work laboratory", "vacuum chamber testing", "wind tunnel control room", "clean room technicians"],
    terms: ["laboratory", "scientist", "research", "wind tunnel", "simulation", "experiment", "clean room", "instrument", "vacuum", "test"],
  },
  {
    id: "space-systems",
    label: "Systèmes spatiaux",
    shortLabel: "Systèmes",
    quota: 15,
    queries: ["spacecraft assembly", "satellite assembly clean room", "space telescope engineering", "spacecraft systems test", "satellite engineering", "spacecraft integration"],
    terms: ["assembly", "spacecraft", "satellite", "systems", "integration", "engineering", "telescope", "test"],
  },
];

const negativeTerms = [
  "anniversary", "award", "building exterior", "ceremony", "conference", "crew portrait", "education event",
  "first robotics competition", "groundbreaking", "group photo", "guard house", "interview", "logo", "meeting", "memorial",
  "outreach", "plaque", "presentation", "press conference", "signing", "student", "team photo", "workshop",
];

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stableJitter(value) {
  return Number.parseInt(crypto.createHash("sha256").update(value).digest("hex").slice(0, 8), 16) / 0xffffffff;
}

function yearOf(value) {
  const year = String(value ?? "").match(/\b(19|20)\d{2}\b/)?.[0];
  return year ? Number(year) : null;
}

async function search(query) {
  const url = new URL(apiRoot);
  url.searchParams.set("q", query);
  url.searchParams.set("media_type", "image");
  url.searchParams.set("page_size", "100");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  const payload = await response.json();
  return payload.collection?.items ?? [];
}

function candidateFrom(item, category, queryIndex) {
  const data = item.data?.[0];
  const links = item.links ?? [];
  const image = links.find((link) => link.render === "image" && /~medium\./.test(link.href))
    ?? links.find((link) => link.render === "image" && /~small\./.test(link.href))
    ?? links.find((link) => link.render === "image");
  const thumbnail = links.find((link) => link.render === "image" && /~thumb\./.test(link.href)) ?? image;
  if (!data?.nasa_id || !data.title || !image?.href || !thumbnail?.href) return null;
  const title = normalize(data.title);
  if (title === normalize(data.nasa_id)) return null;
  if (data.title.length > 220) return null;
  const description = normalize(`${data.description ?? ""} ${data.description_508 ?? ""}`);
  const keywords = normalize((data.keywords ?? []).join(" "));
  const complete = `${title} ${description} ${keywords}`;
  if (/copyright|courtesy of|artist.s concept|artist concept|illustration/.test(complete)) return null;
  if (category.id === "laboratories" && /groundbreaking|guard house|main gate|steam plant|tarmac|tour of/.test(title)) return null;
  if (category.id === "robotics" && /competition|student|workshop/.test(title)) return null;
  if (category.id === "space-systems" && /plaque/.test(title)) return null;

  const titleHits = category.terms.filter((term) => title.includes(normalize(term))).length;
  if (!titleHits) return null;

  let score = 70 - queryIndex * 2;
  for (const term of category.terms) {
    const normalizedTerm = normalize(term);
    if (title.includes(normalizedTerm)) score += 16;
    if (keywords.includes(normalizedTerm)) score += 7;
    if (description.includes(normalizedTerm)) score += 3;
  }
  score += titleHits * 12;
  for (const term of negativeTerms) {
    if (complete.includes(term)) score -= 45;
  }
  const year = yearOf(data.date_created);
  if (year && year < 1990) score += 13;
  else if (year && year < 2010) score += 5;
  if (image.width >= 1000 || image.height >= 1000) score += 4;
  score += stableJitter(`${category.id}:${data.nasa_id}`) * 12;

  return {
    id: data.nasa_id,
    category: category.id,
    categoryLabel: category.label,
    shortLabel: category.shortLabel,
    title: data.title.trim(),
    description: String(data.description ?? data.description_508 ?? "").replace(/\s+/g, " ").trim(),
    year,
    date: data.date_created ?? "",
    center: data.center ?? data.location ?? "NASA",
    photographer: data.photographer ?? "NASA",
    keywords: data.keywords ?? [],
    thumbnail: thumbnail.href,
    image: image.href,
    width: image.width ?? null,
    height: image.height ?? null,
    sourceUrl: `https://images.nasa.gov/details/${encodeURIComponent(data.nasa_id)}`,
    score,
  };
}

async function main() {
  const selected = [];
  const usedIds = new Set();
  const usedTitles = new Set();

  for (const category of categories) {
    const pool = new Map();
    const familyCounts = new Map();
    for (const [queryIndex, query] of category.queries.entries()) {
      process.stdout.write(`NASA · ${category.shortLabel} · ${query}\n`);
      const items = await search(query);
      for (const item of items) {
        const candidate = candidateFrom(item, category, queryIndex);
        if (!candidate) continue;
        const existing = pool.get(candidate.id);
        if (!existing || candidate.score > existing.score) pool.set(candidate.id, candidate);
      }
    }

    const ranked = [...pool.values()].sort((a, b) => b.score - a.score);
    let count = 0;
    for (const candidate of ranked) {
      const titleKey = normalize(candidate.title);
      const familyKey = titleKey
        .split(" ")
        .filter((word) => !["a", "an", "and", "at", "for", "in", "of", "on", "the", "to", "view", "with"].includes(word))
        .slice(0, 4)
        .join(" ");
      if (usedIds.has(candidate.id) || usedTitles.has(titleKey)) continue;
      if ((familyCounts.get(familyKey) ?? 0) >= 4) continue;
      usedIds.add(candidate.id);
      usedTitles.add(titleKey);
      familyCounts.set(familyKey, (familyCounts.get(familyKey) ?? 0) + 1);
      selected.push(candidate);
      count += 1;
      if (count === category.quota) break;
    }
    if (count !== category.quota) {
      throw new Error(`${category.label}: ${count}/${category.quota} visuels retenus.`);
    }
  }

  selected.forEach((candidate, index) => {
    candidate.number = index + 1;
    delete candidate.score;
  });
  const catalog = {
    version: 2,
    status: "candidate",
    generatedAt: new Date().toISOString(),
    source: {
      name: "NASA Image and Video Library",
      api: "https://images-api.nasa.gov",
      usage: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
    },
    count: selected.length,
    categories: categories.map(({ id, label, shortLabel, quota }) => ({ id, label, shortLabel, quota })),
    items: selected,
  };
  fs.writeFileSync(output, `${JSON.stringify(catalog, null, 2)}\n`);
  process.stdout.write(`Catalogue candidat écrit : ${path.relative(root, output)} (${selected.length} visuels)\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

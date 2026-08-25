import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const COLLECTION_ID = "faf4f60e-78e0-4fbf-96ce-4ca8b4df597a";
const API_ROOT = "https://api.dc.library.northwestern.edu/api/v2";
const COLLECTION_URL = `${API_ROOT}/collections/${COLLECTION_ID}?as=iiif`;
const COLLECTION_PAGE =
  "https://dc.library.northwestern.edu/search?collection=World+War+II+Poster+Collection";
const ATTRIBUTION = "Courtesy of Northwestern University Libraries";
const USER_AGENT = "OOBLIK-Digest/1.21.1 (+https://digest.ooblik.com/)";
const DEFAULT_LIMIT = 100;
const IMAGE_WIDTH = 1200;
const CONCURRENCY = 8;

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(repositoryRoot, "static", "images", "journal", "posters");
const catalogPath = path.join(repositoryRoot, "data", "journal_posters.json");

const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
const limit = limitArgument ? Number.parseInt(limitArgument.split("=")[1], 10) : DEFAULT_LIMIT;
const refresh = process.argv.includes("--refresh");

if (!Number.isInteger(limit) || limit < 1 || limit > 336) {
  throw new Error("--limit doit être un entier compris entre 1 et 336.");
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} pour ${url}`);
  }
  return response.json();
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

function valuesFor(manifest, label) {
  const entry = manifest.metadata?.find((candidate) => candidate.label?.none?.[0] === label);
  return entry?.value?.none ?? [];
}

function firstText(value, fallback = "") {
  return value?.none?.[0] ?? fallback;
}

function workIdFromManifest(manifest) {
  return new URL(manifest.id).pathname.split("/").at(-1);
}

function posterFromManifest(manifest, index) {
  const workId = workIdFromManifest(manifest);
  const canvas = manifest.items?.[0];
  const imageBody = canvas?.items?.[0]?.items?.[0]?.body;
  const imageService = imageBody?.service?.[0]?.id;
  if (!workId || !imageService) {
    throw new Error(`Manifest IIIF incomplet : ${manifest.id}`);
  }

  const filename = `${String(index + 1).padStart(3, "0")}-${workId}.webp`;
  return {
    index: index + 1,
    work_id: workId,
    title: firstText(manifest.label, "Affiche sans titre"),
    description: firstText(manifest.summary),
    date: valuesFor(manifest, "Date").join("; "),
    rights_label: valuesFor(manifest, "Rights Statement").join("; "),
    rights_url: manifest.rights,
    attribution: ATTRIBUTION,
    source_url: manifest.homepage?.[0]?.id ?? `https://dc.library.northwestern.edu/items/${workId}`,
    manifest_url: manifest.id,
    image_service: imageService,
    image: `/images/journal/posters/${filename}`,
    filename,
    width: canvas.width,
    height: canvas.height,
  };
}

async function collectionManifests() {
  const manifests = [];
  for (let page = 1; ; page += 1) {
    const url = page === 1 ? COLLECTION_URL : `${COLLECTION_URL}&page=${page}`;
    const collection = await fetchJson(url);
    const pageManifests = (collection.items ?? []).filter((item) => item.type === "Manifest");
    if (pageManifests.length === 0) break;
    manifests.push(...pageManifests);
    const hasNext = (collection.items ?? []).some(
      (item) => item.type === "Collection" && firstText(item.label) === "Next page",
    );
    if (!hasNext) break;
  }
  return manifests;
}

async function downloadPoster(poster) {
  const destination = path.join(outputDirectory, poster.filename);
  if (!refresh) {
    try {
      const existing = await readFile(destination);
      if (existing.length > 0) return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  const imageUrl = `${poster.image_service}/full/${IMAGE_WIDTH},/0/default.webp`;
  const response = await fetch(imageUrl, {
    headers: { Accept: "image/webp", "User-Agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} pour ${imageUrl}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) throw new Error(`Réponse non image pour ${imageUrl}`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

await mkdir(outputDirectory, { recursive: true });

const collectionItems = await collectionManifests();
process.stdout.write(`Catalogue IIIF : ${collectionItems.length} œuvres.\n`);

const manifests = await mapWithConcurrency(collectionItems, CONCURRENCY, (item) => fetchJson(item.id));
const eligible = manifests.filter((manifest) => {
  const date = valuesFor(manifest, "Date").join(" ");
  const subjects = valuesFor(manifest, "Subject");
  const rights = valuesFor(manifest, "Rights Statement").join(" ");
  return /\b(?:194\d|195\d)\b/.test(date)
    && subjects.includes("War posters, American")
    && rights.includes("No Copyright");
});

if (eligible.length < limit) {
  throw new Error(`${eligible.length} affiches admissibles seulement pour une cible de ${limit}.`);
}

const posters = eligible.slice(0, limit).map(posterFromManifest);
await mapWithConcurrency(posters, 4, downloadPoster);

const catalog = {
  source: COLLECTION_PAGE,
  collection_manifest: COLLECTION_URL,
  collection: "World War II Poster Collection",
  institution: "Northwestern University Libraries",
  attribution: ATTRIBUTION,
  selection: "Affiches datées de 1940 à 1959, sujet War posters, American, statut No Copyright - United States.",
  count: posters.length,
  generated_at: new Date().toISOString(),
  posters,
};

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
const totalBytes = (
  await Promise.all(posters.map((poster) => readFile(path.join(outputDirectory, poster.filename))))
).reduce((sum, image) => sum + image.length, 0);
process.stdout.write(
  `${posters.length} affiches enregistrées (${(totalBytes / 1024 / 1024).toFixed(1)} Mio) avec métadonnées et attribution.\n`,
);

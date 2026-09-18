// Indexation Pagefind du catalogue du Digest, exécutée après le build Hugo.
//
// Source de vérité : les index digest-index-* générés par layouts/index.html
// (même ordre, même visibilité, mêmes traductions que le catalogue client).
// Émet <site>/pagefind/ (index binaire + bibliothèque) et une table
// link-map.<lang>.json qui relie chaque fragment Pagefind à la position du
// lien dans le catalogue fusionné (base puis supplémentaire, dédoublonné par
// identifiant) — le même fusionnement que assets/js/digest.js (loadLinks).
import { readFile, readdir, rm, writeFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import path from "node:path";
import * as pagefind from "pagefind";

const args = process.argv.slice(2);
const currentSite = () => {
  const siteArg = process.argv.indexOf("--site");
  return path.resolve(siteArg >= 0 ? process.argv[siteArg + 1] : "public");
};

const SIGNATURE = "pagefind_dcd";

const readIndex = async (dir, kind) => {
  const entries = await readdir(dir).catch(() => null);
  if (!entries) return null;
  const match = entries.find((name) => name.startsWith(`digest-index-${kind}.`) && name.endsWith(".json"));
  if (!match) return null;
  return JSON.parse(await readFile(path.join(dir, match), "utf8"));
};

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// Catalogue fusionné : base puis supplémentaire, dédoublonné par identifiant
// (première occurrence conservée) — miroir exact de loadLinks côté client.
const mergedCatalog = async (dir) => {
  const base = (await readIndex(dir, "base")) ?? [];
  const supplemental = (await readIndex(dir, "supplemental")) ?? [];
  const descriptions = new Map(
    ((await readIndex(dir, "descriptions")) ?? []).map((entry) => [entry.i, entry.d || ""]),
  );
  const seen = new Set();
  const merged = [];
  for (const entry of [...base, ...supplemental]) {
    if (!entry?.i || seen.has(entry.i)) continue;
    seen.add(entry.i);
    merged.push({
      id: entry.i,
      title: entry.t || "",
      url: entry.u || "",
      category: entry.c || "",
      description: entry.d || descriptions.get(entry.i) || "",
      status: entry.s || "",
      status_note: entry.n || "",
      tags: entry.g || [],
    });
  }
  return merged;
};

const recordFor = (entry, language) => ({
  url: (language === "en" ? "/en/" : "/") + `?l=${encodeURIComponent(entry.id)}`,
  content: [
    entry.title,
    entry.category,
    entry.url,
    hostOf(entry.url),
    entry.description,
    entry.status,
    entry.status_note,
    ...entry.tags,
  ]
    .filter(Boolean)
    .join(" "),
  language,
});

const decodeFragment = (buffer) => {
  let data = buffer;
  if (data.subarray(0, SIGNATURE.length).toString("latin1") !== SIGNATURE) {
    data = gunzipSync(data);
  }
  if (data.subarray(0, SIGNATURE.length).toString("latin1") !== SIGNATURE) {
    throw new Error("Signature pagefind absente d'un fragment");
  }
  return JSON.parse(data.subarray(SIGNATURE.length).toString("utf8"));
};

const indexSite = async () => {
  const site = currentSite();
  const languages = [
    { code: "fr", dir: path.join(site, "data") },
    { code: "en", dir: path.join(site, "en", "data") },
  ];
  const catalogs = {};
  const records = [];
  for (const { code, dir } of languages) {
    const catalog = await mergedCatalog(dir);
    if (!catalog.length) continue;
    catalogs[code] = catalog;
    for (const entry of catalog) records.push(recordFor(entry, code));
  }
  if (!Object.keys(catalogs).length) throw new Error("Aucun index digest-index-base trouvé");

  const output = path.join(site, "pagefind");
  await rm(output, { recursive: true, force: true });
  const { index } = await pagefind.createIndex();
  if (!index) throw new Error("Échec de création de l'index Pagefind");
  for (const record of records) await index.addCustomRecord(record);
  await index.writeFiles({ outputPath: output });

  // Table fragment → position, par langue, depuis les fragments décodés.
  const summary = {};
  for (const { code } of languages) {
    const catalog = catalogs[code];
    if (!catalog) continue;
    const positionByUrl = new Map(catalog.map((entry, position) => [recordFor(entry, code).url, position]));
    const map = {};
    const fragments = await readdir(path.join(output, "fragment"));
    for (const name of fragments) {
      if (!name.endsWith(".pf_fragment")) continue;
      const fragment = decodeFragment(await readFile(path.join(output, "fragment", name)));
      const position = positionByUrl.get(fragment.url);
      if (position === undefined) continue;
      map[name.slice(0, -".pf_fragment".length)] = position;
    }
    if (Object.keys(map).length !== catalog.length) {
      throw new Error(
        `Table ${code} incomplète : ${Object.keys(map).length}/${catalog.length} fragments reconnus`,
      );
    }
    const serialized = JSON.stringify(map);
    await writeFile(path.join(output, `link-map.${code}.json`), serialized);
    summary[code] = {
      liens: catalog.length,
      fragments: Object.keys(map).length,
      table: `${Math.ceil(serialized.length / 1024)} Kio brut · ${Math.ceil(gzipSync(serialized).length / 1024)} Kio gzip`,
    };
  }
  process.stdout.write(`Index Pagefind : ${JSON.stringify(summary)}\n`);
};

const selfTest = async () => {
  const fixture = path.resolve("scripts/fixtures/pagefind-site");
  const target = path.resolve("scripts/fixtures/pagefind-site-built");
  await rm(target, { recursive: true, force: true });
  await cp(fixture, target, { recursive: true });
  process.argv = [process.argv[0], "build-pagefind-index.mjs", "--site", target];
  await indexSite();

  const { test } = await import("node:test");
  const assert = (await import("node:assert")).strict;
  await test("la table fr relie chaque fragment à la position du catalogue fusionné", async () => {
    const base = JSON.parse(await readFile(path.join(target, "data", "digest-index-base.test.json"), "utf8"));
    const supplemental = JSON.parse(
      await readFile(path.join(target, "data", "digest-index-supplemental.test.json"), "utf8"),
    );
    const map = JSON.parse(await readFile(path.join(target, "pagefind", "link-map.fr.json"), "utf8"));
    assert.equal(Object.keys(map).length, base.length + supplemental.length - 1); // un doublon de base dans le supplémentaire
    assert.ok(Object.values(map).every((position) => Number.isInteger(position) && position >= 0));
  });
  await test("la bibliothèque cliente et l'index sont émis", async () => {
    assert.ok(existsSync(path.join(target, "pagefind", "pagefind.js")));
    const fragments = (await readdir(path.join(target, "pagefind", "fragment"))).filter((name) =>
      name.endsWith(".pf_fragment"),
    );
    assert.equal(fragments.length, 5); // 4 fiches fr + 1 fiche en
  });
  await rm(target, { recursive: true, force: true });
};

if (args.includes("--test")) {
  await selfTest();
} else {
  await indexSite();
}

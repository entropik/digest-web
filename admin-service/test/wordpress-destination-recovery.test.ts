import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { DigestLink } from "../src/catalog.js";
import {
  acceptHighConfidenceWordpressDestinations,
  buildWordpressDestinationSearchReport,
  buildWordpressDestinationTargets,
  rankWordpressDestinationCandidates,
  renderWordpressDestinationSearchHtml,
  wordpressDestinationSearchQuery,
} from "../src/wordpress-destination-recovery.js";

const fixturePath = fileURLToPath(
  new URL("fixtures/wordpress-export.xml", import.meta.url),
);

test("destination recovery targets only self-archived WordPress posts", async () => {
  const xml = await readFile(fixturePath, "utf8");
  const currentLinks: DigestLink[] = [
    {
      id: "self",
      title: "Sans source",
      url: "https://blog.ooblik.com/2023/sans-source",
      origin_url: "https://blog.ooblik.com/2023/sans-source/",
      category: "Archives du blog OOBLIK",
      added: "2023-01-01",
      stream: "blog-ooblik",
    },
    {
      id: "external",
      title: "Projet normal",
      url: "https://normal.example/project",
      origin_url: "https://blog.ooblik.com/2025/normal/",
      category: "Photographie",
      added: "2025-02-27",
      stream: "blog-ooblik",
    },
  ];
  const targets = buildWordpressDestinationTargets({ xml, currentLinks });
  assert.deepEqual(targets.map((target) => target.wordpress_id), ["103"]);
  assert.match(wordpressDestinationSearchQuery(targets[0]!.title), /-site:blog\.ooblik\.com/);
});

test("destination candidates reject OOBLIK and unsafe results then rank matches", () => {
  const target = {
    wordpress_id: "154820",
    title: "Indonésie, huile de palme et déforestation | Marion Parent Photographe",
    origin_url: "https://blog.ooblik.com/2016/exemple/",
    added: "2016-03-22",
    description: "Photographier, c'est témoigner.",
    tags: ["Photographes"],
  };
  const candidates = rankWordpressDestinationCandidates({
    target,
    currentLinks: [],
    results: [
      {
        title: target.title,
        url: target.origin_url,
        description: "Ancien billet",
      },
      {
        title: "Déforestation & Huile de palme en Indonésie — Marion Parent",
        url: "https://www.divergence-images.com/marion-parent/portfolios/huile-de-palme.html?utm_source=test",
        description: "Portfolio de la photographe Marion Parent.",
      },
      {
        title: "Privé",
        url: "http://127.0.0.1/admin",
        description: "",
      },
    ],
  });
  assert.equal(candidates.length, 1);
  assert.equal(
    candidates[0]?.url,
    "https://www.divergence-images.com/marion-parent/portfolios/huile-de-palme.html",
  );
  assert.ok((candidates[0]?.score ?? 0) >= 48);
});

test("destination recovery report and HTML remain review-only", () => {
  const item = {
    wordpress_id: "42",
    title: "Atlas typographique expérimental",
    origin_url: "https://blog.ooblik.com/2020/projet/",
    added: "2020-01-01",
    description: "Description",
    tags: ["Photo"],
    query: "Projet -site:blog.ooblik.com -site:ooblik.com",
    searched_at: "2026-08-20T00:00:00.000Z",
    candidates: [
      {
        title: "Atlas typographique expérimental officiel",
        url: "https://example.com/projet",
        description: "Description",
        host: "example.com",
        score: 85,
        confidence: "haute" as const,
      },
    ],
  };
  const report = buildWordpressDestinationSearchReport({
    targets: [item],
    cache: { "42": item },
  });
  assert.equal(report.high_confidence, 1);
  const html = renderWordpressDestinationSearchHtml(report, {
    "42": { source_url: item.origin_url },
  });
  assert.match(html, /Destinations retrouvées/);
  assert.match(html, /Aucun résultat n’est publié automatiquement/);
  assert.match(html, /Exporter overrides\.json/);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.doesNotThrow(() => new Function(scripts.at(-1)?.[1] ?? ""));
});

test("automatic acceptance keeps only high confidence non-duplicates", () => {
  const target = (id: string) => ({
    wordpress_id: id,
    title: `Atlas typographique expérimental ${id}`,
    origin_url: `https://blog.ooblik.com/2020/${id}/`,
    added: "2020-01-01",
    description: "Description",
    tags: [],
    query: `Projet ${id}`,
    searched_at: "2026-08-20T00:00:00.000Z",
  });
  const report = buildWordpressDestinationSearchReport({
    targets: [target("1"), target("2"), target("3")],
    cache: {
      "1": {
        ...target("1"),
        candidates: [{ title: "Atlas typographique expérimental", url: "https://one.example/", description: "", host: "one.example", score: 90, confidence: "haute" }],
      },
      "2": {
        ...target("2"),
        candidates: [{ title: "Atlas typographique expérimental", url: "https://two.example/", description: "", host: "two.example", score: 60, confidence: "moyenne" }],
      },
      "3": {
        ...target("3"),
        candidates: [{ title: "Atlas typographique expérimental", url: "https://three.example/", description: "", host: "three.example", score: 90, confidence: "haute", existing_link_id: "existing" }],
      },
    },
  });
  const accepted = acceptHighConfidenceWordpressDestinations(report, {
    "1": { source_url: "https://blog.ooblik.com/2020/1/" },
    "2": { source_url: "https://blog.ooblik.com/2020/2/" },
  });
  assert.equal(accepted.accepted, 1);
  assert.equal(accepted.overrides["1"]?.source_url, "https://one.example/");
  assert.equal(
    accepted.overrides["2"]?.source_url,
    "https://blog.ooblik.com/2020/2/",
  );
  assert.equal(accepted.overrides["3"], undefined);
});

test("generic title matches are not promoted to high identity confidence", () => {
  const target = {
    wordpress_id: "4",
    title: "Just MARRIED !",
    origin_url: "https://blog.ooblik.com/2022/just-married/",
    added: "2022-09-09",
    description: "Annonce personnelle de mariage.",
    tags: [],
  };
  const [candidate] = rankWordpressDestinationCandidates({
    target,
    currentLinks: [],
    results: [{
      title: "Just Married (ou presque) — Wikipédia",
      url: "https://fr.wikipedia.org/wiki/Just_Married_(ou_presque)",
      description: "Film américain sorti en 1999.",
    }],
  });
  assert.equal(candidate?.confidence, "moyenne");
});

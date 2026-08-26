import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = path.join(root, "docs", "journal");
const outputDirectory = path.join(root, "public", "flux", "journal-du-digest");
const posterDirectory = path.join(root, "static", "images", "journal", "posters");
const datedFile = /^\d{4}-\d{2}-\d{2}\.md$/;
const sentenceSegmenter = new Intl.Segmenter("fr", { granularity: "sentence" });

const sourceFiles = (await readdir(sourceDirectory))
  .filter((name) => datedFile.test(name))
  .sort()
  .reverse();

assert(sourceFiles.length > 0, "Le Journal du Digest ne contient aucun billet daté.");

const outputEntries = await readdir(outputDirectory, { withFileTypes: true });
const outputSlugs = outputEntries
  .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
  .map((entry) => entry.name)
  .sort()
  .reverse();

const sourceSlugs = sourceFiles.map((name) => path.basename(name, ".md"));
assert.deepEqual(outputSlugs, sourceSlugs, "Les pages publiques ne correspondent pas aux billets de docs/journal.");

const normalizeText = (value) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const publicTitle = (raw) => {
  const heading = raw.match(/^#\s+(.+)$/m)?.[1]?.trim();
  assert(heading, "Un billet daté ne possède pas de titre H1.");
  return heading.replace(/^(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s+[^\s]+\s+\d{4})\s+—\s+/, "");
};

const publicSummary = (raw) => {
  const summary = raw.match(/## Résumé\s+([\s\S]*?)(?=\n##\s|$)/)?.[1]?.trim();
  assert(summary, "Un billet daté ne possède pas de résumé.");
  return summary.replace(/\s+/g, " ");
};

const posterCatalog = JSON.parse(await readFile(path.join(root, "data", "journal_posters.json"), "utf8"));
assert.equal(posterCatalog.count, 100, "Le corpus visuel du journal doit contenir cent affiches.");
assert.equal(posterCatalog.posters.length, 100, "Le catalogue visuel du journal est incomplet.");
assert.equal(new Set(posterCatalog.posters.map((poster) => poster.work_id)).size, 100, "Le corpus visuel contient des doublons.");

for (const poster of posterCatalog.posters) {
  assert.equal(poster.rights_label, "No Copyright - United States", `Droits inattendus pour ${poster.work_id}.`);
  assert.match(poster.source_url, /^https:\/\/dc\.library\.northwestern\.edu\/items\//, `Source invalide pour ${poster.work_id}.`);
  await access(path.join(posterDirectory, poster.filename));
}

const indexHtml = await readFile(path.join(outputDirectory, "index.html"), "utf8");
const rss = await readFile(path.join(outputDirectory, "index.xml"), "utf8");
let previousIndexPosition = -1;
let previousRssPosition = -1;

for (let index = 0; index < sourceFiles.length; index += 1) {
  const source = await readFile(path.join(sourceDirectory, sourceFiles[index]), "utf8");
  const slug = sourceSlugs[index];
  assert(!source.includes(";"), `Le billet ${slug} contient un point-virgule interdit.`);
  const title = publicTitle(source);
  const summary = publicSummary(source);
  const sentenceCount = [...sentenceSegmenter.segment(summary)]
    .filter(({ segment }) => /[\p{L}\p{N}]/u.test(segment)).length;
  assert(sentenceCount <= 3, `Le résumé de ${slug} dépasse trois phrases.`);
  if (/^## Commits(?:\s|$)/m.test(source)) {
    assert(/^\| Commit \| Date · heure \| (?:Objet|Sujet) \|$/m.test(source), `Le registre de commits de ${slug} n’affiche pas sa colonne temporelle.`);
    const commitRows = source.match(/^\| \[`[0-9a-f]+`\]\([^\n]+\/commit\/[0-9a-f]+\) \|/gm) ?? [];
    const datedCommitRows = source.match(/^\| \[`[0-9a-f]+`\]\([^\n]+\/commit\/[0-9a-f]+\) \| \d{2}\/\d{2}\/\d{4} · \d{2}:\d{2} \|/gm) ?? [];
    assert.equal(datedCommitRows.length, commitRows.length, `Une date ou une heure manque dans le registre de commits de ${slug}.`);
  }
  const output = await readFile(path.join(outputDirectory, slug, "index.html"), "utf8");
  const outputText = normalizeText(output);

  assert(outputText.includes(title), `Le titre public est absent du billet ${slug}.`);
  assert(/class=(?:"journal-post-content"|journal-post-content)/.test(output), `Le corps public est absent du billet ${slug}.`);
  const bodyHtml = output.match(/<div class="journal-post-content">([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert(!/<h2[^>]*>\s*Résumé\s*<\/h2>/i.test(bodyHtml), `Le résumé est répété dans le corps du billet ${slug}.`);
  assert(/class=(?:"journal-post-folio"|journal-post-folio)/.test(output), `Le folio est absent du billet ${slug}.`);
  assert(output.includes('>Index</strong>'), `Le retour à l’index est absent du billet ${slug}.`);
  assert(output.includes('/images/journal/posters/'), `Le visuel est absent du billet ${slug}.`);
  assert(output.includes('dc.library.northwestern.edu/items/'), `La source du visuel est absente du billet ${slug}.`);
  assert(output.includes('data-linkedin-share'), `L’action LinkedIn est absente du billet ${slug}.`);
  assert(/>\s*Publier sur LinkedIn\s*<\/button>/.test(output), `Le libellé LinkedIn est absent du billet ${slug}.`);

  if (index > 0) {
    assert(output.includes(`/flux/journal-du-digest/${sourceSlugs[index - 1]}/`), `Le voisin récent de ${slug} est absent.`);
  }
  if (index < sourceSlugs.length - 1) {
    assert(output.includes(`/flux/journal-du-digest/${sourceSlugs[index + 1]}/`), `Le voisin ancien de ${slug} est absent.`);
  }

  const href = `/flux/journal-du-digest/${slug}/`;
  const indexPosition = indexHtml.indexOf(href);
  assert(indexPosition > previousIndexPosition, `L’ordre chronologique de l’index est incorrect pour ${slug}.`);
  previousIndexPosition = indexPosition;

  const absoluteUrl = `https://digest.ooblik.com${href}`;
  const rssPosition = rss.indexOf(absoluteUrl);
  assert(rssPosition > previousRssPosition, `L’ordre chronologique du RSS est incorrect pour ${slug}.`);
  previousRssPosition = rssPosition;
}

for (const excluded of ["README", "TEMPLATE"]) {
  await assert.rejects(
    access(path.join(outputDirectory, excluded, "index.html")),
    undefined,
    `${excluded}.md ne doit pas être publié dans le journal.`,
  );
}

assert(/href=(?:"#annee-|#annee-)/.test(indexHtml), "La navigation annuelle est absente.");
assert(/href=(?:"#mois-|#mois-)/.test(indexHtml), "La navigation mensuelle est absente.");
assert(/href=(?:"\/flux\/journal-du-digest\/index\.xml"|\/flux\/journal-du-digest\/index\.xml)/.test(indexHtml), "Le lien vers le RSS est absent.");
assert.equal(
  (indexHtml.match(/class=(?:"journal-card-visual"|journal-card-visual)/g) ?? []).length,
  sourceFiles.length,
  "Chaque carte doit posséder un bandeau visuel.",
);

process.stdout.write(`Journal du Digest validé : ${sourceFiles.length} billets, index et RSS.\n`);

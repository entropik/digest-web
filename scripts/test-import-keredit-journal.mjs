import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(path.join(root, ".tmp-journal-privacy-"));
const sourceDirectory = path.join(tempRoot, "source");
const destinationDirectory = path.join(tempRoot, "output");
const sourceFile = path.join(sourceDirectory, "2026-08-28.md");
const outputFile = path.join(destinationDirectory, "2026-08-28.md");
const importer = path.join(root, "scripts", "import-keredit-journal.ps1");
const fixture = `+++
title = "Maintenance du serveur \`edge-prod-42\`"
date = 2026-08-28
description = "Le VPS \`worker-07\` répond sur 203.0.113.17."
tags = ["journal", "sécurité"]
+++
# Titre source

Le dépôt est dans /home/marc/code/krampouz.
Synchronisation SSH vers deploy@203.0.113.17:/opt/apps/keredit/current.
Connexion SSH vers backup@edge-prod-42.
WordPress vit sous /home/adminooblik/htdocs/ooblik.com.
Les clés \`portable-ooblik-2026\` et clé \`recovery-prod\` sont installées dans \`authorized_keys\` pour SSH.
Deux machines portent encore le hostname \`gof\`.
Rediffusion manuelle du blog sur \`kerooblik\` puis le deploy doit viser uniquement \`kerooblik\`.
Commit observé : \`Merge pull request #43 from kerooblik/dev\`.
Ressource documentaire publique : https://93.184.216.34/reference.
Il y a environ douze fichiers ; les attributs sont geres dans des emplacements geres.
Points verifies, contrats verifies et objets sont verifies ; tu verifies le résultat.
Le travail est preserve, le ClipPath preserve, le module dedie ; la journée a ramene 41 fichiers deplaces.

Contrôles préservés : vite@8.0.16, @vitejs/plugin-react, dev@e9016cd,
contact@example.org, KEREDIT, GOF, VPS KEREDIT, serveur GOF,
VPS Hetzner, VPS bêta, forge.keredit.com, /usr/bin/wp, /api/health,
deploy/run.sh et thumbnail_key.
`;

const digest = (value) => createHash("sha256").update(value).digest("hex");
const runImporter = () => {
  const result = spawnSync(
    "pwsh",
    [
      "-NoLogo",
      "-NoProfile",
      "-File",
      importer,
      "-SourceDirectory",
      sourceDirectory,
      "-DestinationDirectory",
      destinationDirectory,
      "-Publish",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
};

try {
  await mkdir(sourceDirectory, { recursive: true });
  await writeFile(sourceFile, fixture, "utf8");
  const sourceBefore = await readFile(sourceFile);

  runImporter();
  const firstOutput = await readFile(outputFile, "utf8");

  assert.match(firstOutput, /serveur `\[nom privé\]`/);
  assert.match(firstOutput, /VPS `\[nom privé\]`/);
  assert.match(firstOutput, /\[adresse IP\]/);
  assert.match(firstOutput, /dépôt local krampouz/);
  assert.match(firstOutput, /\[compte\]@\[hôte\]:\/opt\/\[chemin privé\]/);
  assert.match(firstOutput, /Connexion SSH vers \[compte\]@\[hôte\]\./);
  assert.match(firstOutput, /\/home\/\[compte\]\/\[chemin privé\]/);
  assert.match(firstOutput, /clé `\[libellé privé\]`/);
  assert.match(firstOutput, /hostname `\[nom privé\]`/);
  assert.match(firstOutput, /blog sur `\[nom privé\]`/);
  assert.match(firstOutput, /viser uniquement `\[nom privé\]`/);
  assert.match(firstOutput, /Merge pull request #43 from \[compte GitHub\]\/dev/);
  assert.match(firstOutput, /Il y a environ douze fichiers ; les attributs sont gérés dans des emplacements gérés\./);
  assert.doesNotMatch(firstOutput, /il y à environ/i);
  assert.match(firstOutput, /Points vérifiés, contrats vérifiés et objets sont vérifiés ; tu vérifies le résultat\./);
  assert.match(firstOutput, /Le travail est préservé, le ClipPath préservé, le module dédié ; la journée a ramené 41 fichiers déplacés\./);

  for (const control of [
    "vite@8.0.16",
    "@vitejs/plugin-react",
    "dev@e9016cd",
    "contact@example.org",
    "KEREDIT",
    "GOF",
    "VPS KEREDIT",
    "serveur GOF",
    "VPS Hetzner",
    "VPS bêta",
    "forge.keredit.com",
    "/usr/bin/wp",
    "/api/health",
    "deploy/run.sh",
    "thumbnail_key",
    "https://93.184.216.34/reference",
  ]) {
    assert(firstOutput.includes(control), `Le contrôle légitime « ${control} » a été modifié.`);
  }

  for (const secret of [
    "edge-prod-42",
    "worker-07",
    "203.0.113.17",
    "deploy@",
    "adminooblik",
    "portable-ooblik-2026",
    "recovery-prod",
    "backup@edge-prod-42",
    "/opt/apps/keredit/current",
    "hostname `gof`",
    "`kerooblik`",
    "from kerooblik/dev",
  ]) {
    assert(!firstOutput.includes(secret), `La donnée « ${secret} » reste publiée.`);
  }

  runImporter();
  const secondOutput = await readFile(outputFile, "utf8");
  const sourceAfter = await readFile(sourceFile);
  assert.equal(secondOutput, firstOutput, "Un second import doit produire une sortie identique.");
  assert.equal(digest(sourceAfter), digest(sourceBefore), "L’import ne doit jamais modifier la source.");

  process.stdout.write(`Obfuscation de l’importeur validée sur ${os.platform()}.\n`);
} finally {
  assert(tempRoot.startsWith(`${root}${path.sep}.tmp-journal-privacy-`));
  await rm(tempRoot, { recursive: true, force: true });
}

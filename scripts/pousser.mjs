#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const run = (cmd, args, opts = {}) => {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd || root,
    stdio: opts.stdio || "inherit",
    encoding: "utf8",
  });
  if (res.error) throw res.error;
  if (res.status !== 0 && !opts.ignoreStatus) {
    const msg = opts.capture ? res.stderr || res.stdout : "";
    throw new Error(`Échec de la commande : ${cmd} ${args.join(" ")}\n${msg}`);
  }
  return (res.stdout || "").trim();
};

const gitOutput = (args) => {
  return run("git", args, { stdio: "pipe", capture: true, ignoreStatus: true });
};

function findChangedJournalPost() {
  const status = gitOutput(["status", "--porcelain"]);
  const lines = status.split("\n").filter(Boolean);
  for (const line of lines) {
    const file = line.slice(3).trim();
    if (/^docs\/journal\/\d{4}-\d{2}-\d{2}\.md$/.test(file)) {
      return file;
    }
  }
  return null;
}

function extractJournalTitle(filePath) {
  try {
    const content = fs.readFileSync(path.join(root, filePath), "utf8");
    const match = content.match(/^#\s+(?:\d{4}-\d{2}-\d{2}\s+—\s+)?(.+)$/m);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch {}
  return null;
}

function updateJournalReadmeIfNeeded(journalFile, title) {
  const dateMatch = journalFile.match(/(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return;
  const dateStr = dateMatch[1];
  const readmePath = path.join(root, "docs", "journal", "README.md");
  if (!fs.existsSync(readmePath)) return;

  const content = fs.readFileSync(readmePath, "utf8");
  if (content.includes(`(${dateStr}.md)`)) return;

  const dateObj = new Date(`${dateStr}T12:00:00Z`);
  const months = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ];
  const formattedDate = `${dateObj.getUTCDate()} ${months[dateObj.getUTCMonth()]} ${dateObj.getUTCFullYear()}`;

  const row = `| ${formattedDate} | [${title}](${dateStr}.md) | 1 | ${title} |`;
  const updated = content.replace(/(## Provenance)/, `${row}\n\n$1`);
  fs.writeFileSync(readmePath, updated, "utf8");
  console.log(`📝 Index docs/journal/README.md mis à jour avec le billet du ${formattedDate}.`);
}

function publish(customMessage = null) {
  const status = gitOutput(["status", "--porcelain"]);
  if (!status) {
    console.log("✨ Aucun changement détecté dans le dépôt. Rien à publier.");
    return false;
  }

  const journalFile = findChangedJournalPost();
  let commitMessage = customMessage;

  if (!commitMessage && journalFile) {
    const title = extractJournalTitle(journalFile);
    if (title) {
      updateJournalReadmeIfNeeded(journalFile, title);
      commitMessage = `docs(journal): publier le billet — ${title}`;
    }
  }

  if (!commitMessage) {
    const date = new Date().toISOString().slice(0, 10);
    commitMessage = `feat(digest): mise à jour du contenu éditorial (${date})`;
  }

  console.log(`\n🚀 Lancement de la publication...`);
  console.log(`📦 Message de commit : « ${commitMessage} »`);

  // Vérification de sécurité du journal
  try {
    run("node", ["scripts/check-journal-public-safety.mjs"], { stdio: "inherit" });
  } catch (err) {
    console.error("❌ Échec du contrôle de sécurité du journal. Publication annulée.");
    return false;
  }

  // Récupérer les éventuelles modifications distantes (ex: traductions automatiques du service admin)
  console.log(`📥 Synchronisation avec le dépôt du VPS...`);
  run("git", ["pull", "--rebase", "live", "main"], { ignoreStatus: true });

  // Indexation et commit
  run("git", ["add", "-A"]);
  // Vérifier s'il reste des modifications après rebase
  const staged = gitOutput(["diff", "--cached", "--name-only"]);
  if (staged) {
    run("git", ["commit", "-m", commitMessage]);
  }

  // Déploiement direct vers le VPS (live)
  console.log(`\n📡 Envoi direct vers le VPS (mise en ligne en ~20s)...`);
  const started = Date.now();
  run("git", ["push", "live", "main"]);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\n🎉 Site mis en ligne avec succès sur le VPS en ${elapsed}s !`);
  console.log(`🌐 Voir le site : https://digest.ooblik.com/\n`);

  // Synchronisation miroir de secours vers GitHub en tâche de fond
  console.log(`🔄 Synchronisation du miroir de sauvegarde GitHub...`);
  run("git", ["push", "origin", "main"], { ignoreStatus: true });

  return true;
}

// Mode Watcher pour Orca
function watchMode() {
  console.log(`\n======================================================`);
  console.log(`👀 Mode surveillance Orca actif pour OOBLIK Digest`);
  console.log(`======================================================`);
  console.log(`Dès que vous enregistrez un fichier dans docs/journal ou content/,`);
  console.log(`il sera automatiquement validé, commité et poussé sur le VPS.\n`);

  let debounceTimer = null;
  let isPublishing = false;

  const triggerPublish = (eventType, filename) => {
    if (!filename || isPublishing) return;
    if (filename.includes(".git") || filename.includes("node_modules") || filename.includes("public")) return;
    if (!/\.(md|json|html|css|yaml)$/.test(filename)) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      isPublishing = true;
      console.log(`\n💾 Modification détectée : ${filename}`);
      try {
        publish();
      } catch (e) {
        console.error("❌ Erreur pendant la publication :", e.message);
      } finally {
        isPublishing = false;
        console.log(`\n👀 En attente de la prochaine modification...\n`);
      }
    }, 3000);
  };

  const watchDirs = [
    path.join(root, "docs", "journal"),
    path.join(root, "content"),
    path.join(root, "data"),
  ];

  for (const dir of watchDirs) {
    if (fs.existsSync(dir)) {
      fs.watch(dir, { recursive: true }, triggerPublish);
    }
  }
}

// Analyse des arguments de la ligne de commande
const args = process.argv.slice(2);
if (args.includes("--watch") || args.includes("-w")) {
  watchMode();
} else {
  const customMsg = args.filter((a) => !a.startsWith("-")).join(" ") || null;
  publish(customMsg);
}

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const journalDirectory = path.join(root, "content", "flux", "journal-procrastinateur");
const datedFile = /^\d{4}-\d{2}-\d{2}\.md$/;
const connectionContext = /\b(?:SSH|SCP|SFTP|rsync|synchronis(?:e|ation)|destination\s+(?:distante|SSH)|connexion\s+(?:distante|SSH))\b/i;
const remoteTarget = /\b(?!\[compte\])([a-z_][a-z0-9._-]*)@((?:\d{1,3}\.){3}\d{1,3}|\[[^\]]+\]|[a-z0-9](?:[a-z0-9._-]*[a-z0-9_-])?)/i;
const unsafeRules = [
  [/(?:^|[^\w.-])\/(?:home|Users)\/(?!\[compte\])[^\s`"'<>)\],;]+/i, "compte dans un chemin utilisateur"],
  [/(?:^|[^\w.-])\/(?:root|opt|srv)\/(?!\[chemin privé\])[^\s`"'<>)\],;]+/i, "chemin d’infrastructure précis"],
  [/\b[A-Z]:\\Users\\[^\s`"'<>)\],;]+/i, "chemin utilisateur Windows"],
  [/\b(?:VPS|serveur|hostname|hôte|NAS|forge)\s+(?:(?:KEREDIT|GOF)\s+)?(?:nommé[e]?\s+)?`(?!\[nom privé\])[a-z0-9][a-z0-9._-]*`/, "nom de machine explicite"],
  [/-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/, "clé privée"],
];

const files = (await readdir(journalDirectory)).filter((name) => datedFile.test(name)).sort();
const violations = [];

for (const file of files) {
  const contents = await readFile(path.join(journalDirectory, file), "utf8");
  const lines = contents.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const [pattern, reason] of unsafeRules) {
      if (pattern.test(line)) violations.push(`${file}:${index + 1} — ${reason}`);
    }
    if (connectionContext.test(line) && remoteTarget.test(line)) {
      violations.push(`${file}:${index + 1} — compte ou hôte distant précis`);
    }
    if (
      /(?:environnement|comme source)/i.test(line)
      && /\bVPS\s+(?!KEREDIT\b|GOF\b|Hetzner\b|bêta\b|\[nom privé\])([A-Za-z0-9][A-Za-z0-9._-]*)/.test(line)
    ) {
      violations.push(`${file}:${index + 1} — nom de VPS explicite`);
    }
    if (
      /\b(?:SSH|authorized_keys|IdentityFile)\b/i.test(line)
      && /\b(?:clés?|clefs?|keys?)\s+`(?!\[libellé privé\])[^`\r\n]+`/i.test(line)
    ) {
      violations.push(`${file}:${index + 1} — libellé de clé SSH précis`);
    }
  }
}

assert.equal(
  violations.length,
  0,
  `Informations d’infrastructure non obfusquées :\n${violations.join("\n")}`,
);

process.stdout.write(`Sécurité du journal validée : ${files.length} billets contrôlés.\n`);

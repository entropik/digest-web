import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--destination" || !args[1])) {
  throw new Error("Usage: node scripts/build-site.mjs [--destination <directory>]");
}
const destination = path.resolve(root, args[1] || "public");
const run = (args, env = {}) => {
  const result = spawnSync(process.env.HUGO_BINARY || "hugo", args, { cwd: root, env: { ...process.env, ...env }, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Hugo build failed");
};
await mkdir(path.join(root, ".build-i18n"), { recursive: true });
const common = ["--gc", "--minify", "--panicOnWarning", "--baseURL", "https://digest.ooblik.com/"];
run([...common, "--destination", ".build-i18n/source", "--cleanDestinationDir"], { HUGO_DISABLELANGUAGES: "en" });
const source = await readFile(path.join(root, ".build-i18n/source/translation-source.json"), "utf8");
await writeFile(path.join(root, ".build-i18n/manifest.json"), source);
run([...common, "--destination", destination, "--cleanDestinationDir"]);

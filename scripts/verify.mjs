import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const run = (command, args, options = {}) => {
  const relativeCwd = options.cwd ? path.relative(root, options.cwd) || "." : ".";
  process.stdout.write(`\n> [${relativeCwd}] ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: process.env,
    stdio: "inherit",
    shell: options.shell ?? (command === npm && process.platform === "win32"),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status ?? "unknown"}`);
  }
};

const probe = (command, args = ["--version"]) =>
  spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });

const available = (command) => {
  const result = probe(command);
  return !result.error && result.status === 0;
};

const pythonCandidates = [process.env.PYTHON, "python3", "python"].filter(Boolean);
const python = pythonCandidates.find((candidate, index) =>
  pythonCandidates.indexOf(candidate) === index && available(candidate),
);
if (!python) throw new Error("Python 3 is required (python3 or python was not found).");
const hugoProbe = probe("hugo", ["version"]);
const hugoVersion = hugoProbe.stdout?.match(/v(\d+)\.(\d+)\.(\d+).*extended/i);
if (
  hugoProbe.error ||
  hugoProbe.status !== 0 ||
  !hugoVersion ||
  Number(hugoVersion[1]) < 1 && Number(hugoVersion[2]) < 164
) {
  throw new Error("Hugo Extended 0.164.0 or newer is required.");
}

const admin = path.join(root, "admin-service");
const extension = path.join(root, "browser-extension");

run(npm, ["ci"], { cwd: admin });
run(npm, ["test"], { cwd: admin });
run(npm, ["run", "build"], { cwd: admin });

run(npm, ["ci"], { cwd: extension });
run(npm, ["run", "typecheck"], { cwd: extension });
run(npm, ["test"], { cwd: extension });
run(npm, ["run", "icons"], { cwd: extension });
run("git", ["diff", "--exit-code", "--", "browser-extension/public/icon"]);
run(npm, ["run", "build"], { cwd: extension });
run(npm, ["run", "zip"], { cwd: extension });

run(python, ["scripts/ensure_link_ids.py", "--check"]);
run(python, ["scripts/check_url_canonicalization.py"]);
run(python, ["skills/curate-web-digest/scripts/curate_links.py", "--check", "--site", "."]);
run(process.execPath, ["scripts/resolve_wayback_links.mjs", "--check"]);
run(python, ["scripts/check_digest_consistency.py", "--site", "."]);
run("hugo", [
  "--gc",
  "--minify",
  "--panicOnWarning",
  "--baseURL",
  "https://digest.ooblik.com/",
]);
run(process.execPath, ["scripts/check_journal_output.mjs"]);

const developmentUrl = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i;
const publicDirectory = path.join(root, "public");
const matches = [];

const inspectOutput = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await inspectOutput(target);
      continue;
    }
    if (!entry.isFile()) continue;
    const contents = await readFile(target);
    const text = contents.toString("latin1");
    if (developmentUrl.test(text)) matches.push(path.relative(root, target));
  }
};

await inspectOutput(publicDirectory);
if (matches.length) {
  throw new Error(`Development URL found in production output:\n${matches.join("\n")}`);
}

process.stdout.write("\nVerification completed successfully.\n");

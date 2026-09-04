import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: options.cwd || root, env: { ...process.env, ...(options.env || {}) }, encoding: "utf8", stdio: options.capture ? "pipe" : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout || ""}${result.stderr || ""}`);
  return (result.stdout || "").trim();
};
const json = async file => JSON.parse(await readFile(file, "utf8"));
const sha = /^[a-f0-9]{64}$/;
const allowedSource = file => file === "data/translations_en.json" || file === "data/translation_build_plan.json" || /^static\/social\/en\/\d{4}-\d{2}-\d{2}(?:-linkedin)?\.png$/.test(file);

export function validatePlan(plan) {
  if (!plan || plan.version !== 1 || !sha.test(plan.revision || "") || !sha.test(plan.baseRevision || "") || !sha.test(plan.targetRevision || "") ||
      typeof plan.manifestRevision !== "string" || typeof plan.fullBuild !== "boolean" || !Array.isArray(plan.items) || !Array.isArray(plan.paths) ||
      !plan.artwork || !Array.isArray(plan.artwork.upsert) || !Array.isArray(plan.artwork.remove)) throw new Error("PUBLICATION_PLAN_INVALID");
  const { revision, ...body } = plan;
  if (createHash("sha256").update(JSON.stringify(body)).digest("hex") !== revision) throw new Error("PUBLICATION_PLAN_INVALID");
  if ((!plan.fullBuild && !sha.test(plan.manifestRevision)) ||
      plan.items.some(item => !item || typeof item.id !== "string" || !Array.isArray(item.fields) || item.fields.some(field => typeof field !== "string")) ||
      plan.paths.some(value => typeof value !== "string" || !value.startsWith("/") || value.includes("..")) ||
      [...plan.artwork.upsert, ...plan.artwork.remove].some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error("PUBLICATION_PLAN_INVALID");
  return plan;
}

const sorted = object => Object.entries(object || {}).sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
const snapshotRevision = snapshot => {
  const fields = sorted(snapshot.entries).flatMap(([id, values]) => sorted(values).flatMap(([name, entry]) => [id, name, entry.hash, entry.text, Boolean(entry.manual)]));
  const images = sorted(snapshot.artwork).flatMap(([date, entry]) => [date, entry.title, entry.description, entry.linkCount, entry.editorialType]);
  return createHash("sha256").update(JSON.stringify([fields, images]).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029")).digest("hex");
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const manifestRevision = items => createHash("sha256").update(JSON.stringify(items).replaceAll("&", "\\u0026").replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029")).digest("hex");

export function validatePlanAgainst(manifest, base, target, plan) {
  validatePlan(plan);
  if (manifest.version !== 2 || manifest.revision !== manifestRevision(manifest.items || [])) throw new Error("PUBLIC_MANIFEST_INVALID");
  for (const snapshot of [base, target]) if (!snapshot || snapshot.version !== 1 || !sha.test(snapshot.revision || "") || snapshot.revision !== snapshotRevision(snapshot)) throw new Error("TRANSLATION_SNAPSHOT_INVALID");
  const ids = new Set([...Object.keys(base.entries), ...Object.keys(target.entries)]);
  const items = [...ids].sort().flatMap(id => {
    const names = new Set([...Object.keys(base.entries[id] || {}), ...Object.keys(target.entries[id] || {})]);
    const fields = [...names].filter(name => !same(base.entries[id]?.[name], target.entries[id]?.[name])).sort();
    return fields.length ? [{ id, fields }] : [];
  });
  const beforeArtwork = base.artwork || {}, afterArtwork = target.artwork || {};
  const dates = new Set([...Object.keys(beforeArtwork), ...Object.keys(afterArtwork)]);
  const upsert = [...dates].filter(date => afterArtwork[date] && !same(beforeArtwork[date], afterArtwork[date])).sort();
  const remove = [...dates].filter(date => beforeArtwork[date] && !afterArtwork[date]).sort();
  const changedIds = new Set(items.map(item => item.id));
  for (const item of manifest.items) if (item.artwork && [...upsert, ...remove].includes(item.artwork.date)) {
    changedIds.add(item.id);
    if (!items.some(changed => changed.id === item.id)) items.push({ id: item.id, fields: ["$artwork"] });
  }
  items.sort((left, right) => left.id.localeCompare(right.id));
  const body = { version: 1, baseRevision: base.revision, targetRevision: target.revision, manifestRevision: manifest.revision, fullBuild: false,
    items, paths: [...new Set(manifest.items.filter(item => changedIds.has(item.id)).flatMap(item => item.impacts))].sort(), artwork: { upsert, remove } };
  const expected = { ...body, revision: createHash("sha256").update(JSON.stringify(body)).digest("hex") };
  if (!same(plan, expected)) throw new Error("PUBLICATION_PLAN_MISMATCH");
  return plan;
}

export function isTranslationOnly(files, plan) {
  const artworkDates = new Set([...plan.artwork.upsert, ...plan.artwork.remove]);
  return files.length > 0 && files.every(file => {
    if (!allowedSource(file)) return false;
    const artwork = file.match(/^static\/social\/en\/(\d{4}-\d{2}-\d{2})/);
    return !artwork || artworkDates.has(artwork[1]);
  }) &&
    files.includes("data/translations_en.json") && files.includes("data/translation_build_plan.json") && !plan.fullBuild;
}

const copyFile = async (source, destination) => {
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
};
const walk = async directory => {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(target));
    else if (entry.isFile()) found.push(target);
  }
  return found;
};
const yamlString = value => JSON.stringify(value);
const segmentPath = value => value === "/" ? value : "/" + value.replace(/^\/+|\/+$/g, "");
export const segmentNames = paths => [...paths.map((_, index) => `translation-target-${index}`), "translation-snapshot"];
export const segmentConfig = paths => `segments:\n${paths.map((value, index) => `  translation-target-${index}:\n    includes:\n      - sites:\n          matrix:\n            languages: [en]\n        path: ${yamlString(segmentPath(value))}`).join("\n")}\n  translation-snapshot:\n    includes:\n      - sites:\n          matrix:\n            languages: [fr]\n        path: "/"\n        kind: home\n        output: "{translationsnapshot}"\n`;

async function targetedBuild(plan, production, temporary) {
  const publicSnapshot = await json(path.join(production, "translation-snapshot.json"));
  if (publicSnapshot.revision !== plan.baseRevision) throw new Error("PUBLIC_SNAPSHOT_DIVERGED");
  const manifest = await json(path.join(production, "translation-source.json"));
  if (manifest.version !== 2 || manifest.revision !== plan.manifestRevision) throw new Error("PUBLIC_MANIFEST_DIVERGED");
  const translations = await json(path.join(root, "data/translations_en.json"));
  if (translations.revision !== plan.targetRevision) throw new Error("TRANSLATION_TARGET_DIVERGED");
  validatePlanAgainst(manifest, publicSnapshot, translations, plan);
  await mkdir(path.join(root, ".build-i18n"), { recursive: true });
  await writeFile(path.join(root, ".build-i18n/manifest.json"), JSON.stringify(manifest));
  const config = path.join(temporary, "segments.yaml");
  await writeFile(config, segmentConfig(plan.paths));
  const rendered = path.join(temporary, "rendered");
  run(process.env.HUGO_BINARY || "hugo", ["--gc", "--minify", "--panicOnWarning", "--baseURL", "https://digest.ooblik.com/", "--config", `hugo.yaml,${config}`, "--renderSegments", segmentNames(plan.paths).join(","), "--destination", rendered, "--cleanDestinationDir"]);
  const snapshotPath = path.join(rendered, "translation-snapshot.json");
  const renderedSnapshot = await json(snapshotPath);
  if (renderedSnapshot.revision !== plan.targetRevision) throw new Error("TARGET_SNAPSHOT_MISSING");
  await copyFile(snapshotPath, path.join(production, "translation-snapshot.json"));

  const english = path.join(rendered, "en");
  const outputs = (await walk(english)).filter(file => /\.(?:html|xml)$/.test(file) || /\/data\/digest-index-[^/]+\.json$/.test(file));
  if (!outputs.length) throw new Error("TARGET_OUTPUT_MISSING");
  for (const route of plan.paths) {
    const expected = route === "/" ? path.join(english, "index.html") : path.join(english, route.replace(/^\/+|\/+$/g, ""), "index.html");
    try { if (!(await stat(expected)).isFile()) throw new Error(); } catch { throw new Error(`TARGET_OUTPUT_MISSING:${route}`); }
  }
  if (plan.paths.includes("/")) {
    const oldData = path.join(production, "en/data");
    for (const name of await readdir(oldData).catch(() => [])) if (/^digest-index-.*\.json$/.test(name)) await rm(path.join(oldData, name));
  }
  for (const file of outputs) await copyFile(file, path.join(production, path.relative(rendered, file)));
  for (const date of plan.artwork.upsert) {
    for (const suffix of [".png", "-linkedin.png"]) {
      const relative = `social/en/${date}${suffix}`;
      await copyFile(path.join(root, "static", relative), path.join(production, relative));
    }
  }
  for (const date of plan.artwork.remove) for (const suffix of [".png", "-linkedin.png"]) await rm(path.join(production, `social/en/${date}${suffix}`), { force: true });
}

export async function classifyPushChanges(mainSha) {
  let beforeSha = process.env.GITHUB_EVENT_BEFORE;
  if (!beforeSha && process.env.GITHUB_EVENT_PATH) {
    try {
      const payload = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
      beforeSha = payload?.before;
    } catch {
      // Ignore if event payload cannot be parsed
    }
  }
  if (beforeSha && !/^0+$/.test(beforeSha)) {
    try {
      run("git", ["rev-parse", "--verify", `${beforeSha}^{commit}`]);
      return run("git", ["diff", "--name-only", beforeSha, mainSha], { capture: true }).split("\n").filter(Boolean);
    } catch {
      return null;
    }
  }
  try {
    run("git", ["rev-parse", "--verify", "HEAD~1"]);
    return run("git", ["diff", "--name-only", "HEAD~1", mainSha], { capture: true }).split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

async function publish() {
  const mainSha = process.env.GITHUB_SHA || run("git", ["rev-parse", "HEAD"], { capture: true });
  const event = process.env.GITHUB_EVENT_NAME || "push";
  const changed = event === "push" ? await classifyPushChanges(mainSha) : null;
  let plan;
  try { plan = validatePlan(await json(path.join(root, "data/translation_build_plan.json"))); } catch { plan = null; }
  let targeted = Boolean(changed && plan && isTranslationOnly(changed, plan));
  const temporary = await mkdtemp(path.join(tmpdir(), "digest-production-"));
  const production = path.join(temporary, "production");
  try {
    run("git", ["fetch", "origin", "+refs/heads/production:refs/remotes/origin/production"]);
    run("git", ["worktree", "add", "--detach", production, "origin/production"]);
    if (targeted) {
      try {
        await targetedBuild(plan, production, temporary);
        process.stdout.write(`Targeted translation overlay: ${plan.paths.length} Hugo paths.\n`);
      } catch (error) {
        process.stdout.write(`Targeted overlay rejected (${error instanceof Error ? error.message : error}); running the complete build.\n`);
        targeted = false;
      }
    }
    if (!targeted) {
      run(process.execPath, ["scripts/verify.mjs"]);
      run("rsync", ["-a", "--delete", "--exclude", ".git", "public/", `${production}/`]);
    }
    await writeFile(path.join(production, ".nojekyll"), "");
    run("git", ["add", "--all"], { cwd: production });
    const staged = run("git", ["diff", "--cached", "--name-only"], { cwd: production, capture: true });
    if (!staged) {
      process.stdout.write("Production tree is already up to date; nothing to deploy.\n");
      return;
    }
    run("git", ["config", "user.name", "github-actions[bot]"], { cwd: production });
    run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], { cwd: production });
    run("git", ["commit", "-m", `Deploy ${mainSha}${targeted ? " (targeted translations)" : ""}`], { cwd: production });
    run("git", ["push", "origin", "HEAD:production"], { cwd: production });
  } finally {
    run("git", ["worktree", "remove", "--force", production]);
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await publish();

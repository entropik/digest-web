import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, chmod, mkdtemp, mkdir, readFile, readlink, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployScript = path.join(root, "scripts", "deploy-vps.sh");
const requiredRoutes = [
  "index.html",
  "en/index.html",
  "en/flux/index.html",
  "en/tags/index.html",
  "en/archives/index.html",
  "en/a-propos/index.html",
  "en/confidentialite/index.html",
];

test("the VPS deployment builds and publishes the complete bilingual site", async () => {
  const script = await readFile(deployScript, "utf8");

  // Keep the production path unreachable until the script exposes a test-safe base.
  assert.match(script, /DIGEST_SITE_BASE/);
  assert.match(script, /node scripts\/build-site\.mjs --destination "\$RELEASE_DIR"/);

  const temporary = await mkdtemp(path.join(os.tmpdir(), "digest-deploy-vps-"));
  const base = path.join(temporary, "site");
  const fakeBin = path.join(temporary, "bin");
  const invocationLog = path.join(temporary, "node-arguments.log");
  await mkdir(fakeBin, { recursive: true });

  const fakeNode = path.join(fakeBin, "node");
  await writeFile(
    fakeNode,
    `#!/bin/sh
set -eu
printf '%s\\n' "$*" > "$TEST_NODE_INVOCATION"
test "$1" = "scripts/build-site.mjs"
test "$2" = "--destination"
destination="$3"
for route in ${requiredRoutes.map((route) => `"${route}"`).join(" ")}; do
  if [ "\${TEST_MISSING_ROUTE:-}" = "$route" ]; then
    continue
  fi
  mkdir -p "$(dirname "$destination/$route")"
  printf '%s\\n' "$route" > "$destination/$route"
done
`,
  );
  await chmod(fakeNode, 0o755);

  const fakeHugo = path.join(fakeBin, "hugo");
  await writeFile(fakeHugo, "#!/bin/sh\nexit 0\n");
  await chmod(fakeHugo, 0o755);

  const fakeMv = path.join(fakeBin, "mv");
  await writeFile(
    fakeMv,
    `#!/bin/sh
set -eu
test "$1" = "-Tf"
"$TEST_REAL_MV" -f "$2" "$3"
`,
  );
  await chmod(fakeMv, 0o755);

  const fakeXargs = path.join(fakeBin, "xargs");
  await writeFile(fakeXargs, "#!/bin/sh\nexit 0\n");
  await chmod(fakeXargs, 0o755);

  const runDeploy = (siteBase, missingRoute = "") =>
    spawnSync("sh", [deployScript], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        DIGEST_SITE_BASE: siteBase,
        HUGO_BIN: fakeHugo,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        TEST_MISSING_ROUTE: missingRoute,
        TEST_NODE_INVOCATION: invocationLog,
        TEST_REAL_MV: "/bin/mv",
      },
    });

  try {
    const result = runDeploy(base);

    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    const invocation = (await readFile(invocationLog, "utf8")).trim();
    assert.match(invocation, /^scripts\/build-site\.mjs --destination /);

    const current = await readlink(path.join(base, "current"));
    assert.match(current, /^releases\/\d{14}$/);
    for (const route of requiredRoutes) {
      await access(path.join(base, current, route));
    }

    for (const route of requiredRoutes) {
      const incompleteBase = path.join(temporary, `missing-${route.replaceAll("/", "-")}`);
      const incomplete = runDeploy(incompleteBase, route);
      assert.notEqual(incomplete.status, 0, `a build without ${route} must not go live`);
      await assert.rejects(readlink(path.join(incompleteBase, "current")), { code: "ENOENT" });
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const shell =
  process.platform === "win32"
    ? ["C:\\Program Files\\Git\\bin\\sh.exe", "C:\\Program Files\\Git\\usr\\bin\\sh.exe"].find(
        existsSync,
      )
    : "sh";

test("admin deployment rolls back operational failures without restarting an unsafe release", async () => {
  assert.ok(shell, "A POSIX shell is required for the deployment contract test");
  const nativeScript = fileURLToPath(
    new URL("../../scripts/test-deploy-admin-cloudpanel.sh", import.meta.url),
  );
  const script =
    process.platform === "win32"
      ? nativeScript
          .replace(/^([A-Za-z]):\\/, (_match, drive: string) => `/${drive.toLowerCase()}/`)
          .replaceAll("\\", "/")
      : nativeScript;
  const result = await new Promise<{ code: number | null; output: string }>(
    (resolve, reject) => {
      const child = spawn(shell, [script], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (chunk) => (output += String(chunk)));
      child.stderr.on("data", (chunk) => (output += String(chunk)));
      child.once("error", reject);
      child.once("close", (code) => resolve({ code, output }));
    },
  );
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /Deployment rollback scenarios passed/);
});

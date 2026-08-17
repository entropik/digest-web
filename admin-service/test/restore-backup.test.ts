import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.BETTER_AUTH_URL = "https://digest.ooblik.com";
process.env.BETTER_AUTH_SECRET = "a-secure-test-secret-that-is-long-enough";
process.env.BETTER_AUTH_DATABASE = "restore-test.sqlite";
process.env.GITHUB_CLIENT_ID = "test-github-client";
process.env.GITHUB_CLIENT_SECRET = "test-github-secret";
process.env.GITHUB_APP_ID = "1";
process.env.GITHUB_APP_INSTALLATION_ID = "1";
process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = Buffer.from("unused").toString("base64");
process.env.DATABASE_BACKUP_PATH = "placeholder";

const { restoreDatabaseBackup } = await import("../src/restore-backup.js");

test("database restoration replaces the database and removes stale WAL files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "digest-restore-test-"));
  const backups = join(directory, "backups");
  const database = join(directory, "auth.sqlite");
  const backup = join(backups, "auth.sqlite.2026-08-17.backup");
  await mkdir(backups);
  await Promise.all([
    writeFile(database, "new broken state"),
    writeFile(`${database}-wal`, "stale wal"),
    writeFile(`${database}-shm`, "stale shm"),
    writeFile(backup, "known good state"),
  ]);

  await restoreDatabaseBackup(database, backup, backups);

  assert.equal(await readFile(database, "utf8"), "known good state");
  await assert.rejects(readFile(`${database}-wal`), { code: "ENOENT" });
  await assert.rejects(readFile(`${database}-shm`), { code: "ENOENT" });
  await assert.rejects(
    restoreDatabaseBackup(database, join(directory, "untrusted.backup"), backups),
    /not a recognized backup/,
  );
  await rm(directory, { recursive: true, force: true });
});

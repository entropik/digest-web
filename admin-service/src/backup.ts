import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { authDatabase } from "./auth.js";
import { config } from "./config.js";

const backupDirectory =
  process.env.BETTER_AUTH_BACKUP_DIRECTORY?.trim() ||
  join(dirname(config.databasePath), "backups");
await mkdir(backupDirectory, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = join(
  backupDirectory,
  `${basename(config.databasePath)}.${timestamp}.backup`,
);
await authDatabase.backup(destination);

const backups = (await readdir(backupDirectory))
  .filter((name) => name.startsWith(`${basename(config.databasePath)}.`))
  .sort()
  .reverse();
for (const expired of backups.slice(14)) {
  await rm(join(backupDirectory, expired));
}
console.log(`SQLite backup created: ${destination}`);

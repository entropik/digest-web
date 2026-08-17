import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "./config.js";

export const restoreDatabaseBackup = async (
  databasePath: string,
  backupPath: string,
  backupDirectory = dirname(backupPath),
): Promise<void> => {
  const database = resolve(databasePath);
  const backup = resolve(backupPath);
  const allowedDirectory = resolve(backupDirectory);
  if (
    dirname(backup) !== allowedDirectory ||
    !basename(backup).startsWith(`${basename(database)}.`) ||
    !basename(backup).endsWith(".backup")
  ) {
    throw new Error("DATABASE_BACKUP_PATH is not a recognized backup");
  }
  const backupInfo = await stat(backup);
  if (!backupInfo.isFile() || backupInfo.size === 0) {
    throw new Error("DATABASE_BACKUP_PATH is empty or not a file");
  }
  await mkdir(dirname(database), { recursive: true });
  const temporary = join(
    dirname(database),
    `.${basename(database)}.restore-${process.pid}`,
  );
  await rm(temporary, { force: true });
  try {
    await copyFile(backup, temporary);
    await rm(`${database}-wal`, { force: true });
    await rm(`${database}-shm`, { force: true });
    await rename(temporary, database);
  } finally {
    await rm(temporary, { force: true });
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const backupPath = process.env.DATABASE_BACKUP_PATH?.trim();
  if (!backupPath) throw new Error("DATABASE_BACKUP_PATH is required");
  const backupDirectory =
    process.env.BETTER_AUTH_BACKUP_DIRECTORY?.trim() ||
    join(dirname(config.databasePath), "backups");
  await restoreDatabaseBackup(config.databasePath, backupPath, backupDirectory);
  console.log(`SQLite database restored from: ${resolve(backupPath)}`);
}

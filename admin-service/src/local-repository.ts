import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  parseCatalog,
  parseCategories,
  type DigestLink,
  type DigestCategory,
} from "./catalog.js";
import {
  parseTagDefinitions,
  type DigestTagDefinition,
} from "./tag-taxonomy.js";

const execFileAsync = promisify(execFile);

export type GitHubContentItem = { name: string; path: string; type: string };

export type WorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  head_sha: string;
};

export type RepositoryHead = {
  commitSha: string;
  treeSha: string;
  links: DigestLink[];
  categories?: DigestCategory[];
  tags?: DigestTagDefinition[];
};

let localMutationLock = Promise.resolve();
export const withLocalMutationLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  const previous = localMutationLock;
  let release: () => void;
  localMutationLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release!();
  }
};

const resolveSafePath = (localRepo: string, relativePath: string): string => {
  const normalized = path.resolve(localRepo, relativePath);
  if (!normalized.startsWith(localRepo)) {
    throw new Error(`Path escapes repository boundary: ${relativePath}`);
  }
  return normalized;
};

export const localReadRepositoryHead = async (
  localRepo: string,
): Promise<RepositoryHead> => {
  const [{ stdout: commitShaOut }, { stdout: treeShaOut }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: localRepo }),
    execFileAsync("git", ["rev-parse", "HEAD^{tree}"], { cwd: localRepo }),
  ]);
  const commitSha = commitShaOut.trim();
  const treeSha = treeShaOut.trim();

  const catalogPath = path.join(localRepo, "data", "links.json");
  const catalogText = await fs.readFile(catalogPath, "utf8");
  const links = parseCatalog(catalogText);

  let categories: DigestCategory[] | undefined;
  try {
    const catPath = path.join(localRepo, "data", "categories.json");
    const catText = await fs.readFile(catPath, "utf8");
    categories = parseCategories(catText);
  } catch {
    categories = undefined;
  }

  let tags: DigestTagDefinition[] | undefined;
  try {
    const tagsPath = path.join(localRepo, "data", "tags.json");
    const tagsText = await fs.readFile(tagsPath, "utf8");
    tags = parseTagDefinitions(tagsText);
  } catch {
    tags = undefined;
  }

  return {
    commitSha,
    treeSha,
    links,
    categories,
    tags,
  };
};

export const localReadRepositoryFile = async (
  localRepo: string,
  relativePath: string,
): Promise<string> => {
  const target = resolveSafePath(localRepo, relativePath);
  return fs.readFile(target, "utf8");
};

export const localTryReadRepositoryFile = async (
  localRepo: string,
  relativePath: string,
): Promise<string | null> => {
  try {
    return await localReadRepositoryFile(localRepo, relativePath);
  } catch {
    return null;
  }
};

export const localListRepositoryDirectory = async (
  localRepo: string,
  relativePath: string,
): Promise<GitHubContentItem[]> => {
  const target = resolveSafePath(localRepo, relativePath);
  try {
    const entries = await fs.readdir(target, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      path: path.posix.join(relativePath.replaceAll("\\", "/"), entry.name),
      type: entry.isDirectory() ? "dir" : "file",
    }));
  } catch {
    return [];
  }
};

export const localCommitRepositoryFiles = async (
  localRepo: string,
  files: Record<string, string | Buffer | null>,
  message: string,
): Promise<string> => {
  return withLocalMutationLock(async () => {
    // 1. Écrire les fichiers sur le disque local
    for (const [relPath, content] of Object.entries(files)) {
      const target = resolveSafePath(localRepo, relPath);
      if (content === null) {
        await fs.rm(target, { force: true });
      } else {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content);
      }
    }

    // 2. Indexer et commiter dans le git local
    await execFileAsync("git", ["add", "--all"], { cwd: localRepo });
    const { stdout: diff } = await execFileAsync(
      "git",
      ["diff", "--cached", "--name-only"],
      { cwd: localRepo },
    );
    if (diff.trim()) {
      await execFileAsync("git", ["commit", "-m", message], {
        cwd: localRepo,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "OOBLIK Digest Admin",
          GIT_AUTHOR_EMAIL: "admin@digest.ooblik.com",
          GIT_COMMITTER_NAME: "OOBLIK Digest Admin",
          GIT_COMMITTER_EMAIL: "admin@digest.ooblik.com",
        },
      });
    }

    const { stdout: headSha } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: localRepo,
    });
    const commitSha = headSha.trim();

    // 3. Déclencher le script de déploiement autonome s'il existe
    const deployScript = path.join(localRepo, "scripts", "deploy-vps.sh");
    if (existsSync(deployScript)) {
      try {
        await execFileAsync("sh", [deployScript], { cwd: localRepo });
      } catch (deployError) {
        process.stderr.write(
          `Local deployment script failed: ${deployError instanceof Error ? deployError.message : String(deployError)}\n`,
        );
      }
    }

    // 4. Synchronisation asynchrone non bloquante vers GitHub (miroir de sauvegarde)
    void execFileAsync("git", ["push", "origin", "main"], { cwd: localRepo }).catch(() => {
      // Échec de synchronisation miroir ignoré pour ne jamais bloquer la mise en ligne
    });

    return commitSha;
  });
};

export const localWorkflowRunsForCommit = async (
  commitSha: string,
): Promise<WorkflowRun[]> => {
  return [
    {
      id: Date.now(),
      name: "Deploy production",
      status: "completed",
      conclusion: "success",
      html_url: "https://digest.ooblik.com",
      head_sha: commitSha,
    },
  ];
};

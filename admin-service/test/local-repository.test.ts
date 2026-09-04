import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  localCommitRepositoryFiles,
  localListRepositoryDirectory,
  localReadRepositoryFile,
  localReadRepositoryHead,
  localTryReadRepositoryFile,
  localWorkflowRunsForCommit,
} from "../src/local-repository.js";

const execFileAsync = promisify(execFile);

const createTempGitRepo = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "digest-test-repo-"));
  await execFileAsync("git", ["init", "-b", "main"], { cwd: dir });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: dir });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: dir });

  // Initialiser les fichiers minimaux
  await fs.mkdir(path.join(dir, "data"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "data", "links.json"),
    JSON.stringify([
      {
        id: "test-link-1",
        title: "Test Link",
        url: "https://example.com",
        category: "Architecture & Typographie",
        added: "2026-09-04",
      },
    ]),
  );
  await fs.writeFile(
    path.join(dir, "data", "categories.json"),
    JSON.stringify([
      {
        name: "Architecture & Typographie",
        description: "Catégorie de test",
      },
    ]),
  );
  await fs.writeFile(
    path.join(dir, "data", "tags.json"),
    JSON.stringify([
      {
        name: "design",
        description: "Tag de test",
        active: true,
      },
    ]),
  );

  await execFileAsync("git", ["add", "--all"], { cwd: dir });
  await execFileAsync("git", ["commit", "-m", "Initial commit"], { cwd: dir });

  return dir;
};

test("localReadRepositoryHead lit l'état du dépôt git local", async () => {
  const dir = await createTempGitRepo();
  try {
    const head = await localReadRepositoryHead(dir);
    assert.ok(head.commitSha);
    assert.ok(head.treeSha);
    assert.equal(head.links.length, 1);
    assert.equal(head.links[0]?.id, "test-link-1");
    assert.equal(head.categories?.length, 1);
    assert.equal(head.categories[0]?.name, "Architecture & Typographie");
    assert.equal(head.tags?.length, 1);
    assert.equal(head.tags[0]?.name, "design");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("localReadRepositoryFile et localTryReadRepositoryFile lisent les fichiers du dépôt", async () => {
  const dir = await createTempGitRepo();
  try {
    const content = await localReadRepositoryFile(dir, "data/links.json");
    assert.match(content, /test-link-1/);

    const tryContent = await localTryReadRepositoryFile(dir, "data/links.json");
    assert.equal(tryContent, content);

    const missing = await localTryReadRepositoryFile(dir, "data/non-existent.json");
    assert.equal(missing, null);

    await assert.rejects(
      () => localReadRepositoryFile(dir, "../outside.txt"),
      /Path escapes repository boundary/,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("localListRepositoryDirectory liste le contenu d'un répertoire relatif", async () => {
  const dir = await createTempGitRepo();
  try {
    const items = await localListRepositoryDirectory(dir, "data");
    assert.ok(items.some((item) => item.name === "links.json" && item.type === "file"));
    assert.ok(items.some((item) => item.name === "categories.json" && item.type === "file"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("localCommitRepositoryFiles écrit, supprime et commite des fichiers localement", async () => {
  const dir = await createTempGitRepo();
  try {
    const newCommitSha = await localCommitRepositoryFiles(
      dir,
      {
        "data/new-file.txt": "Contenu du nouveau fichier",
        "data/tags.json": null,
      },
      "Ajout d'un fichier et suppression des tags",
    );

    assert.ok(newCommitSha);
    const newContent = await localReadRepositoryFile(dir, "data/new-file.txt");
    assert.equal(newContent, "Contenu du nouveau fichier");

    const deleted = await localTryReadRepositoryFile(dir, "data/tags.json");
    assert.equal(deleted, null);

    const { stdout: log } = await execFileAsync("git", ["log", "-n", "1", "--oneline"], {
      cwd: dir,
    });
    assert.match(log, /Ajout d'un fichier et suppression des tags/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("localWorkflowRunsForCommit retourne un statut complété avec succès", async () => {
  const runs = await localWorkflowRunsForCommit("dummy-sha-1234");
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.name, "Deploy production");
  assert.equal(runs[0]?.status, "completed");
  assert.equal(runs[0]?.conclusion, "success");
  assert.equal(runs[0]?.head_sha, "dummy-sha-1234");
});

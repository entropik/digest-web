import { createAppAuth } from "@octokit/auth-app";
import {
  changeVisibility,
  parseCatalog,
  publicAdminLink,
  serializeCatalog,
  type VisibilityAction,
} from "./catalog.js";
import { config } from "./config.js";

type GitHubRef = { object: { sha: string } };
type GitHubCommit = { sha: string; tree: { sha: string } };
type GitHubBlob = { sha: string };
type GitHubTree = { sha: string };

class GitHubResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const appAuth = createAppAuth({
  appId: config.githubAppId,
  privateKey: config.githubPrivateKey,
  installationId: config.githubInstallationId,
});

const installationToken = async (): Promise<string> => {
  const authentication = await appAuth({
    type: "installation",
    installationId: config.githubInstallationId,
    repositories: [config.repositoryName],
    permissions: { contents: "write" },
  });
  return authentication.token;
};

const request = async <T>(
  path: string,
  init: RequestInit = {},
  accept = "application/vnd.github+json",
): Promise<T> => {
  const token = await installationToken();
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "digest-admin-service",
      "X-GitHub-Api-Version": "2026-03-10",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new GitHubResponseError(
      `GitHub request failed (${response.status}): ${detail.slice(0, 500)}`,
      response.status,
    );
  }
  return (await response.json()) as T;
};

const requestText = async (path: string): Promise<string> => {
  const token = await installationToken();
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github.raw+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "digest-admin-service",
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
  if (!response.ok) {
    throw new GitHubResponseError(
      `GitHub catalog read failed (${response.status})`,
      response.status,
    );
  }
  return response.text();
};

const repositoryPath = `/repos/${encodeURIComponent(config.repositoryOwner)}/${encodeURIComponent(config.repositoryName)}`;

const readHead = async () => {
  const ref = await request<GitHubRef>(
    `${repositoryPath}/git/ref/heads/${encodeURIComponent(config.repositoryBranch)}`,
  );
  const commit = await request<GitHubCommit>(
    `${repositoryPath}/git/commits/${ref.object.sha}`,
  );
  const catalog = await requestText(
    `${repositoryPath}/contents/data/links.json?ref=${encodeURIComponent(ref.object.sha)}`,
  );
  return {
    commitSha: ref.object.sha,
    treeSha: commit.tree.sha,
    links: parseCatalog(catalog),
  };
};

const commitCatalog = async (
  parentSha: string,
  treeSha: string,
  content: string,
  message: string,
): Promise<string> => {
  const blob = await request<GitHubBlob>(`${repositoryPath}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content, encoding: "utf-8" }),
  });
  const tree = await request<GitHubTree>(`${repositoryPath}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: treeSha,
      tree: [
        {
          path: "data/links.json",
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        },
      ],
    }),
  });
  const commit = await request<GitHubCommit>(`${repositoryPath}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [parentSha],
    }),
  });
  await request<GitHubRef>(
    `${repositoryPath}/git/refs/heads/${encodeURIComponent(config.repositoryBranch)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    },
  );
  return commit.sha;
};

export const listHiddenLinks = async () => {
  const head = await readHead();
  return head.links
    .filter((link) => link.visibility === "hidden")
    .map(publicAdminLink)
    .sort((left, right) =>
      String(right.hiddenAt).localeCompare(String(left.hiddenAt)),
    );
};

export const updateLinkVisibility = async (
  id: string,
  action: VisibilityAction,
) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const head = await readHead();
    const mutation = changeVisibility(head.links, id, action);
    if (!mutation.changed) {
      return {
        changed: false,
        state: action === "hide" ? "hidden" : "visible",
        commit: head.commitSha,
        link: publicAdminLink(mutation.link),
      };
    }

    const verb = action === "hide" ? "Masquer" : "Restaurer";
    try {
      const commit = await commitCatalog(
        head.commitSha,
        head.treeSha,
        serializeCatalog(mutation.links),
        `${verb} ${mutation.link.title}`,
      );
      return {
        changed: true,
        state: action === "hide" ? "hidden" : "visible",
        commit,
        link: publicAdminLink(mutation.link),
      };
    } catch (error) {
      if (
        attempt === 0 &&
        error instanceof GitHubResponseError &&
        [409, 422].includes(error.status)
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Unable to update the catalog after a concurrent change");
};

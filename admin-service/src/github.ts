import { createAppAuth } from "@octokit/auth-app";
import {
  changePublishedMetadata,
  changeVisibility,
  parseCatalog,
  publicAdminLink,
  serializeCatalog,
  type DigestLink,
  type PublishedMetadata,
  type VisibilityAction,
} from "./catalog.js";
import { config } from "./config.js";

type GitHubRef = { object: { sha: string } };
type GitHubCommit = { sha: string; tree: { sha: string } };
type GitHubBlob = { sha: string };
type GitHubTree = { sha: string };
type GitHubContentItem = { name: string; path: string; type: string };
type WorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  head_sha: string;
};

export class GitHubResponseError extends Error {
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
    permissions: { contents: "write", actions: "read" },
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
  if (response.status === 204) return undefined as T;
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
      `GitHub content read failed (${response.status})`,
      response.status,
    );
  }
  return response.text();
};

const repositoryPath = `/repos/${encodeURIComponent(config.repositoryOwner)}/${encodeURIComponent(config.repositoryName)}`;
const contentPath = (path: string, ref: string) =>
  `${repositoryPath}/contents/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}?ref=${encodeURIComponent(ref)}`;

export const readRepositoryHead = async () => {
  const ref = await request<GitHubRef>(
    `${repositoryPath}/git/ref/heads/${encodeURIComponent(config.repositoryBranch)}`,
  );
  const commit = await request<GitHubCommit>(
    `${repositoryPath}/git/commits/${ref.object.sha}`,
  );
  const catalog = await requestText(
    contentPath("data/links.json", ref.object.sha),
  );
  return {
    commitSha: ref.object.sha,
    treeSha: commit.tree.sha,
    links: parseCatalog(catalog),
  };
};

export const readRepositoryFile = (path: string, ref: string): Promise<string> =>
  requestText(contentPath(path, ref));

export const tryReadRepositoryFile = async (
  path: string,
  ref: string,
): Promise<string | null> => {
  try {
    return await readRepositoryFile(path, ref);
  } catch (error) {
    if (error instanceof GitHubResponseError && error.status === 404) return null;
    throw error;
  }
};

export const listRepositoryDirectory = (
  path: string,
  ref: string,
): Promise<GitHubContentItem[]> =>
  request<GitHubContentItem[]>(contentPath(path, ref));

export const commitRepositoryFiles = async (
  parentSha: string,
  treeSha: string,
  files: Record<string, string>,
  message: string,
): Promise<string> => {
  const entries = [];
  for (const [path, content] of Object.entries(files)) {
    const blob = await request<GitHubBlob>(`${repositoryPath}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "utf-8" }),
    });
    entries.push({
      path,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }
  const tree = await request<GitHubTree>(`${repositoryPath}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: treeSha,
      tree: entries,
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

const commitCatalogMutation = async (
  mutation: (links: DigestLink[]) => {
    links: DigestLink[];
    link: DigestLink;
    changed: boolean;
  },
  message: (link: DigestLink) => string,
) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const head = await readRepositoryHead();
    const result = mutation(head.links);
    if (!result.changed) {
      return {
        changed: false,
        commit: head.commitSha,
        link: publicAdminLink(result.link),
      };
    }
    try {
      const commit = await commitRepositoryFiles(
        head.commitSha,
        head.treeSha,
        { "data/links.json": serializeCatalog(result.links) },
        message(result.link),
      );
      return {
        changed: true,
        commit,
        link: publicAdminLink(result.link),
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

export const listHiddenLinks = async () => {
  const head = await readRepositoryHead();
  return head.links
    .filter((link) => link.visibility === "hidden")
    .map(publicAdminLink)
    .sort((left, right) =>
      String(right.hiddenAt).localeCompare(String(left.hiddenAt)),
    );
};

export const listAdminLinks = async (query = "", limit = 100) => {
  const head = await readRepositoryHead();
  const needle = query.trim().toLocaleLowerCase("fr");
  return head.links
    .filter((link) => {
      if (!needle) return true;
      return [link.title, link.url, link.category, link.description ?? ""]
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(needle);
    })
    .slice(0, Math.max(1, Math.min(limit, 200)))
    .map(publicAdminLink);
};

export const updateLinkVisibility = async (
  id: string,
  action: VisibilityAction,
) => {
  const verb = action === "hide" ? "Masquer" : "Restaurer";
  const result = await commitCatalogMutation(
    (links) => changeVisibility(links, id, action),
    (link) => `${verb} ${link.title}`,
  );
  return {
    ...result,
    state: action === "hide" ? "hidden" : "visible",
  };
};

export const updatePublishedLink = (
  id: string,
  metadata: PublishedMetadata,
) =>
  commitCatalogMutation(
    (links) => changePublishedMetadata(links, id, metadata),
    (link) => `Corriger ${link.title}`,
  );

export const workflowRunsForCommit = async (
  commitSha: string,
): Promise<WorkflowRun[]> => {
  const payload = await request<{ workflow_runs: WorkflowRun[] }>(
    `${repositoryPath}/actions/runs?head_sha=${encodeURIComponent(commitSha)}&per_page=100`,
  );
  return payload.workflow_runs;
};

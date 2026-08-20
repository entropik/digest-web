import { createAppAuth } from "@octokit/auth-app";
import {
  addPublishedTags,
  changePublishedMetadata,
  changeVisibility,
  parseCatalog,
  parseCategories,
  publicAdminLink,
  serializeCatalog,
  type DigestLink,
  type DigestCategory,
  type PublishedMetadata,
  type VisibilityAction,
} from "./catalog.js";
import { config } from "./config.js";
import {
  measureTiming,
  measureTimingSync,
  recordTiming,
  startTimer,
} from "./observability.js";
import {
  fetchWithDeadline,
  NetworkDeadlineError,
  withDeadline,
} from "./network.js";

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
type RepositoryHead = {
  commitSha: string;
  treeSha: string;
  links: DigestLink[];
  categories?: DigestCategory[];
};
type RepositoryHeadDependencies = {
  readRef: () => Promise<string>;
  readCommit: (sha: string) => Promise<GitHubCommit>;
  readCatalog: (sha: string) => Promise<string>;
  readCategories?: (sha: string) => Promise<string | null>;
};
type RepositoryHeadReader = {
  invalidate: () => void;
  read: () => Promise<RepositoryHead>;
};

export const repositoryBlobBody = (content: string | Buffer) => {
  const binary = Buffer.isBuffer(content);
  return {
    content: binary ? content.toString("base64") : content,
    encoding: binary ? "base64" : "utf-8",
  } as const;
};

const READ_CACHE_TTL_MS = 30_000;
const GITHUB_READ_TIMEOUT_MS = 15_000;
const GITHUB_WRITE_TIMEOUT_MS = 30_000;
let cachedRepositoryHead:
  | { expiresAt: number; value: RepositoryHead }
  | undefined;
let repositoryHeadRequest: Promise<RepositoryHead> | undefined;
let repositoryHeadGeneration = 0;

export class GitHubResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class GitHubMutationOutcomeUnknownError extends Error {
  constructor(readonly operation: string) {
    super(`GitHub mutation outcome is unknown: ${operation}`);
    this.name = "GitHubMutationOutcomeUnknownError";
  }
}

const appAuth = createAppAuth({
  appId: config.githubAppId,
  privateKey: config.githubPrivateKey,
  installationId: config.githubInstallationId,
});

const installationToken = async (): Promise<string> => {
  let authentication;
  try {
    authentication = await measureTiming("github.auth", () =>
      withDeadline(
        () =>
          appAuth({
            type: "installation",
            installationId: config.githubInstallationId,
            repositories: [config.repositoryName],
            permissions: { contents: "write", actions: "read" },
          }),
        GITHUB_READ_TIMEOUT_MS,
      ),
    );
  } catch (error) {
    if (error instanceof NetworkDeadlineError) {
      throw new GitHubResponseError("GitHub authentication timed out", 504);
    }
    throw error;
  }
  return authentication.token;
};

const request = async <T>(
  path: string,
  init: RequestInit = {},
  accept = "application/vnd.github+json",
  outcomeUnknownOnTimeout = false,
): Promise<T> => {
  const token = await installationToken();
  try {
    return await fetchWithDeadline(
      fetch,
      `https://api.github.com${path}`,
      {
        ...init,
        headers: {
          Accept: accept,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "digest-admin-service",
          "X-GitHub-Api-Version": "2026-03-10",
          ...init.headers,
        },
      },
      init.method && init.method !== "GET"
        ? GITHUB_WRITE_TIMEOUT_MS
        : GITHUB_READ_TIMEOUT_MS,
      async (response) => {
        if (!response.ok) {
          throw new GitHubResponseError(
            `GitHub request failed (${response.status})`,
            response.status,
          );
        }
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      },
    );
  } catch (error) {
    if (error instanceof NetworkDeadlineError) {
      if (outcomeUnknownOnTimeout) {
        throw new GitHubMutationOutcomeUnknownError(path);
      }
      throw new GitHubResponseError("GitHub request timed out", 504);
    }
    throw error;
  }
};

const requestText = async (path: string): Promise<string> => {
  const token = await installationToken();
  try {
    return await fetchWithDeadline(
      fetch,
      `https://api.github.com${path}`,
      {
        headers: {
          Accept: "application/vnd.github.raw+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "digest-admin-service",
          "X-GitHub-Api-Version": "2026-03-10",
        },
      },
      GITHUB_READ_TIMEOUT_MS,
      async (response) => {
        if (!response.ok) {
          throw new GitHubResponseError(
            `GitHub content read failed (${response.status})`,
            response.status,
          );
        }
        return response.text();
      },
    );
  } catch (error) {
    if (error instanceof NetworkDeadlineError) {
      throw new GitHubResponseError("GitHub content read timed out", 504);
    }
    throw error;
  }
};

const repositoryPath = `/repos/${encodeURIComponent(config.repositoryOwner)}/${encodeURIComponent(config.repositoryName)}`;
const contentPath = (path: string, ref: string) =>
  `${repositoryPath}/contents/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}?ref=${encodeURIComponent(ref)}`;

export const createRepositoryHeadReader = (
  dependencies: RepositoryHeadDependencies,
): RepositoryHeadReader => {
  let snapshot: RepositoryHead | undefined;
  let generation = 0;
  let latestRead = 0;

  return {
    invalidate: () => {
      generation += 1;
      snapshot = undefined;
    },
    read: async () => {
      const readGeneration = generation;
      const readId = ++latestRead;
      const commitSha = await measureTiming("github.ref", dependencies.readRef);
      if (snapshot?.commitSha === commitSha) return snapshot;

      const [commit, catalog, categoryCatalog] = await Promise.all([
        measureTiming("github.commit", () =>
          dependencies.readCommit(commitSha),
        ),
        measureTiming("github.catalog.download", () =>
          dependencies.readCatalog(commitSha),
        ),
        dependencies.readCategories
          ? measureTiming("github.categories.download", () =>
              dependencies.readCategories!(commitSha),
            )
          : Promise.resolve(null),
      ]);
      const next = {
        commitSha,
        treeSha: commit.tree.sha,
        links: measureTimingSync("github.catalog.parse", () =>
          parseCatalog(catalog),
        ),
        categories: categoryCatalog
          ? measureTimingSync("github.categories.parse", () =>
              parseCategories(categoryCatalog),
            )
          : undefined,
      };
      if (readGeneration === generation && readId === latestRead) {
        snapshot = next;
      }
      return next;
    },
  };
};

const repositoryHeadReader = createRepositoryHeadReader({
  readRef: async () => {
    const ref = await request<GitHubRef>(
      `${repositoryPath}/git/ref/heads/${encodeURIComponent(config.repositoryBranch)}`,
    );
    return ref.object.sha;
  },
  readCommit: (sha) =>
    request<GitHubCommit>(`${repositoryPath}/git/commits/${sha}`),
  readCatalog: (sha) => requestText(contentPath("data/links.json", sha)),
  readCategories: async (sha) => {
    try {
      return await requestText(contentPath("data/categories.json", sha));
    } catch (error) {
      if (error instanceof GitHubResponseError && error.status === 404) return null;
      throw error;
    }
  },
});

export const readRepositoryHead = (): Promise<RepositoryHead> =>
  repositoryHeadReader.read();

export const readCachedRepositoryHead = async (): Promise<RepositoryHead> => {
  const startedAt = startTimer();
  const now = Date.now();
  if (cachedRepositoryHead && cachedRepositoryHead.expiresAt > now) {
    recordTiming("github.cache", startedAt, { cache: "hit" });
    return cachedRepositoryHead.value;
  }
  if (repositoryHeadRequest) {
    try {
      const value = await repositoryHeadRequest;
      recordTiming("github.cache", startedAt, {
        cache: "shared",
        status: "success",
      });
      return value;
    } catch (error) {
      recordTiming("github.cache", startedAt, {
        cache: "shared",
        status: "error",
      });
      throw error;
    }
  }

  recordTiming("github.cache", startedAt, { cache: "miss" });
  const generation = repositoryHeadGeneration;
  const request = readRepositoryHead()
    .then((value) => {
      if (generation === repositoryHeadGeneration) {
        cachedRepositoryHead = {
          expiresAt: Date.now() + READ_CACHE_TTL_MS,
          value,
        };
      }
      return value;
    })
    .finally(() => {
      if (repositoryHeadRequest === request) {
        repositoryHeadRequest = undefined;
      }
    });
  repositoryHeadRequest = request;
  return request;
};

const invalidateRepositoryHeadCache = (): void => {
  repositoryHeadGeneration += 1;
  cachedRepositoryHead = undefined;
  repositoryHeadRequest = undefined;
  repositoryHeadReader.invalidate();
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
  files: Record<string, string | Buffer>,
  message: string,
): Promise<string> => {
  const entries = [];
  for (const [path, content] of Object.entries(files)) {
    const blob = await request<GitHubBlob>(`${repositoryPath}/git/blobs`, {
      method: "POST",
      body: JSON.stringify(repositoryBlobBody(content)),
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
    "application/vnd.github+json",
    true,
  );
  invalidateRepositoryHeadCache();
  return commit.sha;
};

const commitCatalogMutation = async (
  mutation: (links: DigestLink[]) => {
    links: DigestLink[];
    link: DigestLink;
    changed: boolean;
    reactivated?: boolean;
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
        reactivated: result.reactivated ?? false,
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
        reactivated: result.reactivated ?? false,
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

export const addTagsToPublishedLink = (id: string, tags: string[]) =>
  commitCatalogMutation(
    (links) => addPublishedTags(links, id, tags),
    (link) => `Ajouter des tags à ${link.title}`,
  );

export const workflowRunsForCommit = async (
  commitSha: string,
): Promise<WorkflowRun[]> => {
  const payload = await request<{ workflow_runs: WorkflowRun[] }>(
    `${repositoryPath}/actions/runs?head_sha=${encodeURIComponent(commitSha)}&per_page=100`,
  );
  return payload.workflow_runs;
};

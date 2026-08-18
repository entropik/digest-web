import { randomUUID } from "node:crypto";
import {
  catalogTaxonomy,
  changeVisibility,
  publicAdminLink,
  serializeCatalog,
  type PublishedMetadata,
  type VisibilityAction,
} from "./catalog.js";
import { config } from "./config.js";
import { CurationStore } from "./curation-db.js";
import type {
  CurationDraft,
  DigestPublication,
  DraftInput,
  PublicationInput,
} from "./curation-types.js";
import { parseEdition, renderEdition } from "./editions.js";
import {
  addTagsToPublishedLink,
  GitHubResponseError,
  commitRepositoryFiles,
  GitHubMutationOutcomeUnknownError,
  listRepositoryDirectory,
  readCachedRepositoryHead,
  readRepositoryHead,
  tryReadRepositoryFile,
  updatePublishedLink,
  workflowRunsForCommit,
} from "./github.js";
import { recordTiming, startTimer } from "./observability.js";
import { buildPublicationFiles } from "./publication.js";
import { deploymentWorkflowProgress } from "./publication-workflow.js";
import {
  generateOptimizedLinkedInImage,
  generateOptimizedSocialImage,
} from "./social-image.js";
import { canonicalizePublicUrl } from "./urls.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CurationError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

const cleanText = (value: unknown, maximum: number): string =>
  String(value ?? "")
    .replace(/\0/g, "")
    .trim()
    .slice(0, maximum);

const cleanTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const candidate of value) {
    const tag = cleanText(candidate, 80).replace(/^#+/, "");
    const key = tag.toLocaleLowerCase("fr");
    if (tag && !seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags.slice(0, 12);
};

const validDate = (value: string): boolean => {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

export const normalizeDraftInput = (
  input: DraftInput,
  taxonomy?: { categories: string[]; tags: string[] },
): Required<DraftInput> => {
  const url = canonicalizePublicUrl(input.url);
  const title = cleanText(input.title, 240);
  const category = cleanText(input.category, 100);
  const description = cleanText(input.description, 1_200);
  const privateNote = cleanText(input.privateNote, 8_000);
  const tags = cleanTags(input.tags);

  if (taxonomy && category && !taxonomy.categories.includes(category)) {
    throw new CurationError("INVALID_CATEGORY");
  }
  return { url, title, category, description, privateNote, tags };
};

export const missingPublicationFields = (draft: CurationDraft): string[] => {
  const missing: string[] = [];
  if (!draft.title) missing.push("title");
  if (!draft.category) missing.push("category");
  if (!draft.description) missing.push("description");
  if (!draft.tags.length) missing.push("tags");
  return missing;
};

const metadataInput = (
  value: unknown,
  taxonomy: { categories: string[]; tags: string[] },
): PublishedMetadata => {
  const body = (value ?? {}) as Record<string, unknown>;
  const url = canonicalizePublicUrl(String(body.url ?? ""));
  const title = cleanText(body.title, 240);
  const category = cleanText(body.category, 100);
  const description = cleanText(body.description, 1_200);
  const tags = cleanTags(body.tags);
  const reactivate = body.reactivate === true;
  if (!title || !category || !description || !tags.length) {
    throw new CurationError("INCOMPLETE_LINK");
  }
  if (!taxonomy.categories.includes(category)) {
    throw new CurationError("INVALID_CATEGORY");
  }
  return { url, title, category, description, tags, reactivate };
};

const editionPath = (date: string): string => `content/archives/${date}.md`;
const AMBIGUOUS_COMMIT_GRACE_MS = 2 * 60 * 1_000;

type PublicationDependencies = {
  readRepositoryHead: typeof readRepositoryHead;
  tryReadRepositoryFile: typeof tryReadRepositoryFile;
  commitRepositoryFiles: typeof commitRepositoryFiles;
  buildPublicationFiles: typeof buildPublicationFiles;
};

const publicationDependencies: PublicationDependencies = {
  readRepositoryHead,
  tryReadRepositoryFile,
  commitRepositoryFiles,
  buildPublicationFiles,
};

export class CurationService {
  constructor(
    readonly store: CurationStore,
    private readonly publication: PublicationDependencies = publicationDependencies,
  ) {}

  async options() {
    const head = await readCachedRepositoryHead();
    return catalogTaxonomy(head.links);
  }

  async publishedLink(id: string) {
    const head = await readCachedRepositoryHead();
    const link = head.links.find(
      (candidate) => candidate.id === id && candidate.visibility !== "hidden",
    );
    if (!link) throw new CurationError("LINK_NOT_FOUND", 404);
    return link;
  }

  async updateLinkVisibility(id: string, action: VisibilityAction) {
    const verb = action === "hide" ? "Masquer" : "Restaurer";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const head = await readRepositoryHead();
      let result;
      try {
        result = changeVisibility(head.links, id, action);
      } catch (error) {
        if (error instanceof Error && error.message === "LINK_NOT_FOUND") {
          throw new CurationError("LINK_NOT_FOUND", 404);
        }
        throw error;
      }
      if (!result.changed) {
        return {
          changed: false,
          commit: head.commitSha,
          link: publicAdminLink(result.link),
          state: action === "hide" ? "hidden" : "visible",
        };
      }
      const date = result.link.added;
      const source = await tryReadRepositoryFile(
        editionPath(date),
        head.commitSha,
      );
      if (!source) throw new CurationError("EDITION_NOT_FOUND", 404);
      const edition = parseEdition(source);
      const socialInput = {
        digestDate: date,
        title: edition.title,
        description: edition.description,
        linkCount: result.links.filter(
          (link) => link.added === date && link.visibility !== "hidden",
        ).length,
      };
      const [socialImage, linkedInImage] = await Promise.all([
        generateOptimizedSocialImage(socialInput),
        generateOptimizedLinkedInImage(socialInput),
      ]);
      try {
        const commit = await commitRepositoryFiles(
          head.commitSha,
          head.treeSha,
          {
            "data/links.json": serializeCatalog(result.links),
            [`static/social/${date}.png`]: socialImage,
            [`static/social/${date}-linkedin.png`]: linkedInImage,
          },
          `${verb} ${result.link.title}`,
        );
        return {
          changed: true,
          commit,
          link: publicAdminLink(result.link),
          state: action === "hide" ? "hidden" : "visible",
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
    throw new Error("Unable to update link visibility after a concurrent change");
  }

  async bootstrap(rawUrl: string) {
    const startedAt = startTimer();
    let outcome: "available" | "draft" | "error" | "published" = "error";
    try {
      const url = canonicalizePublicUrl(rawUrl);
      const draft = this.store.findDraftByUrl(url);
      const head = await readCachedRepositoryHead();
      const options = catalogTaxonomy(head.links);

      if (draft?.state === "draft") {
        outcome = "draft";
        return { options, url, draft, published: null };
      }
      if (draft?.state === "published") {
        outcome = "published";
        return {
          options,
          url,
          draft: null,
          published: {
            id: draft.publishedLinkId,
            commit: draft.publishedCommit,
          },
        };
      }
      const published = head.links.find((link) => link.url === url);
      outcome = published ? "published" : "available";
      return {
        options,
        url,
        draft: null,
        published: published ? publicAdminLink(published) : null,
      };
    } finally {
      recordTiming("curation.bootstrap", startedAt, { outcome });
    }
  }

  async lookupUrl(rawUrl: string) {
    const url = canonicalizePublicUrl(rawUrl);
    const draft = this.store.findDraftByUrl(url);
    if (draft?.state === "draft") {
      return { url, draft, published: null };
    }
    if (draft?.state === "published") {
      return {
        url,
        draft: null,
        published: {
          id: draft.publishedLinkId,
          commit: draft.publishedCommit,
        },
      };
    }
    const head = await readCachedRepositoryHead();
    const published = head.links.find((link) => link.url === url);
    return {
      url,
      draft: null,
      published: published ? publicAdminLink(published) : null,
    };
  }

  async saveDraft(input: DraftInput) {
    const head = await readRepositoryHead();
    const taxonomy = catalogTaxonomy(head.links);
    const normalized = normalizeDraftInput(input, taxonomy);
    const existingDraft = this.store.findDraftByUrl(normalized.url);
    if (existingDraft) {
      if (existingDraft.state !== "draft") {
        throw new CurationError("ALREADY_PUBLISHED", 409, {
          linkId: existingDraft.publishedLinkId,
        });
      }
      const updated = this.store.updateDraft(existingDraft.id, normalized);
      return { draft: updated, existing: true };
    }
    const published = head.links.find((link) => link.url === normalized.url);
    if (published) {
      throw new CurationError("ALREADY_PUBLISHED", 409, {
        link: publicAdminLink(published),
      });
    }
    return { draft: this.store.createDraft(normalized), existing: false };
  }

  async updateDraft(id: string, input: Omit<DraftInput, "url">) {
    const draft = this.store.findDraft(id);
    if (!draft || draft.state !== "draft") {
      throw new CurationError("DRAFT_NOT_FOUND", 404);
    }
    const taxonomy = await this.options();
    const normalized = normalizeDraftInput(
      { ...input, url: draft.url },
      taxonomy,
    );
    const updated = this.store.updateDraft(id, normalized);
    if (!updated) throw new CurationError("DRAFT_NOT_FOUND", 404);
    return updated;
  }

  deleteDraft(id: string): void {
    if (!this.store.deleteDraft(id)) {
      throw new CurationError("DRAFT_NOT_FOUND", 404);
    }
  }

  private async preparePublication(input: PublicationInput) {
    if (!validDate(input.digestDate)) {
      throw new CurationError("INVALID_DIGEST_DATE");
    }
    if (
      !cleanText(input.title, 240) ||
      !cleanText(input.introduction, 10_000) ||
      !cleanText(input.seoDescription, 500)
    ) {
      throw new CurationError("INCOMPLETE_EDITION");
    }
    const uniqueIds = [...new Set(input.draftIds)];
    if (!uniqueIds.length) throw new CurationError("EMPTY_PUBLICATION");
    const drafts = uniqueIds.map((id) => this.store.findDraft(id));
    if (drafts.some((draft) => !draft || draft.state !== "draft")) {
      throw new CurationError("DRAFT_NOT_AVAILABLE", 409);
    }
    const concreteDrafts = drafts as CurationDraft[];
    const incomplete = concreteDrafts
      .map((draft) => ({
        id: draft.id,
        missing: missingPublicationFields(draft),
      }))
      .filter((item) => item.missing.length);
    if (incomplete.length) {
      throw new CurationError("INCOMPLETE_DRAFTS", 400, incomplete);
    }

    const head = await this.publication.readRepositoryHead();
    if (
      await this.publication.tryReadRepositoryFile(
        editionPath(input.digestDate),
        head.commitSha,
      )
    ) {
      throw new CurationError("EDITION_EXISTS", 409);
    }
    const taxonomy = catalogTaxonomy(head.links);
    const categories = new Set(taxonomy.categories);
    for (const draft of concreteDrafts) {
      if (!categories.has(draft.category)) {
        throw new CurationError("INVALID_CATEGORY", 400, { id: draft.id });
      }
      if (head.links.some((link) => link.url === draft.url)) {
        throw new CurationError("ALREADY_PUBLISHED", 409, { id: draft.id });
      }
    }
    if (new Set(concreteDrafts.map((draft) => draft.url)).size !== concreteDrafts.length) {
      throw new CurationError("DUPLICATE_DRAFT_URL", 409);
    }
    return { head, taxonomy, drafts: concreteDrafts };
  }

  async publish(input: PublicationInput): Promise<DigestPublication> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.requestId,
      )
    ) {
      throw new CurationError("INVALID_REQUEST_ID");
    }
    const existing = this.store.findPublication(input.requestId);
    if (existing) return this.recoverOrReturn(existing);

    const prepared = await this.preparePublication(input);
    this.store.createPublication({
      id: input.requestId,
      digestDate: input.digestDate,
      title: cleanText(input.title, 240),
      introduction: cleanText(input.introduction, 10_000),
      seoDescription: cleanText(input.seoDescription, 500),
    });

    let remoteCommitSucceeded = false;
    try {
      this.store.markDraftsPublishing(input.draftIds, input.requestId);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const head =
          attempt === 0
            ? prepared.head
            : await this.publication.readRepositoryHead();
        if (
          await this.publication.tryReadRepositoryFile(
            editionPath(input.digestDate),
            head.commitSha,
          )
        ) {
          throw new CurationError("EDITION_EXISTS", 409);
        }
        for (const draft of prepared.drafts) {
          if (head.links.some((link) => link.url === draft.url)) {
            throw new CurationError("ALREADY_PUBLISHED", 409, { id: draft.id });
          }
        }
        const publication = await this.publication.buildPublicationFiles({
          currentLinks: head.links,
          drafts: prepared.drafts,
          digestDate: input.digestDate,
          title: cleanText(input.title, 240),
          seoDescription: cleanText(input.seoDescription, 500),
          introduction: cleanText(input.introduction, 10_000),
        });
        try {
          const commitSha = await this.publication.commitRepositoryFiles(
            head.commitSha,
            head.treeSha,
            publication.files,
            `Publier le Digest du ${input.digestDate}`,
          );
          remoteCommitSucceeded = true;
          const committed = this.store.updatePublication(input.requestId, {
            state: "validating",
            commitSha,
            errorCode: null,
          });
          try {
            this.store.markDraftsPublished(
              input.requestId,
              commitSha,
              publication.linkIdsByDraft,
            );
          } catch (error) {
            console.error(
              `Publication ${input.requestId} committed but its draft audit state needs recovery`,
              error,
            );
          }
          return committed;
        } catch (error) {
          if (error instanceof GitHubMutationOutcomeUnknownError) {
            remoteCommitSucceeded = true;
            try {
              this.store.updatePublication(input.requestId, {
                state: "committing",
                errorCode: "GITHUB_COMMIT_OUTCOME_UNKNOWN",
              });
            } catch (persistenceError) {
              console.error(
                `Publication ${input.requestId} could not persist its GitHub ambiguity timestamp`,
                persistenceError,
              );
            }
          }
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
      throw new Error("CONCURRENT_UPDATE");
    } catch (error) {
      if (remoteCommitSucceeded) {
        console.error(
          `Publication ${input.requestId} committed remotely and awaiting local recovery`,
          error,
        );
        throw error;
      }
      this.store.restorePublishingDrafts(input.requestId);
      this.store.updatePublication(input.requestId, {
        state: "failed",
        errorCode: error instanceof CurationError ? error.code : "PUBLISH_FAILED",
      });
      throw error;
    }
  }

  private async recoverOrReturn(
    publication: DigestPublication,
  ): Promise<DigestPublication> {
    if (!["committing", "validating"].includes(publication.state)) {
      return publication;
    }
    const drafts = this.store
      .listDraftsByPublication(publication.id)
      .filter((draft) => draft.state === "publishing");
    if (!drafts.length) return publication;
    const head = await this.publication.readRepositoryHead();
    const recovered = drafts.every((draft) =>
      head.links.some(
        (link) =>
          link.url === draft.url && link.added === publication.digestDate,
      ),
    );
    const archive = await this.publication.tryReadRepositoryFile(
      editionPath(publication.digestDate),
      head.commitSha,
    );
    if (!recovered || !archive) {
      if (
        publication.state === "committing" &&
        !publication.commitSha &&
        publication.errorCode === "GITHUB_COMMIT_OUTCOME_UNKNOWN"
      ) {
        const ambiguityAge = Date.now() - new Date(publication.updatedAt).valueOf();
        if (ambiguityAge < AMBIGUOUS_COMMIT_GRACE_MS) return publication;
        this.store.restorePublishingDrafts(publication.id);
        return this.store.updatePublication(publication.id, {
          state: "failed",
          errorCode: "GITHUB_COMMIT_NOT_FOUND",
        });
      }
      return publication;
    }
    const linkIds = new Map(
      drafts.map((draft) => [
        draft.id,
        head.links.find((link) => link.url === draft.url)!.id,
      ]),
    );
    this.store.markDraftsPublished(publication.id, head.commitSha, linkIds);
    return this.store.updatePublication(publication.id, {
      state: "validating",
      commitSha: head.commitSha,
    });
  }

  async refreshPublication(id: string): Promise<DigestPublication> {
    const stored = this.store.findPublication(id);
    if (!stored) throw new CurationError("PUBLICATION_NOT_FOUND", 404);
    const publication = await this.recoverOrReturn(stored);
    if (
      ["live", "failed"].includes(publication.state) ||
      !publication.commitSha
    ) {
      return publication;
    }
    if (
      publication.lastCheckedAt &&
      Date.now() - new Date(publication.lastCheckedAt).valueOf() < 15_000
    ) {
      return publication;
    }

    const runs = await workflowRunsForCommit(publication.commitSha);
    const workflow = deploymentWorkflowProgress(runs);
    if (workflow.state === "failed") {
      return this.store.updatePublication(id, {
        state: "failed",
        validateUrl: null,
        deployUrl: workflow.workflowUrl,
        errorCode: "WORKFLOW_FAILED",
        checked: true,
      });
    }

    if (!workflow.workflowDone) {
      return this.store.updatePublication(id, {
        state: workflow.state,
        validateUrl: null,
        deployUrl: workflow.workflowUrl,
        checked: true,
      });
    }

    let live = false;
    try {
      const response = await fetch(
        `${config.origin}/archives/${publication.digestDate}/`,
        { headers: { "User-Agent": "digest-admin-service-deploy-check" } },
      );
      const html = response.ok ? await response.text() : "";
      const visibleText = html
        .replace(/<[^>]+>/g, " ")
        .replace(/&#(\d+);/g, (_, value: string) =>
          String.fromCodePoint(Number.parseInt(value, 10)),
        )
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'")
        .replace(/\s+/g, " ");
      live = response.ok && visibleText.includes(publication.title);
    } catch {
      live = false;
    }
    return this.store.updatePublication(id, {
      state: live ? "live" : "deploying",
      validateUrl: null,
      deployUrl: workflow.workflowUrl,
      checked: true,
    });
  }

  async editPublishedLink(id: string, body: unknown) {
    const head = await readRepositoryHead();
    const metadata = metadataInput(body, catalogTaxonomy(head.links));
    try {
      return await updatePublishedLink(id, metadata);
    } catch (error) {
      if (error instanceof Error && error.message === "DUPLICATE_LINK_URL") {
        throw new CurationError("DUPLICATE_LINK_URL", 409);
      }
      if (error instanceof Error && error.message === "LINK_NOT_FOUND") {
        throw new CurationError("LINK_NOT_FOUND", 404);
      }
      throw error;
    }
  }

  async addTagsToPublishedLink(id: string, body: unknown) {
    const input = (body ?? {}) as Record<string, unknown>;
    const tags = cleanTags(input.tags);
    if (!tags.length) throw new CurationError("INVALID_TAG");
    try {
      return await addTagsToPublishedLink(id, tags);
    } catch (error) {
      if (error instanceof Error && error.message === "LINK_NOT_FOUND") {
        throw new CurationError("LINK_NOT_FOUND", 404);
      }
      throw error;
    }
  }

  async listEditions() {
    const head = await readRepositoryHead();
    const items = await listRepositoryDirectory("content/archives", head.commitSha);
    return items
      .filter(
        (item) =>
          item.type === "file" &&
          /^\d{4}-\d{2}-\d{2}\.md$/.test(item.name),
      )
      .map((item) => item.name.slice(0, 10))
      .sort()
      .reverse();
  }

  async getEdition(date: string) {
    if (!validDate(date)) throw new CurationError("INVALID_DIGEST_DATE");
    const head = await readRepositoryHead();
    const source = await tryReadRepositoryFile(editionPath(date), head.commitSha);
    if (!source) throw new CurationError("EDITION_NOT_FOUND", 404);
    return parseEdition(source);
  }

  async updateEdition(
    date: string,
    body: { title?: unknown; introduction?: unknown; seoDescription?: unknown },
  ) {
    if (!validDate(date)) throw new CurationError("INVALID_DIGEST_DATE");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const head = await readRepositoryHead();
      const source = await tryReadRepositoryFile(
        editionPath(date),
        head.commitSha,
      );
      if (!source) throw new CurationError("EDITION_NOT_FOUND", 404);
      const current = parseEdition(source);
      const title = cleanText(body.title, 240);
      const description = cleanText(body.seoDescription, 500);
      const introduction = cleanText(body.introduction, 10_000);
      if (!title || !description || !introduction) {
        throw new CurationError("INCOMPLETE_EDITION");
      }
      const next = renderEdition({
        digestDate: date,
        title,
        description,
        introduction,
      });
      if (next === source) {
        return { changed: false, commit: head.commitSha, edition: current };
      }
      const socialInput = {
        digestDate: date,
        title,
        description,
        linkCount: head.links.filter(
          (link) => link.added === date && link.visibility !== "hidden",
        ).length,
      };
      const [socialImage, linkedInImage] = await Promise.all([
        generateOptimizedSocialImage(socialInput),
        generateOptimizedLinkedInImage(socialInput),
      ]);
      try {
        const commit = await commitRepositoryFiles(
          head.commitSha,
          head.treeSha,
          {
            [editionPath(date)]: next,
            [`static/social/${date}.png`]: socialImage,
            [`static/social/${date}-linkedin.png`]: linkedInImage,
          },
          `Corriger le Digest du ${date}`,
        );
        return {
          changed: true,
          commit,
          edition: parseEdition(next),
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
    throw new Error("CONCURRENT_UPDATE");
  }
}

export const newPublicationRequestId = (): string => randomUUID();

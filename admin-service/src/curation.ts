import { randomUUID } from "node:crypto";
import {
  catalogCategoryDefinitions,
  catalogTaxonomy,
  categoryUsage,
  changeEditionVisibility,
  changeVisibility,
  publicAdminLink,
  replaceCatalogTag,
  renameCategory,
  serializeCategories,
  serializeCatalog,
  tagUsage,
  type PublishedMetadata,
  type VisibilityAction,
} from "./catalog.js";
import { config } from "./config.js";
import { CurationStore } from "./curation-db.js";
import type {
  CurationDraft,
  DigestPublication,
  DraftInput,
  EditionTransitionInput,
  PublicationInput,
  TaxonomyMutationKind,
} from "./curation-types.js";
import {
  editEdition,
  parseEdition,
  setEditionDraft,
} from "./editions.js";
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
import {
  fetchWithDeadline,
  readResponseTextWithLimit,
} from "./network.js";
import { buildPublicationFiles } from "./publication.js";
import { deploymentWorkflowProgress } from "./publication-workflow.js";
import {
  generateOptimizedLinkedInImage,
  generateOptimizedSocialImage,
} from "./social-image.js";
import { canonicalizePublicUrl } from "./urls.js";
import {
  activeTagNames,
  canonicalizeTags,
  parseTagDefinitions,
  serializeTagDefinitions,
  tagLabelKey,
  type DigestTagDefinition,
} from "./tag-taxonomy.js";

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

const PUBLICATION_LIVE_TIMEOUT_MS = 10_000;
const PUBLICATION_HTML_LIMIT_BYTES = 256 * 1_024;

type PublicationLiveCheckOptions = {
  fetcher?: typeof globalThis.fetch;
  timeoutMs?: number;
  maximumBytes?: number;
};

export const publicationIsLive = async (
  publication: DigestPublication,
  options: PublicationLiveCheckOptions = {},
): Promise<boolean> => {
  try {
    const { response, html } = await fetchWithDeadline(
      options.fetcher ?? globalThis.fetch,
      `${config.origin}/archives/${publication.digestDate}/`,
      { headers: { "User-Agent": "digest-admin-service-deploy-check" } },
      options.timeoutMs ?? PUBLICATION_LIVE_TIMEOUT_MS,
      async (response) => ({
        response,
        html: response.ok
          ? await readResponseTextWithLimit(
              response,
              options.maximumBytes ?? PUBLICATION_HTML_LIMIT_BYTES,
            )
          : "",
      }),
    );
    if (publication.action === "unpublish") return response.status === 404;
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
    return response.ok && visibleText.includes(publication.title);
  } catch {
    return false;
  }
};

type CurationTaxonomy = {
  categories: string[];
  tags: string[];
  tagDefinitions?: DigestTagDefinition[];
  legacyTags?: string[];
};

const MAX_ACTIVE_TAGS = 5;

const cleanTags = (
  value: unknown,
  taxonomy?: CurationTaxonomy,
  preservedTags: string[] = [],
): string[] => {
  if (!Array.isArray(value)) return [];
  const candidates = value.map((candidate) => cleanText(candidate, 80));
  const definitions =
    taxonomy?.tagDefinitions ??
    (taxonomy?.tags ?? []).map((name) => ({ name, description: "", aliases: [] }));
  const normalized = canonicalizeTags(candidates, definitions, preservedTags);
  if (normalized.unknown.length) {
    throw new CurationError("UNKNOWN_TAG", 400, {
      tags: normalized.unknown,
    });
  }
  const active = new Set(activeTagNames(definitions));
  if (normalized.tags.filter((tag) => active.has(tag)).length > MAX_ACTIVE_TAGS) {
    throw new CurationError("TOO_MANY_THEMES", 400);
  }
  return normalized.tags;
};

const validDate = (value: string): boolean => {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

export const normalizeDraftInput = (
  input: DraftInput,
  taxonomy?: CurationTaxonomy,
): Required<DraftInput> => {
  const url = canonicalizePublicUrl(input.url);
  const title = cleanText(input.title, 240);
  const category = cleanText(input.category, 100);
  const description = cleanText(input.description, 1_200);
  const privateNote = cleanText(input.privateNote, 8_000);
  const tags = cleanTags(input.tags, taxonomy);

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
  return missing;
};

const metadataInput = (
  value: unknown,
  taxonomy: CurationTaxonomy,
  preservedTags: string[] = [],
): PublishedMetadata => {
  const body = (value ?? {}) as Record<string, unknown>;
  const url = canonicalizePublicUrl(String(body.url ?? ""));
  const title = cleanText(body.title, 240);
  const category = cleanText(body.category, 100);
  const description = cleanText(body.description, 1_200);
  const tags = cleanTags(body.tags, taxonomy, preservedTags);
  const reactivate = body.reactivate === true;
  if (!title || !category || !description) {
    throw new CurationError("INCOMPLETE_LINK");
  }
  if (!taxonomy.categories.includes(category)) {
    throw new CurationError("INVALID_CATEGORY");
  }
  return { url, title, category, description, tags, reactivate };
};

const editionPath = (date: string): string => `content/archives/${date}.md`;
const tagSlug = (value: string): string =>
  value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const tagPage = (definition: DigestTagDefinition): string => {
  const aliases = definition.aliases
    .map((alias) => `"/tags/${tagSlug(alias)}/"`)
    .filter((route) => route !== `"/tags/${tagSlug(definition.name)}/"`);
  return [
    "---",
    `title: "#${definition.name.replaceAll('"', '\\"')}"`,
    `tag: ${JSON.stringify(definition.name)}`,
    `tags: ${JSON.stringify([definition.name])}`,
    ...(aliases.length ? [`aliases: [${aliases.join(", ")}]`] : []),
    'generated_by: "digest-admin"',
    "---",
    "",
  ].join("\n");
};

const missingPublicationTagPages = async (
  tags: string[],
  head: Awaited<ReturnType<typeof readRepositoryHead>>,
  readFile: typeof tryReadRepositoryFile,
): Promise<Record<string, string>> => {
  // Already-public tags have validated routes, including historical aliases.
  const publicTags = new Set(head.links
    .filter((link) => link.visibility !== "hidden")
    .flatMap((link) => link.tags ?? []));
  const labelsByPath = new Map<string, Set<string>>();
  for (const tag of tags) {
    if (publicTags.has(tag)) continue;
    const slug = tagSlug(tag);
    if (!slug) throw new CurationError("INVALID_TAG");
    const path = `content/tags/${slug}.md`;
    const labels = labelsByPath.get(path) ?? new Set<string>();
    labels.add(tag);
    labelsByPath.set(path, labels);
  }
  const files: Record<string, string> = {};
  for (const [path, labels] of labelsByPath) {
    // Read at the parent commit, and never replace an existing editorial page.
    if (await readFile(path, head.commitSha) !== null) continue;
    const variants = [...labels];
    files[path] = [
      "---",
      `title: ${JSON.stringify(`#${variants[0]}`)}`,
      `tag: ${JSON.stringify(variants[0])}`,
      `tags: ${JSON.stringify(variants)}`,
      'generated_by: "digest-admin"',
      "---",
      "",
    ].join("\n");
  }
  return files;
};
const AMBIGUOUS_COMMIT_GRACE_MS = 2 * 60 * 1_000;

type PublicationDependencies = {
  readRepositoryHead: typeof readRepositoryHead;
  tryReadRepositoryFile: typeof tryReadRepositoryFile;
  commitRepositoryFiles: typeof commitRepositoryFiles;
  buildPublicationFiles: typeof buildPublicationFiles;
  publicationIsLive?: typeof publicationIsLive;
};

type RepositoryHead = Awaited<ReturnType<typeof readRepositoryHead>>;
type TaxonomyMutationPlan<Result extends Record<string, unknown>> = {
  files: Record<string, string | null>;
  message: string;
  result: Result;
};

type EditionDependencies = {
  readRepositoryHead: typeof readRepositoryHead;
  tryReadRepositoryFile: typeof tryReadRepositoryFile;
  listRepositoryDirectory: typeof listRepositoryDirectory;
  commitRepositoryFiles: typeof commitRepositoryFiles;
  generateOptimizedSocialImage: typeof generateOptimizedSocialImage;
  generateOptimizedLinkedInImage: typeof generateOptimizedLinkedInImage;
};

const publicationDependencies: PublicationDependencies = {
  readRepositoryHead,
  tryReadRepositoryFile,
  commitRepositoryFiles,
  buildPublicationFiles,
  publicationIsLive,
};

const editionDependencies: EditionDependencies = {
  readRepositoryHead,
  tryReadRepositoryFile,
  listRepositoryDirectory,
  commitRepositoryFiles,
  generateOptimizedSocialImage,
  generateOptimizedLinkedInImage,
};

export class CurationService {
  constructor(
    readonly store: CurationStore,
    private readonly publication: PublicationDependencies = publicationDependencies,
    private readonly edition: EditionDependencies = editionDependencies,
  ) {}

  private async durableTaxonomyMutation<Result extends Record<string, unknown>>(
    requestIdValue: unknown,
    kind: TaxonomyMutationKind,
    payload: Record<string, unknown>,
    plan: (head: RepositoryHead) => TaxonomyMutationPlan<Result>,
    remoteApplied: (head: RepositoryHead, result: Result) => boolean,
    applyLocal: (result: Result) => void,
  ): Promise<Result & { commit: string }> {
    const requestId = cleanText(requestIdValue, 100);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        requestId,
      )
    ) {
      throw new CurationError("INVALID_REQUEST_ID");
    }

    let operation = this.store.findTaxonomyMutation(requestId);
    if (
      operation &&
      (operation.kind !== kind ||
        JSON.stringify(operation.input) !== JSON.stringify(payload))
    ) {
      throw new CurationError("REQUEST_ID_CONFLICT", 409);
    }
    if (operation?.state === "complete") {
      return {
        ...(operation.result as Result),
        commit: operation.commitSha!,
      };
    }

    let commitSha = operation?.commitSha ?? null;
    if (operation?.state !== "applying" || !commitSha) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const head = await this.publication.readRepositoryHead();
        if (operation && remoteApplied(head, operation.result as Result)) {
          commitSha = head.commitSha;
          break;
        }

        const prepared = plan(head);
        operation = operation
          ? this.store.updateTaxonomyMutation(requestId, {
              result: prepared.result,
            })
          : this.store.createTaxonomyMutation({
              id: requestId,
              kind,
              payload,
              result: prepared.result,
            });
        try {
          commitSha = await this.publication.commitRepositoryFiles(
            head.commitSha,
            head.treeSha,
            prepared.files,
            prepared.message,
          );
          break;
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
    }
    if (!operation || !commitSha) throw new Error("CONCURRENT_UPDATE");

    operation = this.store.updateTaxonomyMutation(requestId, {
      state: "applying",
      commitSha,
    });
    applyLocal(operation.result as Result);
    operation = this.store.updateTaxonomyMutation(requestId, {
      state: "complete",
    });
    return {
      ...(operation.result as Result),
      commit: operation.commitSha!,
    };
  }

  async options() {
    const head = await readCachedRepositoryHead();
    const taxonomy = catalogTaxonomy(head.links, head.categories, head.tags);
    return {
      categories: taxonomy.categories,
      tags: taxonomy.tags,
      themes: taxonomy.tagDefinitions,
    };
  }

  async categories() {
    const head = await readCachedRepositoryHead();
    const categories = catalogCategoryDefinitions(head.links, head.categories);
    return {
      categories: categories.map((category) => ({
        ...category,
        linkCount: categoryUsage(head.links, category.name),
        draftCount: this.store.countActiveDraftsByCategory(category.name),
      })),
    };
  }

  async addCategory(value: unknown, descriptionValue: unknown) {
    const name = cleanText(value, 100);
    const description = cleanText(descriptionValue, 500);
    if (!name) throw new CurationError("INVALID_CATEGORY_NAME");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const head = await readRepositoryHead();
      const categories = catalogCategoryDefinitions(head.links, head.categories);
      if (
        categories.some(
          (category) =>
            category.name.localeCompare(name, "fr", { sensitivity: "base" }) === 0,
        )
      ) {
        throw new CurationError("CATEGORY_ALREADY_EXISTS", 409);
      }
      const next = [...categories, { name, description }].sort((a, b) =>
        a.name.localeCompare(b.name, "fr"),
      );
      try {
        const commit = await commitRepositoryFiles(
          head.commitSha,
          head.treeSha,
          { "data/categories.json": serializeCategories(next) },
          `Ajouter la catégorie ${name}`,
        );
        return {
          changed: true,
          commit,
          category: { name, description },
          categories: next,
        };
      } catch (error) {
        if (attempt === 0 && error instanceof GitHubResponseError && [409, 422].includes(error.status)) continue;
        throw error;
      }
    }
    throw new Error("CONCURRENT_UPDATE");
  }

  async renameCategory(
    currentValue: unknown,
    replacementValue: unknown,
    descriptionValue: unknown,
    requestIdValue: unknown,
  ) {
    const current = cleanText(currentValue, 100);
    const replacement = cleanText(replacementValue, 100);
    const description = cleanText(descriptionValue, 500);
    if (!current || !replacement) throw new CurationError("INVALID_CATEGORY_NAME");
    if (!this.store.findTaxonomyMutation(cleanText(requestIdValue, 100))) {
      const initialHead = await this.publication.readRepositoryHead();
      const initialCategories = catalogCategoryDefinitions(
        initialHead.links,
        initialHead.categories,
      );
      const existing = initialCategories.find(
        (category) => category.name === current,
      );
      if (!existing) throw new CurationError("CATEGORY_NOT_FOUND", 404);
      if (current === replacement && existing.description === description) {
        return {
          changed: false,
          category: existing,
          categories: initialCategories,
          migrated: { links: 0, drafts: 0 },
        };
      }
    }

    const payload = { current, replacement, description };
    return this.durableTaxonomyMutation(
      requestIdValue,
      "rename_category",
      payload,
      (head) => {
        const categories = catalogCategoryDefinitions(head.links, head.categories);
        let mutation;
        try {
          mutation = renameCategory(
            head.links,
            categories,
            current,
            replacement,
            description,
          );
        } catch (error) {
          if (error instanceof Error && error.message === "CATEGORY_NOT_FOUND") {
            throw new CurationError("CATEGORY_NOT_FOUND", 404);
          }
          if (
            error instanceof Error &&
            error.message === "CATEGORY_ALREADY_EXISTS"
          ) {
            throw new CurationError("CATEGORY_ALREADY_EXISTS", 409);
          }
          throw error;
        }
        const files: Record<string, string | null> = {
          "data/categories.json": serializeCategories(mutation.categories),
        };
        if (current !== replacement) {
          files["data/links.json"] = serializeCatalog(mutation.links);
        }
        return {
          files,
          message:
            current === replacement
              ? `Décrire la catégorie ${current}`
              : `Renommer la catégorie ${current} en ${replacement}`,
          result: {
            changed: true,
            category: { name: replacement, description },
            categories: mutation.categories,
            migrated: {
              links: categoryUsage(head.links, current),
              drafts:
                current === replacement
                  ? 0
                  : this.store.countActiveDraftsByCategory(current),
            },
          },
        };
      },
      (head) => {
        const categories = catalogCategoryDefinitions(head.links, head.categories);
        return (
          categories.some(
            (category) =>
              category.name === replacement &&
              category.description === description,
          ) &&
          (current === replacement ||
            (!categories.some((category) => category.name === current) &&
              !head.links.some((link) => link.category === current)))
        );
      },
      () => {
        if (current !== replacement) {
          this.store.renameActiveDraftCategory(current, replacement);
        }
      },
    );
  }

  async deleteCategory(value: unknown) {
    const name = cleanText(value, 100);
    if (!name) throw new CurationError("INVALID_CATEGORY_NAME");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const head = await readRepositoryHead();
      const categories = catalogCategoryDefinitions(head.links, head.categories);
      if (!categories.some((category) => category.name === name)) {
        throw new CurationError("CATEGORY_NOT_FOUND", 404);
      }
      const linkCount = categoryUsage(head.links, name);
      const draftCount = this.store.countActiveDraftsByCategory(name);
      if (linkCount || draftCount) {
        throw new CurationError("CATEGORY_IN_USE", 409, { linkCount, draftCount });
      }
      const next = categories.filter((category) => category.name !== name);
      try {
        const commit = await commitRepositoryFiles(
          head.commitSha,
          head.treeSha,
          { "data/categories.json": serializeCategories(next) },
          `Supprimer la catégorie ${name}`,
        );
        return { changed: true, commit, category: name, categories: next };
      } catch (error) {
        if (attempt === 0 && error instanceof GitHubResponseError && [409, 422].includes(error.status)) continue;
        throw error;
      }
    }
    throw new Error("CONCURRENT_UPDATE");
  }

  async themes() {
    const head = await readCachedRepositoryHead();
    const themes = (head.tags ?? []).map((theme) => ({
      ...theme,
      active: theme.active !== false,
      linkCount: tagUsage(head.links, theme.name),
      draftCount: this.store.countActiveDraftsByTag(theme.name),
    }));
    return {
      themes,
      summary: {
        active: themes.filter((theme) => theme.active).length,
        archived: themes.filter((theme) => !theme.active).length,
        undocumented: themes.filter(
          (theme) => theme.active && !theme.description.trim(),
        ).length,
      },
    };
  }

  async addTheme(value: unknown) {
    const body = (value ?? {}) as Record<string, unknown>;
    const name = cleanText(body.name, 80);
    const description = cleanText(body.description, 500);
    const aliases = Array.isArray(body.aliases)
      ? body.aliases.map((alias) => cleanText(alias, 80)).filter(Boolean)
      : [];
    if (!name) throw new CurationError("INVALID_THEME_NAME");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const head = await readRepositoryHead();
      const definitions = head.tags ?? [];
      const matching = definitions.find((definition) =>
        [definition.name, ...definition.aliases].some(
          (label) => tagLabelKey(label) === tagLabelKey(name),
        ),
      );
      if (matching?.active === false) {
        throw new CurationError("THEME_RESERVED", 409, { theme: matching.name });
      }
      if (matching) {
        return { changed: false, commit: null, theme: matching };
      }
      let next: DigestTagDefinition[];
      try {
        next = parseTagDefinitions(serializeTagDefinitions([
          ...definitions,
          { name, description, aliases },
        ]));
      } catch (error) {
        if (error instanceof Error && /Duplicate tag label/.test(error.message)) {
          throw new CurationError("THEME_ALREADY_EXISTS", 409);
        }
        throw new CurationError("INVALID_THEME");
      }
      const definition = next.find((theme) => theme.name === name)!;
      try {
        const commit = await commitRepositoryFiles(
          head.commitSha,
          head.treeSha,
          {
            "data/tags.json": serializeTagDefinitions(next),
            [`content/tags/${tagSlug(name)}.md`]: tagPage(definition),
          },
          `Ajouter le thème ${name}`,
        );
        return { changed: true, commit, theme: definition };
      } catch (error) {
        if (attempt === 0 && error instanceof GitHubResponseError && [409, 422].includes(error.status)) continue;
        throw error;
      }
    }
    throw new Error("CONCURRENT_UPDATE");
  }

  async updateTheme(
    currentValue: unknown,
    value: unknown,
    requestIdValue: unknown,
  ) {
    const current = cleanText(currentValue, 80);
    const body = (value ?? {}) as Record<string, unknown>;
    const requestedName = cleanText(body.name, 80);
    const requestedDescription = cleanText(body.description, 500);
    const requestedAliases = Array.isArray(body.aliases)
      ? body.aliases.map((alias) => cleanText(alias, 80)).filter(Boolean)
      : [];
    if (!current || !requestedName) throw new CurationError("INVALID_THEME_NAME");
    const payload = {
      current,
      requestedName,
      requestedDescription,
      requestedAliases,
    };
    return this.durableTaxonomyMutation(
      requestIdValue,
      "update_theme",
      payload,
      (head) => {
        const definitions = head.tags ?? [];
        const source = definitions.find(
          (theme) => theme.active !== false && theme.name === current,
        );
        if (!source) throw new CurationError("THEME_NOT_FOUND", 404);
        const target = definitions.find(
          (theme) =>
            theme.active !== false &&
            theme.name !== current &&
            theme.name.localeCompare(requestedName, "fr", {
              sensitivity: "base",
            }) === 0,
        );
        const replacement = target?.name ?? requestedName;
        const aliases = [
          ...new Set([
            ...(target?.aliases ?? []),
            ...source.aliases,
            ...requestedAliases,
            ...(replacement === current ? [] : [current]),
          ]),
        ].filter(
          (alias) =>
            alias.localeCompare(replacement, "fr", {
              sensitivity: "base",
            }) !== 0,
        );
        const definition = {
          name: replacement,
          description: target?.description || requestedDescription,
          aliases,
        };
        let next: DigestTagDefinition[];
        try {
          next = parseTagDefinitions(
            serializeTagDefinitions([
              ...definitions.filter(
                (theme) =>
                  theme.name !== current && theme.name !== target?.name,
              ),
              definition,
            ]),
          );
        } catch {
          throw new CurationError("INVALID_THEME");
        }
        const mutation = replaceCatalogTag(head.links, current, replacement);
        const files: Record<string, string | null> = {
          "data/tags.json": serializeTagDefinitions(next),
          [`content/tags/${tagSlug(replacement)}.md`]: tagPage(definition),
        };
        if (tagSlug(replacement) !== tagSlug(current)) {
          files[`content/tags/${tagSlug(current)}.md`] = null;
        }
        if (mutation.migrated) files["data/links.json"] = serializeCatalog(mutation.links);
        return {
          files,
          message: target
            ? `Fusionner le thème ${current} avec ${replacement}`
            : `Modifier le thème ${current}`,
          result: {
            changed: true,
            theme: definition,
            merged: Boolean(target),
            migrated: mutation.migrated,
            migratedDrafts:
              replacement === current
                ? 0
                : this.store.countActiveDraftsByTag(current),
          },
        };
      },
      (head, result) => {
        const definition = result.theme as DigestTagDefinition;
        const remote = (head.tags ?? []).find(
          (theme) => theme.active !== false && theme.name === definition.name,
        );
        return Boolean(
          remote &&
            remote.description === definition.description &&
            JSON.stringify([...remote.aliases].sort()) ===
              JSON.stringify([...definition.aliases].sort()) &&
            (definition.name === current ||
              (!(head.tags ?? []).some(
                (theme) => theme.active !== false && theme.name === current,
              ) &&
                !head.links.some((link) => link.tags?.includes(current)))),
        );
      },
      (result) => {
        const definition = result.theme as DigestTagDefinition;
        if (definition.name !== current) {
          this.store.replaceActiveDraftTag(current, definition.name);
        }
      },
    );
  }

  async archiveTheme(value: unknown, requestIdValue: unknown) {
    const name = cleanText(value, 80);
    if (!name) throw new CurationError("INVALID_THEME_NAME");
    return this.durableTaxonomyMutation(
      requestIdValue,
      "archive_theme",
      { name },
      (head) => {
        const definitions = head.tags ?? [];
        if (
          !definitions.some(
            (theme) => theme.active !== false && theme.name === name,
          )
        ) {
          throw new CurationError("THEME_NOT_FOUND", 404);
        }
        const next = definitions.map((theme) =>
          theme.name === name ? { ...theme, active: false as const } : theme,
        );
        return {
          files: { "data/tags.json": serializeTagDefinitions(next) },
          message: `Archiver le thème ${name}`,
          result: {
            changed: true,
            theme: name,
            preservedLinks: tagUsage(head.links, name),
            removedDrafts: this.store.countActiveDraftsByTag(name),
          },
        };
      },
      (head) =>
        (head.tags ?? []).some(
          (theme) => theme.name === name && theme.active === false,
        ),
      () => {
        this.store.replaceActiveDraftTag(name, null);
      },
    );
  }

  async reactivateTheme(value: unknown) {
    const name = cleanText(value, 80);
    if (!name) throw new CurationError("INVALID_THEME_NAME");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const head = await readRepositoryHead();
      const definitions = head.tags ?? [];
      const source = definitions.find(
        (theme) => theme.active === false && theme.name === name,
      );
      if (!source) throw new CurationError("THEME_NOT_FOUND", 404);
      const next = definitions.map((theme) =>
        theme.name === name
          ? { name: theme.name, description: theme.description, aliases: theme.aliases }
          : theme,
      );
      try {
        const commit = await commitRepositoryFiles(
          head.commitSha,
          head.treeSha,
          {
            "data/tags.json": serializeTagDefinitions(next),
            [`content/tags/${tagSlug(name)}.md`]: tagPage(source),
          },
          `Réactiver le tag ${name}`,
        );
        return {
          changed: true,
          commit,
          theme: { ...source, active: true },
          preservedLinks: tagUsage(head.links, name),
          draftCount: this.store.countActiveDraftsByTag(name),
        };
      } catch (error) {
        if (attempt === 0 && error instanceof GitHubResponseError && [409, 422].includes(error.status)) continue;
        throw error;
      }
    }
    throw new Error("CONCURRENT_UPDATE");
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
      const publicLinkCount = result.links.filter(
        (link) => link.added === date && link.visibility !== "hidden",
      ).length;
      const socialInput = {
        digestDate: date,
        title: edition.title,
        description: edition.description,
        linkCount: publicLinkCount,
      };
      const editionSource = setEditionDraft(source, publicLinkCount === 0);
      const [socialImage, linkedInImage] = await Promise.all([
        generateOptimizedSocialImage(socialInput),
        generateOptimizedLinkedInImage(socialInput),
      ]);
      try {
        const files: Record<string, string | Buffer> = {
          "data/links.json": serializeCatalog(result.links),
          [`static/social/${date}.png`]: socialImage,
          [`static/social/${date}-linkedin.png`]: linkedInImage,
        };
        if (editionSource !== source) {
          files[editionPath(date)] = editionSource;
        }
        const commit = await commitRepositoryFiles(
          head.commitSha,
          head.treeSha,
          files,
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
      const options = catalogTaxonomy(head.links, head.categories, head.tags);

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
    const taxonomy = catalogTaxonomy(head.links, head.categories, head.tags);
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
    const taxonomy = catalogTaxonomy(head.links, head.categories, head.tags);
    const categories = new Set(taxonomy.categories);
    const normalizedDrafts = concreteDrafts.map((draft) => ({
      ...draft,
      tags: head.tags ? cleanTags(draft.tags, taxonomy) : draft.tags,
    }));
    for (const draft of normalizedDrafts) {
      if (!categories.has(draft.category)) {
        throw new CurationError("INVALID_CATEGORY", 400, { id: draft.id });
      }
      if (head.links.some((link) => link.url === draft.url)) {
        throw new CurationError("ALREADY_PUBLISHED", 409, { id: draft.id });
      }
    }
    if (new Set(normalizedDrafts.map((draft) => draft.url)).size !== normalizedDrafts.length) {
      throw new CurationError("DUPLICATE_DRAFT_URL", 409);
    }
    return { head, taxonomy, drafts: normalizedDrafts };
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
        const tagFiles = await missingPublicationTagPages(
          prepared.drafts.flatMap((draft) => draft.tags),
          head,
          this.publication.tryReadRepositoryFile,
        );
        try {
          const commitSha = await this.publication.commitRepositoryFiles(
            head.commitSha,
            head.treeSha,
            { ...publication.files, ...tagFiles },
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
    if (publication.source === "edition") {
      return this.recoverEditionTransition(publication);
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

  private async recoverEditionTransition(
    publication: DigestPublication,
  ): Promise<DigestPublication> {
    if (publication.commitSha) return publication;
    const head = await this.edition.readRepositoryHead();
    const source = await this.edition.tryReadRepositoryFile(
      editionPath(publication.digestDate),
      head.commitSha,
    );
    const edition = source ? parseEdition(source) : null;
    const editionLinks = head.links.filter(
      (link) => link.added === publication.digestDate,
    );
    const visibleCount = editionLinks.filter(
      (link) => link.visibility !== "hidden",
    ).length;
    const targetReached = publication.action === "publish"
      ? Boolean(edition && !edition.draft && visibleCount > 0)
      : Boolean(edition?.draft && visibleCount === 0);

    if (targetReached) {
      return this.store.updatePublication(publication.id, {
        state: "validating",
        commitSha: head.commitSha,
        errorCode: null,
      });
    }
    if (
      publication.state === "committing" &&
      !publication.commitSha &&
      publication.errorCode === "GITHUB_COMMIT_OUTCOME_UNKNOWN"
    ) {
      const ambiguityAge = Date.now() - new Date(publication.updatedAt).valueOf();
      if (ambiguityAge < AMBIGUOUS_COMMIT_GRACE_MS) return publication;
      return this.store.updatePublication(publication.id, {
        state: "failed",
        errorCode: "GITHUB_COMMIT_NOT_FOUND",
      });
    }
    return publication;
  }

  async refreshPublication(id: string): Promise<DigestPublication> {
    const stored = this.store.findPublication(id);
    if (!stored) throw new CurationError("PUBLICATION_NOT_FOUND", 404);
    const publication = await this.recoverOrReturn(stored);
    if (publication.state === "live" || !publication.commitSha) {
      return publication;
    }
    if (publication.state === "failed") {
      const live = await (this.publication.publicationIsLive ?? publicationIsLive)(
        publication,
      );
      return live
        ? this.store.updatePublication(id, {
            state: "live",
            errorCode: null,
            checked: true,
          })
        : publication;
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

    const live = await (this.publication.publicationIsLive ?? publicationIsLive)(
      publication,
    );
    return this.store.updatePublication(id, {
      state: live ? "live" : "deploying",
      validateUrl: null,
      deployUrl: workflow.workflowUrl,
      checked: true,
    });
  }

  async editPublishedLink(id: string, body: unknown) {
    const head = await readRepositoryHead();
    const current = head.links.find((link) => link.id === id);
    if (!current) throw new CurationError("LINK_NOT_FOUND", 404);
    const metadata = metadataInput(
      body,
      catalogTaxonomy(head.links, head.categories, head.tags),
      current.tags ?? [],
    );
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
    const head = await readRepositoryHead();
    const current = head.links.find((link) => link.id === id);
    if (!current) throw new CurationError("LINK_NOT_FOUND", 404);
    const requested = Array.isArray(input.tags) ? input.tags : [];
    const tags = cleanTags(
      [...(current.tags ?? []), ...requested],
      catalogTaxonomy(head.links, head.categories, head.tags),
      current.tags ?? [],
    );
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
    const head = await this.edition.readRepositoryHead();
    const items = await this.edition.listRepositoryDirectory(
      "content/archives",
      head.commitSha,
    );
    return items
      .filter(
        (item) =>
          item.type === "file" &&
          /^\d{4}-\d{2}-\d{2}\.md$/.test(item.name),
      )
      .map((item) => {
        const date = item.name.slice(0, 10);
        const links = head.links.filter((link) => link.added === date);
        const visibleLinkCount = links.filter(
          (link) => link.visibility !== "hidden",
        ).length;
        return {
          date,
          state: visibleLinkCount === 0 ? "draft" as const : "published" as const,
          linkCount: links.length,
          visibleLinkCount,
          stagedLinkCount: links.filter(
            (link) => link.visibility_reason === "edition-draft",
          ).length,
        };
      })
      .sort((left, right) => left.date.localeCompare(right.date))
      .reverse();
  }

  async getEdition(date: string) {
    if (!validDate(date)) throw new CurationError("INVALID_DIGEST_DATE");
    const head = await this.edition.readRepositoryHead();
    const source = await this.edition.tryReadRepositoryFile(
      editionPath(date),
      head.commitSha,
    );
    if (!source) throw new CurationError("EDITION_NOT_FOUND", 404);
    const edition = parseEdition(source);
    const links = head.links.filter((link) => link.added === date);
    const visibleLinkCount = links.filter(
      (link) => link.visibility !== "hidden",
    ).length;
    const catalogIsDraft = visibleLinkCount === 0;
    return {
      ...edition,
      state: Boolean(edition.draft) === catalogIsDraft
        ? catalogIsDraft ? "draft" as const : "published" as const
        : "inconsistent" as const,
      linkCount: links.length,
      visibleLinkCount,
      stagedLinkCount: links.filter(
        (link) => link.visibility_reason === "edition-draft",
      ).length,
    };
  }

  async updateEdition(
    date: string,
    body: { title?: unknown; introduction?: unknown; seoDescription?: unknown },
  ) {
    if (!validDate(date)) throw new CurationError("INVALID_DIGEST_DATE");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const head = await this.edition.readRepositoryHead();
      const source = await this.edition.tryReadRepositoryFile(
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
      const next = editEdition(source, {
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
        this.edition.generateOptimizedSocialImage(socialInput),
        this.edition.generateOptimizedLinkedInImage(socialInput),
      ]);
      try {
        const commit = await this.edition.commitRepositoryFiles(
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

  async transitionEdition(
    date: string,
    input: EditionTransitionInput,
  ): Promise<DigestPublication> {
    if (!validDate(date)) throw new CurationError("INVALID_DIGEST_DATE");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.requestId,
      )
    ) {
      throw new CurationError("INVALID_REQUEST_ID");
    }
    if (!(["publish", "unpublish"] as const).includes(input.action)) {
      throw new CurationError("INVALID_EDITION_ACTION");
    }
    const existing = this.store.findPublication(input.requestId);
    if (existing) return this.recoverOrReturn(existing);

    const initialHead = await this.edition.readRepositoryHead();
    const initialSource = await this.edition.tryReadRepositoryFile(
      editionPath(date),
      initialHead.commitSha,
    );
    if (!initialSource) throw new CurationError("EDITION_NOT_FOUND", 404);
    const initialEdition = parseEdition(initialSource);
    this.assertEditionTransition(
      date,
      initialEdition,
      initialHead.links,
      input.action,
    );
    this.store.createPublication({
      id: input.requestId,
      digestDate: date,
      title: initialEdition.title,
      introduction: initialEdition.introduction,
      seoDescription: initialEdition.description,
      action: input.action,
      source: "edition",
    });

    let remoteCommitSucceeded = false;
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const head = attempt === 0
          ? initialHead
          : await this.edition.readRepositoryHead();
        const source = attempt === 0
          ? initialSource
          : await this.edition.tryReadRepositoryFile(
              editionPath(date),
              head.commitSha,
            );
        if (!source) throw new CurationError("EDITION_NOT_FOUND", 404);
        const current = parseEdition(source);
        this.assertEditionTransition(date, current, head.links, input.action);
        const target = input.action === "publish" ? "published" : "draft";
        const mutation = changeEditionVisibility(head.links, date, target);
        if (!mutation.changed) {
          throw new CurationError("NO_EDITION_LINKS_TO_TRANSITION", 409);
        }
        const nextSource = setEditionDraft(source, target === "draft");
        const tagFiles = target === "published"
          ? await missingPublicationTagPages(
              mutation.links
                .filter((link) => link.added === date && link.visibility !== "hidden")
                .flatMap((link) => link.tags ?? []),
              head,
              this.edition.tryReadRepositoryFile,
            )
          : {};
        const linkCount = mutation.links.filter(
          (link) => link.added === date && link.visibility !== "hidden",
        ).length;
        const socialInput = {
          digestDate: date,
          title: current.title,
          description: current.description,
          linkCount,
        };
        const [socialImage, linkedInImage] = await Promise.all([
          this.edition.generateOptimizedSocialImage(socialInput),
          this.edition.generateOptimizedLinkedInImage(socialInput),
        ]);
        try {
          const commitSha = await this.edition.commitRepositoryFiles(
            head.commitSha,
            head.treeSha,
            {
              ...tagFiles,
              [editionPath(date)]: nextSource,
              "data/links.json": serializeCatalog(mutation.links),
              [`static/social/${date}.png`]: socialImage,
              [`static/social/${date}-linkedin.png`]: linkedInImage,
            },
            input.action === "publish"
              ? `Publier le Digest du ${date}`
              : `Remettre en brouillon le Digest du ${date}`,
          );
          remoteCommitSucceeded = true;
          return this.store.updatePublication(input.requestId, {
            state: "validating",
            commitSha,
            errorCode: null,
          });
        } catch (error) {
          if (error instanceof GitHubMutationOutcomeUnknownError) {
            remoteCommitSucceeded = true;
            this.store.updatePublication(input.requestId, {
              state: "committing",
              errorCode: "GITHUB_COMMIT_OUTCOME_UNKNOWN",
            });
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
      if (!remoteCommitSucceeded) {
        this.store.updatePublication(input.requestId, {
          state: "failed",
          errorCode: error instanceof CurationError
            ? error.code
            : "EDITION_TRANSITION_FAILED",
        });
      }
      throw error;
    }
  }

  private assertEditionTransition(
    date: string,
    edition: ReturnType<typeof parseEdition>,
    links: Awaited<ReturnType<typeof readRepositoryHead>>["links"],
    action: EditionTransitionInput["action"],
  ): void {
    const editionLinks = links.filter((link) => link.added === date);
    if (!editionLinks.length) throw new CurationError("EMPTY_EDITION", 409);
    const visibleCount = editionLinks.filter(
      (link) => link.visibility !== "hidden",
    ).length;
    if (Boolean(edition.draft) !== (visibleCount === 0)) {
      throw new CurationError("EDITION_STATE_INCONSISTENT", 409, {
        draft: Boolean(edition.draft),
        visibleCount,
      });
    }
    if (action === "publish" && !edition.draft) {
      throw new CurationError("EDITION_ALREADY_PUBLISHED", 409);
    }
    if (action === "unpublish" && edition.draft) {
      throw new CurationError("EDITION_ALREADY_DRAFT", 409);
    }
  }
}

export const newPublicationRequestId = (): string => randomUUID();

export type DigestLink = {
  id: string;
  title: string;
  url: string;
  category: string;
  added: string;
  description?: string;
  tags?: string[];
  visibility?: "hidden";
  hidden_at?: string;
  previous_urls?: string[];
  [key: string]: unknown;
};

export type VisibilityAction = "hide" | "restore";

export type CatalogMutation = {
  links: DigestLink[];
  link: DigestLink;
  changed: boolean;
  reactivated?: boolean;
};

export const parseCatalog = (text: string): DigestLink[] => {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("The Digest catalog must be an array");

  const ids = new Set<string>();
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error(`Invalid catalog item at index ${index}`);
    }
    const link = candidate as DigestLink;
    for (const field of ["id", "title", "url", "category", "added"] as const) {
      if (typeof link[field] !== "string" || !link[field].trim()) {
        throw new Error(`Catalog item ${index} has an invalid ${field}`);
      }
    }
    if (ids.has(link.id)) throw new Error(`Duplicate link id: ${link.id}`);
    ids.add(link.id);
    if (link.visibility && link.visibility !== "hidden") {
      throw new Error(`Unsupported visibility for link ${link.id}`);
    }
    if (link.visibility === "hidden" && !link.hidden_at) {
      throw new Error(`Hidden link ${link.id} has no hidden_at timestamp`);
    }
    return link;
  });
};

export const changeVisibility = (
  links: DigestLink[],
  id: string,
  action: VisibilityAction,
  now = new Date(),
): CatalogMutation => {
  const index = links.findIndex((link) => link.id === id);
  if (index < 0) throw new Error("LINK_NOT_FOUND");

  const current = links[index]!;
  const alreadyApplied =
    action === "hide"
      ? current.visibility === "hidden"
      : current.visibility !== "hidden";

  if (alreadyApplied) {
    return { links, link: current, changed: false };
  }

  const updated: DigestLink = { ...current };
  if (action === "hide") {
    updated.visibility = "hidden";
    updated.hidden_at = now.toISOString();
  } else {
    delete updated.visibility;
    delete updated.hidden_at;
  }

  const next = links.slice();
  next[index] = updated;
  return { links: next, link: updated, changed: true };
};

export const serializeCatalog = (links: DigestLink[]): string =>
  `${JSON.stringify(links, null, 2)}\n`;

export type DigestCategory = {
  name: string;
  description: string;
};

export const parseCategories = (text: string): DigestCategory[] => {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("The category catalog must be an array");
  const categories: DigestCategory[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    const record =
      candidate && typeof candidate === "object" && !Array.isArray(candidate)
        ? (candidate as Record<string, unknown>)
        : null;
    const name =
      typeof candidate === "string"
        ? candidate.trim()
        : record
          ? String(record.name ?? "").trim()
          : "";
    const description =
      record && typeof record.description === "string"
        ? record.description.trim()
        : "";
    if (
      !name ||
      name.length > 100 ||
      description.length > 500 ||
      (record?.description !== undefined && typeof record.description !== "string")
    ) {
      throw new Error("The category catalog contains an invalid category");
    }
    const key = name.toLocaleLowerCase("fr");
    if (seen.has(key)) throw new Error(`Duplicate category: ${name}`);
    seen.add(key);
    categories.push({ name, description });
  }
  return categories.sort((a, b) => a.name.localeCompare(b.name, "fr"));
};

export const serializeCategories = (categories: DigestCategory[]): string =>
  `${JSON.stringify(categories, null, 2)}\n`;

export const catalogCategoryDefinitions = (
  links: DigestLink[],
  configured: DigestCategory[] = [],
) => {
  const categories: DigestCategory[] = [];
  const seen = new Set<string>();
  const candidates = [
    ...configured,
    ...links.map((link) => ({ name: link.category, description: "" })),
  ];
  for (const category of candidates) {
    const key = category.name.toLocaleLowerCase("fr");
    if (!seen.has(key)) {
      seen.add(key);
      categories.push(category);
    }
  }
  return categories.sort((a, b) => a.name.localeCompare(b.name, "fr"));
};

export const catalogCategories = (
  links: DigestLink[],
  configured: DigestCategory[] = [],
) => catalogCategoryDefinitions(links, configured).map((category) => category.name);

export const catalogTaxonomy = (links: DigestLink[], configured: DigestCategory[] = []) => ({
  categories: catalogCategories(links, configured),
  tags: [
    ...new Set(
      links.flatMap((link) =>
        Array.isArray(link.tags) ? link.tags.map(String) : [],
      ),
    ),
  ].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
});

export const categoryUsage = (links: DigestLink[], category: string): number =>
  links.filter((link) => link.category === category).length;

export const renameCategory = (
  links: DigestLink[],
  categories: DigestCategory[],
  current: string,
  replacement: string,
  description: string,
) => {
  if (!categories.some((category) => category.name === current)) {
    throw new Error("CATEGORY_NOT_FOUND");
  }
  if (
    categories.some(
      (category) =>
        category.name !== current &&
        category.name.localeCompare(replacement, "fr", { sensitivity: "base" }) === 0,
    )
  ) {
    throw new Error("CATEGORY_ALREADY_EXISTS");
  }
  return {
    links: links.map((link) =>
      link.category === current ? { ...link, category: replacement } : link,
    ),
    categories: categories
      .map((category) =>
        category.name === current
          ? { name: replacement, description }
          : category,
      )
      .sort((a, b) => a.name.localeCompare(b.name, "fr")),
  };
};

export type PublishedMetadata = {
  url: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  reactivate: boolean;
};

export const addPublishedTags = (
  links: DigestLink[],
  id: string,
  additions: string[],
): CatalogMutation => {
  const index = links.findIndex((link) => link.id === id);
  if (index < 0) throw new Error("LINK_NOT_FOUND");
  const current = links[index]!;
  const tags = Array.isArray(current.tags) ? [...current.tags] : [];
  const known = new Set(tags.map((tag) => tag.toLocaleLowerCase("fr")));

  for (const tag of additions) {
    const key = tag.toLocaleLowerCase("fr");
    if (!known.has(key)) {
      known.add(key);
      tags.push(tag);
    }
  }

  if (tags.length === (current.tags ?? []).length) {
    return { links, link: current, changed: false };
  }

  const updated: DigestLink = { ...current, tags };
  const next = links.slice();
  next[index] = updated;
  return { links: next, link: updated, changed: true };
};

export const changePublishedMetadata = (
  links: DigestLink[],
  id: string,
  metadata: PublishedMetadata,
): CatalogMutation => {
  const index = links.findIndex((link) => link.id === id);
  if (index < 0) throw new Error("LINK_NOT_FOUND");
  if (links.some((link) => link.id !== id && link.url === metadata.url)) {
    throw new Error("DUPLICATE_LINK_URL");
  }
  const current = links[index]!;
  const reactivated = metadata.reactivate && current.status === "dead";
  const previousUrls = (
    Array.isArray(current.previous_urls) ? current.previous_urls : []
  ).filter((url) => url !== metadata.url);
  if (current.url !== metadata.url && !previousUrls.includes(current.url)) {
    previousUrls.push(current.url);
  }
  const updated: DigestLink = {
    ...current,
    url: metadata.url,
    title: metadata.title,
    category: metadata.category,
    description: metadata.description,
    tags: [...metadata.tags],
  };
  if (previousUrls.length) updated.previous_urls = previousUrls;
  if (reactivated) {
    delete updated.status;
    delete updated.status_note;
    delete updated.archive_url;
    delete updated.archive_status;
    delete updated.archive_checked_at;
    updated.tags = updated.tags?.filter(
      (tag) => tag.toLocaleLowerCase("fr") !== "lien-mort",
    );
  }
  const changed =
    current.url !== updated.url ||
    current.title !== updated.title ||
    current.category !== updated.category ||
    current.description !== updated.description ||
    JSON.stringify(current.tags ?? []) !== JSON.stringify(updated.tags) ||
    JSON.stringify(current.previous_urls ?? []) !==
      JSON.stringify(updated.previous_urls ?? []);
  if (!changed && !reactivated) {
    return { links, link: current, changed: false, reactivated: false };
  }
  const next = links.slice();
  next[index] = updated;
  return { links: next, link: updated, changed: true, reactivated };
};

export const publicAdminLink = (link: DigestLink) => ({
  id: link.id,
  title: link.title,
  url: link.url,
  category: link.category,
  added: link.added,
  description: link.description ?? "",
  tags: Array.isArray(link.tags) ? link.tags : [],
  status: typeof link.status === "string" ? link.status : null,
  visibility: link.visibility ?? null,
  hiddenAt: link.hidden_at ?? null,
  previousUrls: Array.isArray(link.previous_urls) ? link.previous_urls : [],
});

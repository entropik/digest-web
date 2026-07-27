export type DigestLink = {
  id: string;
  title: string;
  url: string;
  category: string;
  added: string;
  visibility?: "hidden";
  hidden_at?: string;
  [key: string]: unknown;
};

export type VisibilityAction = "hide" | "restore";

export type CatalogMutation = {
  links: DigestLink[];
  link: DigestLink;
  changed: boolean;
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

export const publicAdminLink = (link: DigestLink) => ({
  id: link.id,
  title: link.title,
  url: link.url,
  category: link.category,
  added: link.added,
  hiddenAt: link.hidden_at ?? null,
});

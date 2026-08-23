export type EditionDocument = {
  digestDate: string;
  title: string;
  description: string;
  introduction: string;
  draft?: boolean;
};

const unquote = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed.replace(/^['"]|['"]$/g, "");
};

export const parseEdition = (source: string): EditionDocument => {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error("INVALID_EDITION");
  const values = new Map<string, string>();
  for (const line of match[1]!.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  const digestDate = unquote(values.get("digest_date") ?? "");
  const title = unquote(values.get("title") ?? "");
  const description = unquote(values.get("description") ?? "");
  if (!digestDate || !title) throw new Error("INVALID_EDITION");
  const edition: EditionDocument = {
    digestDate,
    title,
    description,
    introduction: match[2]!.trim(),
  };
  if (unquote(values.get("draft") ?? "").toLowerCase() === "true") {
    edition.draft = true;
  }
  return edition;
};

export const renderEdition = (edition: EditionDocument): string =>
  `---\n` +
  `title: ${JSON.stringify(edition.title)}\n` +
  `date: ${edition.digestDate}\n` +
  `digest_date: ${JSON.stringify(edition.digestDate)}\n` +
  (edition.draft ? `draft: true\n` : "") +
  `description: ${JSON.stringify(edition.description)}\n` +
  `images:\n` +
  `  - ${JSON.stringify(`/social/${edition.digestDate}.png`)}\n` +
  `---\n\n${edition.introduction.trim()}\n`;

export const setEditionDraft = (source: string, draft: boolean): string => {
  const edition = parseEdition(source);
  if (Boolean(edition.draft) === draft) return source;
  return renderEdition({
    ...edition,
    draft: draft ? true : undefined,
  });
};

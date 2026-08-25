export const tagLabelKey = (value: string): string =>
  value
    .replace(/&amp;/gi, "&")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type DigestTagDefinition = {
  name: string;
  description: string;
  aliases: string[];
  active?: false;
};

const LEGACY_ALIASES = new Map<string, string | null>([
  ["photographes", "photographie"], ["livre book", "livre"],
  ["actualites", null], ["camera porn", "matériel"],
  ["imprimerie technique", "impression"], ["risographie", "riso"],
  ["technique", "photographie"], ["selfhosted", "auto-hébergement"],
  ["up", null], ["zines", "zine"], ["artgeneratif", "design-génératif"],
  ["bernard stiegler", "stiegler"], ["concours", null],
  ["hasselblad", "matériel"], ["ia generative", "IA"],
  ["interview", "entretien"], ["livre d artiste", "livre-d’artiste"],
  ["outil riso", "riso"], ["separation", "riso"],
  ["thomas boivin", "photographie"], ["vibe coding", "code"],
]);

export const parseTagDefinitions = (text: string): DigestTagDefinition[] => {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("The tag registry must be an array");
  const definitions: DigestTagDefinition[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    const record =
      candidate && typeof candidate === "object" && !Array.isArray(candidate)
        ? (candidate as Record<string, unknown>)
        : null;
    const name = String(record?.name ?? "").trim();
    const description = String(record?.description ?? "").trim();
    const aliases = Array.isArray(record?.aliases)
      ? record.aliases.map((alias) => String(alias).trim()).filter(Boolean)
      : [];
    if (!name || name.length > 80 || description.length > 500) {
      throw new Error("The tag registry contains an invalid theme");
    }
    for (const label of [name, ...aliases]) {
      const key = tagLabelKey(label);
      if (!key || seen.has(key)) throw new Error(`Duplicate tag label: ${label}`);
      seen.add(key);
    }
    definitions.push({
      name,
      description,
      aliases,
      ...(record?.active === false ? { active: false as const } : {}),
    });
  }
  return definitions.sort((left, right) => left.name.localeCompare(right.name, "fr"));
};

export const serializeTagDefinitions = (definitions: DigestTagDefinition[]): string =>
  `${JSON.stringify(definitions, null, 2)}\n`;

export const activeTagNames = (definitions: DigestTagDefinition[]): string[] =>
  definitions.filter((definition) => definition.active !== false).map((definition) => definition.name);

export type CanonicalTagResult = {
  tags: string[];
  unknown: string[];
};

export const canonicalizeTags = (
  values: string[],
  definitionsOrNames: DigestTagDefinition[] | string[],
  preservedTags: string[] = [],
): CanonicalTagResult => {
  const legacyMode = typeof definitionsOrNames[0] === "string";
  const definitions: DigestTagDefinition[] = legacyMode
    ? (definitionsOrNames as string[]).map((name) => ({
        name,
        description: "",
        aliases: [],
      }))
    : (definitionsOrNames as DigestTagDefinition[]);
  const known = new Map<string, string>();
  for (const definition of definitions) {
    if (definition.active === false) continue;
    for (const label of [definition.name, ...definition.aliases]) {
      known.set(tagLabelKey(label), definition.name);
    }
  }
  for (const preserved of preservedTags) known.set(tagLabelKey(preserved), preserved);
  const tags: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const input = value.trim().replace(/^#+/, "");
    if (!input) continue;
    const inputKey = tagLabelKey(input);
    const legacyAlias = legacyMode ? LEGACY_ALIASES.get(inputKey) : undefined;
    if (legacyMode && LEGACY_ALIASES.has(inputKey) && legacyAlias === null) continue;
    const canonical = known.get(tagLabelKey(legacyAlias ?? input));
    if (!canonical) {
      unknown.push(input);
      continue;
    }
    const key = tagLabelKey(canonical);
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(canonical);
    }
  }

  return { tags, unknown };
};

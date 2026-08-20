const foldTag = (value: string): string =>
  value
    .replace(/&amp;/gi, "&")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const TAG_ALIASES = new Map<string, string | null>([
  ["photographes", "photographie"],
  ["livre book", "livre"],
  ["actualites", null],
  ["camera porn", "matériel"],
  ["imprimerie technique", "impression"],
  ["risographie", "riso"],
  ["ai workforce platform", "agents"],
  ["technique", "photographie"],
  ["selfhosted", "auto-hébergement"],
  ["up", null],
  ["zines", "zine"],
  ["ai assistant", "agents"],
  ["ai assitant", "agents"],
  ["alternative", "transfert-de-fichiers"],
  ["artgeneratif", "design-génératif"],
  ["bernard stiegler", "stiegler"],
  ["concours", null],
  ["hasselblad", "matériel"],
  ["ia generative", "IA"],
  ["interview", "entretien"],
  ["livre d artiste", "livre-d’artiste"],
  ["mcp", "agents"],
  ["messaging", "transfert-de-fichiers"],
  ["outil riso", "riso"],
  ["separation", "riso"],
  ["thomas boivin", "photographie"],
  ["vibe coding", "code"],
]);

export type CanonicalTagResult = {
  tags: string[];
  unknown: string[];
};

export const canonicalizeTags = (
  values: string[],
  knownTags?: string[],
): CanonicalTagResult => {
  const known = knownTags
    ? new Map(knownTags.map((tag) => [foldTag(tag), tag]))
    : null;
  const tags: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const input = value.trim().replace(/^#+/, "");
    if (!input) continue;
    const inputKey = foldTag(input);
    const aliased = TAG_ALIASES.has(inputKey) ? TAG_ALIASES.get(inputKey) : input;
    if (aliased === null) continue;
    const canonical = known ? known.get(foldTag(aliased ?? "")) : aliased;
    if (!canonical) {
      unknown.push(input);
      continue;
    }
    const key = foldTag(canonical);
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(canonical);
    }
  }

  return { tags, unknown };
};

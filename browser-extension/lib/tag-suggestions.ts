export type TagDefinition = {
  name: string;
  description: string;
  aliases: string[];
};

export type TagSuggestionSource = {
  title: string;
  description: string;
  body: string;
};

const STOP_WORDS = new Set([
  "avec", "dans", "des", "elle", "elles", "pour", "sans", "sont", "sur",
  "une", "the", "and", "for", "from", "that", "this", "with", "your",
]);

const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const containsPhrase = (text: string, phrase: string): boolean =>
  phrase.length > 0 && ` ${text} `.includes(` ${phrase} `);

const significantWords = (value: string): string[] => [
  ...new Set(
    normalize(value)
      .split(" ")
      .filter((word) => word.length >= 4 && !STOP_WORDS.has(word)),
  ),
];

export const suggestTags = (
  source: TagSuggestionSource,
  definitions: TagDefinition[],
  limit = 5,
): string[] => {
  const texts = {
    title: normalize(source.title),
    description: normalize(source.description),
    body: normalize(source.body),
  };
  const descriptionWordFrequency = new Map<string, number>();
  for (const definition of definitions) {
    for (const word of significantWords(definition.description)) {
      descriptionWordFrequency.set(
        word,
        (descriptionWordFrequency.get(word) ?? 0) + 1,
      );
    }
  }

  return definitions
    .map((definition) => {
      const phrases = [definition.name, ...definition.aliases]
        .map(normalize)
        .filter(Boolean);
      let score = 0;

      for (const phrase of phrases) {
        if (containsPhrase(texts.title, phrase)) score += 12;
        if (containsPhrase(texts.description, phrase)) score += 6;
        if (containsPhrase(texts.body, phrase)) score += 2;
      }

      for (const word of significantWords(definition.description)) {
        const frequency = descriptionWordFrequency.get(word) ?? 1;
        const rarity = 1 / (frequency * frequency);
        if (containsPhrase(texts.title, word)) score += 3 * rarity;
        if (containsPhrase(texts.description, word)) score += 2 * rarity;
        if (containsPhrase(texts.body, word)) score += 0.5 * rarity;
      }

      return { name: definition.name, score };
    })
    .filter((candidate) => candidate.score >= 2)
    .sort(
      (left, right) =>
        right.score - left.score || left.name.localeCompare(right.name, "fr"),
    )
    .slice(0, limit)
    .map((candidate) => candidate.name);
};

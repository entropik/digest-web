import { describe, expect, test } from "vitest";
import { suggestTags } from "../lib/tag-suggestions";

const definitions = [
  {
    name: "cybersécurité",
    description: "Sécurité des systèmes, des données et des usages numériques.",
    aliases: [],
  },
  {
    name: "développement",
    description: "Construction et maintenance de produits numériques.",
    aliases: ["dev", "web development"],
  },
  {
    name: "photographie",
    description: "Pratiques, œuvres et techniques photographiques.",
    aliases: ["photo"],
  },
];

describe("suggestions de tags", () => {
  test("classe les tags à partir du titre, du résumé et du contenu", () => {
    expect(
      suggestTags(
        {
          title: "Audits de sécurité pour les développeurs web",
          description: "Analysez les failles de votre application.",
          body: "Un outil consacré au web development et à la sécurité.",
        },
        definitions,
      ),
    ).toEqual(["cybersécurité", "développement"]);
  });

  test("ne complète pas la liste avec des tags sans signal", () => {
    expect(
      suggestTags(
        {
          title: "Carnet de voyage",
          description: "Une promenade en montagne.",
          body: "Paysages et sentiers.",
        },
        definitions,
      ),
    ).toEqual([]);
  });

  test("ne confond pas un mot descriptif générique avec un signal éditorial", () => {
    expect(
      suggestTags(
        {
          title: "Création contemporaine",
          description: "Un projet de création.",
          body: "Découvrez cette création.",
        },
        [
          {
            name: "art",
            description: "Création artistique et démarches contemporaines.",
            aliases: [],
          },
          {
            name: "design",
            description: "Création visuelle et conception fonctionnelle.",
            aliases: [],
          },
        ],
      ),
    ).toEqual([]);
  });
});

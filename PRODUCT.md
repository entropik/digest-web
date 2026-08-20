# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Le public principal réunit des personnes curieuses, créatives et
professionnelles qui cherchent une sélection resserrée de ressources sur
l’intelligence artificielle, le développement, le design, l’édition, la
photographie et l’image. Elles veulent découvrir, retrouver et partager ce qui
mérite d’être gardé sans subir un flux infini ni un classement automatisé.

Le second utilisateur est le propriétaire-éditeur. Il capture des pages depuis
Chrome, complète et organise des brouillons, maintient la taxonomie, publie des
éditions, corrige ou masque des ressources sans détruire leur histoire et
partage des liens ou des éditions sur LinkedIn.

## Product Purpose

OOBLIK Digest transforme une veille personnelle et dispersée en une mémoire du
Web choisie, documentée et durable. Le produit doit rendre la découverte
agréable, la recherche rétrospective fiable et la publication éditoriale sûre,
tout en conservant la trace des ressources disparues.

Le succès ne se mesure pas au volume d’un flux : il tient à la qualité de la
sélection, à la possibilité de retrouver une ressource ou une édition et à la
continuité entre capture, curation, publication et consultation.

## Positioning

Le Digest est une archive personnelle éditorialisée, pas un agrégateur
d’actualité ni un gestionnaire de favoris généraliste. Sa différence vient de
la combinaison d’une sélection humaine, de résumés courts, d’une taxonomie
fermée et administrable, d’éditions datées, d’images sociales générées de façon
déterministe et d’une conservation explicite des liens morts.

## Operating Context

- Le lectorat consulte le site statique public, recherche par texte ou date,
  filtre par catégorie, explore les tags, parcourt les archives et conserve des
  favoris locaux à son navigateur.
- Le propriétaire capture volontairement la page active via une extension
  Chrome non listée. Le titre, l’URL canonique, la description et la sélection
  éventuelle alimentent un brouillon ; la note et la sélection restent privées.
- L’administration propriétaire permet de compléter les brouillons, maintenir
  catégories et métadonnées, sélectionner un lot et suivre sa publication
  réelle de la préparation jusqu’à sa présence en production.
- Une publication produit un commit idempotent sur GitHub ; GitHub Actions
  construit Hugo et CloudPanel publie l’artefact statique validé.
- Les partages LinkedIn passent par une intégration propriétaire et une
  confirmation explicite du texte et de l’image avant envoi.

## Capabilities and Constraints

- Le site public est généré avec Hugo et PaperMod à partir de données
  versionnées dans Git. `data/links.json` conserve le catalogue,
  `data/categories.json` la taxonomie et `content/archives/` les éditions.
- L’administration est un service Node.js séparé, authentifié avec GitHub et
  strictement limité à l’identité du propriétaire. SQLite conserve les
  brouillons, secrets chiffrés et états privés qui ne doivent jamais rejoindre
  le dépôt public.
- L’extension Manifest V3 communique uniquement avec le service du Digest et
  ne possède aucun accès direct à GitHub. Une capture est toujours déclenchée
  par l’utilisateur.
- Un brouillon incomplet peut être enregistré mais pas publié. Une publication
  valide les champs obligatoires, les doublons, la taxonomie, les URL et
  l’unicité de la date.
- Une ressource publique disparue conserve son URL d’origine avec
  `status: "dead"`, une `status_note` lisible et le tag `lien-mort`. Une URL
  privée, locale, authentifiée ou sensible reste toujours exclue.
- Les corrections, retraits et restaurations préservent l’identifiant et
  l’histoire éditoriale de la ressource.
- Les affiches d’édition sont générées par le code en formats Open Graph
  1200 × 627 et LinkedIn 1200 × 1200. Les images de liens individuels utilisent
  une capture distante isolée ou une composition typographique de repli.
- Les favoris publics restent locaux. La sélection de curation et les notes du
  propriétaire restent privées.

## Brand Commitments

Le produit porte le nom **OOBLIK Digest** et la signature
« Ce qui mérite d’être gardé… ou pas. ». Sa voix est personnelle, curieuse,
précise et éditoriale. Il assume l’entropie de l’exploration tout en apportant
une discipline de classement et de transmission.

OOBLIK, son nom et ses ressources graphiques existantes sont des engagements à
préserver. L’identité associe une rigueur typographique suisse à la logique des
cartouches de plans d’architecte ; ses règles visuelles détaillées appartiennent
à `DESIGN.md` et `docs/interface.md`.

## Evidence on Hand

- Le catalogue réel et ses métadonnées : `data/links.json`.
- La taxonomie administrable : `data/categories.json`.
- Les éditions publiées : `content/archives/`.
- Le récit et la provenance du projet : `content/a-propos.md`.
- Les parcours publics : `layouts/`, `assets/css/extended/digest.css` et
  `assets/js/`.
- Les parcours propriétaire et de publication : `admin-service/`.
- La capture depuis Chrome : `browser-extension/`.
- Les décisions et contraintes durables : `docs/architecture.md`,
  `docs/decisions.md`, `docs/interface.md` et `README.md`.

Il n’existe pas de promesse d’exhaustivité, de recommandation algorithmique,
de témoignage client, de tarification ou de métrique publique à fabriquer.

## Product Principles

- **Choisir avant d’accumuler.** La sélection humaine et le contexte éditorial
  priment sur le volume et la fraîcheur à tout prix.
- **Conserver sans exposer.** Préserver la mémoire publique du Web sans jamais
  publier une adresse, une note ou une donnée sensible.
- **Rendre l’histoire navigable.** Catégories, tags, dates, éditions et états de
  lien doivent aider à retrouver une ressource longtemps après sa capture.
- **Publier avec des preuves.** Les états de progression correspondent à des
  validations et événements réels, jamais à un pourcentage décoratif.
- **Garder l’éditorial maître.** L’automatisation prépare, vérifie et compose ;
  le propriétaire choisit, corrige et confirme ce qui devient public.

## Accessibility & Inclusion

Viser WCAG AA pour les textes et les informations essentielles. Préserver un
parcours complet au clavier, des états de focus visibles, des libellés et états
ARIA synchronisés, une alternative stable aux mouvements avec
`prefers-reduced-motion`, une information qui ne dépend jamais uniquement de la
couleur et l’absence de débordement horizontal sur petit écran.

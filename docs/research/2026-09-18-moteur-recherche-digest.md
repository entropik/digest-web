# Moteur de recherche des billets — état des lieux et options

Recherche documentaire du 2026-09-18. Sources primaires citées inline. Chaque
section se termine par un verdict éditorial.

---

## 0. Le moteur actuel (audit local)

**Architecture.** Quatre index JSON sont générés au build par
`layouts/index.html` (lignes 90-93) à partir de `data/links.json` : `base`
(identifiants, titres, catégories, URLs), `descriptions` (chargé à la demande
depuis v1.30.2), `supplemental` et `details` (texte d'archive). Le client
`assets/js/digest.js` (1 144 lignes) normalise les accents (NFD), concatène un
`searchText` mémoïsé par lien, puis filtre par sous-chaîne :
`terms.every((term) => searchableText.includes(term))` (ligne 540).

**Points de douleur.**

1. **Mini-format propriétaire** à clés minifiées (`i`, `d`, `t`, `c`, `u`, `s`,
   `n`, `g`, `x`, `m`) réparti sur trois fichiers (template Hugo, client,
   vérificateur) — chaque évolution doit tenir les trois en cohérence.
2. **Budgets de taille codés en dur** (`scripts/check-search-index-budget.mjs`,
   lignes 12-17 : 200/180/240/140 Kio gzip) à réajuster à chaque seuil de
   croissance. Le commit #130 du 18 septembre était déjà entièrement consacré à
   découpler l'index de la croissance du catalogue.
3. **Pas de classement** (filtrage booléen), **pas de tolérance de frappe** ;
   la logique de normalisation est dupliquée entre le vérificateur CI et le
   client.
4. **Croissance** : ~15 liens/semaine ≈ ×2,5 en cinq ans ; la mécanique
   budget/chargement différé devra être retaillée plusieurs fois.
5. Bilinguisme FR/EN géré par préfixe d'index dupliqués.

**Verdict : le moteur actuel est sain mais propriétaire** — sa complexité de
maintenance croît avec le catalogue, ce qui correspond exactement au ressenti
« glissant à gérer et possiblement piégeant ».

---

## 1. Pagefind

**Sources.** [pagefind.app](https://pagefind.app/) ·
[docs](https://pagefind.app/docs/) ·
[dépôt GitHub](https://github.com/Pagefind/pagefind) ·
[releases](https://github.com/Pagefind/pagefind/releases)

**Corpus non-HTML.** C'est le point décisif pour le Digest : la
[Node API](https://pagefind.app/docs/node-api/) offre
`index.addCustomRecord({ url, content, language, meta, filters, sort })` pour
indexer des données arbitraires (« PDFs? JSON files? subtitles? »). On peut
donc indexer `data/links.json` directement : `content` = titre + description,
`filters` = catégorie et tags, `meta` = titre/date, `language` = `"fr"`/`"en"`.
La voie HTML existe aussi (`data-pagefind-body` par fiche, avec
sous-résultats par section, [docs indexing](https://pagefind.app/docs/indexing/),
[sub-results](https://pagefind.app/docs/sub-results/)).

**Empreinte.** Moteur WASM, index découpé en chunks chargés à la demande.
Revendication officielle : *« a full-text search on a 10,000 page site with a
total network payload under 300kB, including the Pagefind library itself. For
most sites, this will be closer to 100kB »*. La v1.5.0 (avril 2026) réduit les
chunks de ~45 % et lance la recherche dans un Web Worker. Depuis la v1.3.0, un
fragment inchangé garde le même nom de fichier → cache HTTP long possible.

**Facettes.** Natives : `filters` par fiche, composants UI
`<pagefind-filter-dropdown>` / `<pagefind-filter-pane>`
([docs filtering](https://pagefind.app/docs/filtering/)) — catégories et tags
sans code maison.

**FR/EN.** Séparation automatique par langue, stemming Snowball et UI
traduite **pour le français**, correspondance à travers les diacritiques
depuis v1.5.0 ([docs multilingual](https://pagefind.app/docs/multilingual/)).

**Intégration.** Étape post-build : `npx -y pagefind --site public`, ou
binaire précompilé Linux (~4,9 Mio, sha256 publiés,
[docs installation](https://pagefind.app/docs/installation/)) — s'insère dans
`scripts/deploy-vps.sh` et dans GitHub Actions ubuntu-latest.

**Maintenance.** v1.5.2 du 12 avril 2026 ; 5,5k étoiles, releases signées
GPG, zéro dépendance JS côté client (Rust + WASM). Licence MIT.

**Verdict : la meilleure adéquation au cahier des charges** — seul moteur qui
indexe nativement des fiches structurées, avec facettes, bilinguisme et
chunking gratuits. Contrepartie : une dépendance à un outil Rust externe dans
le pipeline de build.

---

## 2. MiniSearch

**Sources.** [github.com/lucaong/minisearch](https://github.com/lucaong/minisearch) ·
[changelog](https://github.com/lucaong/minisearch/blob/master/CHANGELOG.md)

**Ce que c'est.** Bibliothèque de recherche côté client, zéro dépendance,
**5,8 Ko min+gzip** (changelog v7.0.0) ; exact/préfixe/fuzzy, ranking BM25+,
boosts de champs, auto-suggestions, `filter` (callback → facettes),
`loadJSONAsync` (index pré-sérialisé, donc constructible en CI).

**Limites.** Pas de stemming ni stop-words (« No stemming is performed ») ;
pas de chunking — le JSON intégral est téléchargé en un bloc à la première
recherche (~200-400 Kio gzip à 2 100 fiches, extrapolation ; ~5× à 10 000).
Le bilinguisme et les facettes restent du code maison.

**Maintenance.** 7.2.0 du 16 septembre 2025 — un an sans release ;
mainteneur principal unique (facteur bus). Licence MIT.

**Verdict : plan B solide si l'étape post-build est refusée** — mais il
conserve l'essentiel des pièges actuels (JSON global à télécharger, budgets à
surveiller, FR/EN et facettes à la main).

---

## 3. Fuse.js et lunr.js

**Sources.** [fusejs.io](https://fusejs.io/) ·
[github.com/krisk/Fuse](https://github.com/krisk/Fuse) ·
[github.com/olivernn/lunr.js](https://github.com/olivernn/lunr.js) · registre npm

**Fuse.js.** ~6,8-8,6 Ko gzip, très actif (7.5.0, juillet 2026),
Apache-2.0. Recherche floue Bitap orientée autocomplétion ; pas de facettes,
pas de ranking full-text comparable, tout le jeu de données en mémoire (Web
Workers récents, pas de chunking). La [doc Hugo](https://gohugo.io/tools/search/)
le référence via un gist « Hugo seul, sans npm ».

**lunr.js.** Vrai moteur full-text (index inversé TF-IDF), mais **2.3.9 du
19 août 2020 — dormant depuis six ans**, 105 issues ouvertes ; FR via le pack
tiers non audité `lunr-languages`.

**Verdict : Fuse.js moins adapté que MiniSearch ici** (fuzzy-first, sans
facettes) ; **lunr.js écarté** (maintenance gelée).

---

## 4. Recommandation Hugo officielle

**Source.** [gohugo.io/tools/search/](https://gohugo.io/tools/search/) (à jour
du 25 août 2026)

La doc officielle ne recommande pas une bibliothèque unique : elle documente
la génération d'un index via les formats de sortie Hugo, puis liste en tête
des outils open source… **Pagefind**, décrit comme *« fully static search
library… as little of your users' bandwidth as possible »*. Les workflows
lunr et le gist Fuse.js viennent ensuite ; Algolia DocSearch, Bonsai et
ExpertRec en commercial.

**Verdit : l'écosystème converge vers Pagefind** pour notre cas d'usage.

---

## 5. Options de contraste (écartées)

- **Algolia** — SaaS à clés API et crawl ; incompatible statique pur
  ([algolia.com](https://www.algolia.com)).
- **Meilisearch** — excellent mais processus serveur à opérer
  ([meilisearch.dev](https://www.meilisearch.dev)).
- **Typesense** — même constat, binaire serveur ([typesense.org](https://typesense.org)).

---

## Tableau comparatif

| Critère | Pagefind | MiniSearch | Fuse.js | lunr.js | moteur actuel |
|---|---|---|---|---|---|
| Corpus non-HTML | **natif** (`addCustomRecord`) | JSON à produire | JSON à produire | JSON à produire | natif (maison) |
| Empreinte client | WASM + chunks ; ~100 Kio typique par recherche | ~6 Ko + JSON intégral | ~8,6 Ko + JSON intégral | ~8,4 Ko + index lourd | 0 Ko lib. + JSON échelonnés |
| Croissance du catalogue | chunks : payload quasi constant | budget à surveiller | budget à surveiller | budget à surveiller | **budgets à réajuster** |
| Classement / fautes de frappe | oui (stemming, fuzzy) | BM25+ / fuzzy | fuzzy d'abord | TF-IDF / fuzzy | **non** |
| Facettes catégorie/tags | **native** | callback `filter` | à coder | à coder | à coder |
| FR / EN | **natif, stemming FR, UI FR** | à la main | à la main | pack tiers dormants | à la main (préfixes) |
| Étape post-build | oui (npx/binaire) | optionnelle | non | non | non |
| Dernière release | v1.5.2 · 2026-04 | 7.2.0 · 2025-09 | 7.5.0 · 2026-07 | 2.3.9 · **2020-08** | — |
| Risque maintenance | faible | moyen (bus) | faible | **élevé** | **porté par nous** |
| Licence | MIT | MIT | Apache-2.0 | MIT | — |

---

## Verdict éditorial

**(a) Pagefind post-build** est la seule option qui supprime simultanément les
quatre pièges du moteur actuel : budgets à réajuster (chunking), mini-format
propriétaire (index généré depuis `links.json` via la Node API), facettes et
bilinguisme à la main. La contrepartie est une dépendance build à un outil
externe — amortie par sa santé (releases signées, cadence annuelle, MIT) et
par la cohérence avec la recommandation de la doc Hugo.

**(b) MiniSearch + index pré-construit** ne retire que la partie scoring ;
il conserve budgets, facettes et bilinguisme à la main.

**(c) Simplifier le moteur maison** est l'option zéro-dépendance, mais
pérennise exactement le coût que l'on cherche à réduire ; la croissance
(×2,5 en cinq ans) la contredit.

**Angles morts restants.** Les 112 issues ouvertes de Pagefind n'ont pas été
auditées individuellement ; la compatibilité de l'UI Pagefind avec le langage
visuel « cartouche suisse » du site reste à valider par une intégration réelle
(le prototype ci-dessous n'a testé que les poids, pas le rendu).

---

## 6. Prototype et mesures réelles (2026-09-18)

Prototype jetable (hors dépôt) : build Hugo local réel
(`node scripts/build-site.mjs`, 33 s), indexation des **mêmes corpus** que les
index actuels via la Node API Pagefind 1.5.2 (`addCustomRecord`), texte
cherché identique (titre, catégorie, URL, description, note d'état, tags),
filtres `category` + `tag`, `language` par fiche. Corpus : 5 055 fiches
publiques par langue (2 099 éditorielles + 2 956 supplémentaires), soit
10 110 enregistrements fr+en.

### Poids des index actuels (gzip niveau 9, par langue)

| Index | Fiches | gzip | Budget codé | Consommation |
|---|---|---|---|---|
| base | 2 099 | 180,0 Kio | 200 Kio | **90 %** |
| descriptions | 2 099 | 164,4 Kio | 180 Kio | **91 %** |
| supplemental | 2 956 | 224,9 Kio | 240 Kio | **94 %** |
| details | 817 | 130,0 Kio | 140 Kio | **93 %** |
| **Total fr** | | **699,3 Kio** | | |
| **Total en** | | **698,0 Kio** | | |

À +15 fiches/semaine, le budget `base` (90 % consommé) éclate dans
~6 semaines — le commit #130 n'a fait que repousser l'échéance de quelques mois.

### Pagefind, même corpus

- Total **sur disque** : 5 516 Kio gzip (fragments 3 637 + index de mots
  1 412 (fr 705 / en 708) + filtres 80 + racine 386) — c'est du disque serveur,
  pas du réseau.
- **Payload d'une première recherche FR** : `pagefind.js` 12,6 + `wasm.fr`
  71 (précompressé, servi tel quel) + meta fr 30,5 + 1-2 chunks d'index de
  mots (médian 23,1 Kio) + ~10 fragments à 0,3-0,4 Kio ≈ **150-170 Kio**, puis
  **< 60 Kio par recherche suivante** (chunks de mots + fragments des
  résultats), quel que soit le nombre de fiches.
- Aujourd'hui : 180 Kio (base) au chargement + 164 Kio (descriptions) dès la
  première recherche sur les descriptions ≈ 344 Kio, et tout retéléchargé à
  chaque nouvelle publication (les noms de fichiers changent à chaque build).
- Depuis Pagefind v1.3.0, un fragment inchangé garde son nom de fichier :
  le cache navigateur/HTTP survit aux publications.

### Deux découvertes d'intégration

1. **Les URLs doivent différer par langue** : deux enregistrements de même
   URL mais de langues différentes sont fusionnés en une seule page (le
   premier essai a produit un index tout `en` et 5 055 fragments au lieu de
   10 110). Une intégration réelle utilise naturellement `/?l=<id>` côté FR et
   `/en/?l=<id>` côté EN, ce qui sépare proprement les index (`wasm.fr`,
   `pagefind.fr_*.pf_meta`, `fr_*.pf_index`…).
2. **Choix d'UI** : `pagefind-ui.js` 29,4 Kio gzip (clé en main), UI modulaire
   4,1 Kio, ou `pagefind.js` seul 12,6 Kio avec l'UI maison — cette dernière
   voie permet de conserver les cartouches suisses existants et de ne changer
   que le moteur.

### Verdict consolidé du prototype

Les poids réels confirment la recommandation Pagefind : payload par recherche
~2× plus léger à la première, ~6× plus léger ensuite, aucune limite à
réajuster à mesure que le catalogue croît, et la bibliothèque cliente
minimale (12,6 Kio) est plus légère que la logique de filtrage maison
actuelle. Le point restant à valider : le rendu UI (voir section 5).

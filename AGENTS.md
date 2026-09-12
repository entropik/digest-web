# Mémoire éditoriale du projet

## Conservation des liens

- Le Digest est aussi une archive de la fragilité du web : une ressource ne doit
  jamais être supprimée uniquement parce que son URL ne répond plus, redirige
  ailleurs ou que le service a disparu.
- Conserver l’adresse publique d’origine et documenter ce que la ressource était.
- Marquer explicitement ces entrées avec `status: "dead"`, ajouter une
  `status_note` lisible et le tag `lien-mort`.
- Dans l’interface, afficher « Lien mort · conservé pour mémoire » tout en
  laissant l’adresse originale consultable.
- Une URL privée, locale, authentifiée ou contenant des informations sensibles
  reste exclue : la conservation patrimoniale ne l’emporte jamais sur la
  sécurité ou la confidentialité.

## Validation éditoriale des destinations

- Une réponse HTTP réussie ne suffit pas à valider un lien : vérifier que le
  nom, l’activité et le contenu de la page correspondent bien à la ressource
  décrite.
- Ne jamais supposer que les variantes avec et sans `www`, avec ou sans trait
  d’union, appartiennent à la même entité. Les comparer comme des domaines
  indépendants avant de choisir l’adresse canonique.
- Si un domaine a été repris par un faux homonyme, un site de référencement ou
  une ferme de contenus, retrouver le site officiel à partir de l’identité et
  des projets de la ressource, puis corriger aussi le résumé et les tags.

## Import patrimonial du Blog OOBLIK

- Distinguer toujours les trois niveaux : `url` est la destination de
  consultation, `origin_url` le permalink WordPress de provenance et
  `archive_text` le texte conservé. Ne jamais remplacer automatiquement une
  destination externe valable par le permalink du billet.
- Une source explicite unique peut être reprise ; un lien ordinaire n’est
  restauré automatiquement que si son libellé, son URL et l’identité du billet
  concordent fortement. Les sources multiples, homonymes et redirections vers
  une autre identité restent en revue.
- Les pages de revue, le WXR, les overrides, les résultats de recherche et les
  2,7 Go de médias FTP restent dans `import/wordpress/` ou `import-blog/`, hors
  Git. Seuls le catalogue final et les WebP réellement retenus sont versionnés.
- Un second `--apply` doit être idempotent : aucun nouvel identifiant, aucune
  URL en double et aucune perte de texte, de provenance ou de métadonnées de
  lien mort.

## Version du site

- Toute évolution fonctionnelle, technique ou visuelle destinée à être déployée
  doit mettre à jour la version affichée dans `params.footer.text` de
  `hugo.yaml` ainsi que la version de l’administration affichée dans
  `admin-service/src/admin-assets.ts`. Ces deux versions doivent toujours être
  identiques ; adapter aussi le test correspondant dans
  `admin-service/test/admin-assets.test.ts`.
- Appliquer SemVer simplement : incrémenter le correctif pour une correction,
  une optimisation ou de la maintenance, la version mineure pour une nouvelle
  fonctionnalité, et la version majeure pour une refonte incompatible.
- Une publication purement éditoriale du Digest ne change pas la version du
  site.
- Après fusion et déploiement, créer le tag Git annoté correspondant sur le
  commit effectivement déployé, puis vérifier que la même version apparaît dans
  le pied de page public et dans l’en-tête de l’administration.

## Visuels des dossiers Focus

- Chaque édition Focus doit obligatoirement avoir son propre visuel d’archive
  technique historique (`archive_image`), sans jamais réutiliser un visuel déjà
  assigné à une édition précédente.
- Avant de choisir un visuel, vérifier la liste des visuels déjà attribués dans
  `content/archives/*.md` et dans `FOCUS_ARCHIVES_BY_DATE` de
  `admin-service/src/social-image.ts`.
- Registre des visuels Focus utilisés :
  - `2026-08-28` : `2026-03-12.jpg` (Christine Darden · Computer Room · 1973)
  - `2026-08-29` : `2026-03-13.jpg` (Data Processing · Ames Research Center)
  - `2026-09-02` : `2026-04-17.jpg` (Gemini 7 · Mission Control · 1965)
  - `2026-09-09` : `2026-04-16.jpg` (IBM 704 Computer Operations · 1957)
  - `2026-09-12-herdr-vs-orca` : `2026-03-30.jpg` (Clifford Charlesworth · Mission Control · 1968)
- Pour tout nouveau dossier Focus : sélectionner un visuel inédit dans la
  collection NASA (`static/media/journal-procrastinateur/collections/v2-nasa/`),
  générer sa version 1200×800 dans `static/social/focus-archives/` via
  `admin-service/scripts/focus-archive-assets.ts`, l'ajouter à `TECHNICAL_ARCHIVES`
  et `FOCUS_ARCHIVES_BY_DATE` dans `admin-service/src/social-image.ts`, et mettre
  à jour ce registre.

## Coexistence du Digest quotidien et des éditions Focus

- Un billet de Digest quotidien (`content/archives/YYYY-MM-DD.md`) et un ou
  plusieurs billets Focus (`content/archives/YYYY-MM-DD-<slug>.md`) peuvent
  parfaitement coexister à la même date civile.
- Le Digest quotidien porte les liens de la veille ou du jour ; ses visuels
  sociaux sont `static/social/YYYY-MM-DD.png` et
  `static/social/YYYY-MM-DD-linkedin.png`.
- Chaque billet Focus porte son propre slug, son visuel d’archive NASA dédié
  (`archive_image`), et ses propres cartes sociales
  `static/social/YYYY-MM-DD-<slug>.png` et
  `static/social/YYYY-MM-DD-<slug>-linkedin.png`.
- Pour restreindre les liens affichés en bas d’un Focus aux seules ressources
  citées dans l’article, déclarer `link_urls: ["..."]` dans le front matter. En
  l’absence de cette clé sur un billet sluggué, aucun lien sans rapport n’est
  hérité du Digest quotidien du même jour.

## Direction de l’interface

- L’identité visuelle s’inspire de la rigueur du style typographique suisse et
  des cartouches de plans d’architecte : grille explicite, filets fins,
  numérotation, hiérarchie nette et densité maîtrisée.
- Éviter les effets décoratifs génériques. La navigation des catégories ne doit
  pas reprendre la forme de pilules arrondies : préférer des cellules
  rectangulaires structurées. Réserver les formes rondes aux contrôles dont la
  fonction les justifie, comme les favoris.
- Les commandes `Précédent` et `Suivant` appartiennent au même langage : elles
  forment avec le folio central un cartouche compact à filets partagés, sans
  boutons arrondis isolés.
- Les interactions doivent prolonger cette logique spatiale. Lorsqu’une
  catégorie est sélectionnée, son cartouche reste à gauche, les autres
  s’effacent et sa fiche descriptive apparaît à droite ; sur petit écran, les
  deux éléments s’empilent.
- `data/categories.json` est la source de vérité de la taxonomie publique et
  privée. Afficher aussi les catégories sans lien, conserver leur description
  administrable et ne jamais coder leurs noms en dur dans les gabarits.
- Toute animation doit rester brève, informative et désactivable via
  `prefers-reduced-motion`. Préserver le focus clavier, les états
  `aria-pressed`, un retour explicite à toutes les catégories et l’absence de
  débordement horizontal.
- Vérifier les évolutions visuelles dans un navigateur réel sur ordinateur et
  mobile. Le guide durable se trouve dans `docs/interface.md`.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles mapped to repository labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repository layout (`CONTEXT.md` and `docs/adr/` at the repo root). See `docs/agents/domain.md`.

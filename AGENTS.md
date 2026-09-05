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

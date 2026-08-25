# Plans d’implémentation

Générés avec le skill `improve` le 16 août 2026. Exécuter les plans dans
l’ordre ci-dessous, sauf indication contraire dans leurs dépendances. Chaque
exécuteur doit lire le plan en entier, respecter ses conditions d’arrêt et
mettre à jour sa ligne quand le travail est terminé.

## Ordre d’exécution et statut

| Plan | Titre | Priorité | Effort | Dépend de | Statut |
|---|---|---|---|---|---|
| 001 | Publier un Digest en une action avec un suivi progressif fiable | P1 | M | — | DONE |
| 002 | Intégrer les visuels patrimoniaux du Blog OOBLIK | P1 | L | — | DONE |

Valeurs de statut : `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED` (avec une raison),
`REJECTED` (avec une justification).

## Notes de dépendance

- Le plan 001 est autonome.
- Le plan 002 est terminé sur `codex/002-visuels-blog-ooblik` et validé dans le
  worktree isolé ; sa fusion reste une décision du mainteneur.

## Pistes examinées et écartées

- Ajouter un pourcentage artificiel : les workflows ne fournissent pas une
  progression assez fine. Le plan utilise quatre étapes réelles et une
  animation indéterminée uniquement sur l’étape active.
- Modifier les workflows GitHub Actions ou le schéma SQLite : les états
  existants suffisent au suivi demandé et ces changements augmenteraient le
  risque sans simplifier le parcours.
- Refactoriser tout `admin-assets.ts` dans ce chantier : souhaitable à terme,
  mais sans lien direct avec la publication en une action.

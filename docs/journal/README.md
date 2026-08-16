# Journal du projet

Le journal commence avec le premier commit du dépôt. Un billet est créé pour
chaque journée ayant produit une évolution du projet.

| Date | Billet | Commits | Sujet principal |
|---|---|---:|---|
| 24 juillet 2026 | [Naissance du Digest et restauration de Pinboard](2026-07-24.md) | 11 | Socle Hugo, archives et déploiement |
| 25 juillet 2026 | [Exploration des tags et reprise de 2017](2026-07-25.md) | 10 | Tags, cache et éditions historiques |
| 26 juillet 2026 | [Favoris locaux et nouvelles éditions](2026-07-26.md) | 4 | Favoris privés et restauration |
| 27 juillet 2026 | [Administration et curation depuis Chrome](2026-07-27.md) | 15 | Admin, extension, publication et Web Store |
| 16 août 2026 | [Publication progressive et environnement WSL](2026-08-16.md) | 1 | Publication en une action, suivi et normalisation Git |

## Provenance

Git constitue la source factuelle pour les dates, commits et fichiers. Les
résultats de GitHub Actions apportent l’état des validations et déploiements.

Les conversations ne sont pas stockées intégralement dans le dépôt. Pour les
24, 25 et 26 juillet, la section « Demandes et échanges » est donc une
reconstitution prudente à partir des commits et de leurs diffs. Le billet du
27 juillet reprend aussi les décisions explicites de la conversation de
conception de l’extension.

Les 71 exécutions GitHub Actions visibles pour cette période sont toutes
réussies. Elles proviennent principalement de
[`Validate`](https://github.com/entropik/digest-web/actions/workflows/ci.yml)
et de
[`Deploy production`](https://github.com/entropik/digest-web/actions/workflows/deploy.yml) :

| Date | Exécutions | Réussies | Échouées |
|---|---:|---:|---:|
| 24 juillet | 16 | 16 | 0 |
| 25 juillet | 17 | 17 | 0 |
| 26 juillet | 8 | 8 | 0 |
| 27 juillet | 30 | 30 | 0 |

Une exécution correspond à un workflow, pas nécessairement à un déploiement
distinct : les workflows de validation et de production sont généralement
déclenchés ensemble.

Le relevé initial couvre les 40 commits allant de `15a33606` à `25128b45`.
Le commit qui introduit matériellement cette documentation n’est pas inclus
dans son propre relevé afin d’éviter une autoréférence impossible à stabiliser.

## Continuer le journal

Copier [le modèle](TEMPLATE.md) pour chaque nouvelle journée active. Les
commits doivent être liés à GitHub et les affirmations de déploiement doivent
être fondées sur un workflow ou une vérification publique.

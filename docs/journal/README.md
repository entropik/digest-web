# Journal du projet

Le journal commence avec le premier commit du dépôt. Un billet est créé pour
chaque journée ayant produit une évolution du projet.

| Date | Billet | Commits | Sujet principal |
|---|---|---:|---|
| 24 juillet 2026 | [Naissance du Digest et restauration de Pinboard](2026-07-24.md) | 11 | Socle Hugo, archives et déploiement |
| 25 juillet 2026 | [Exploration des tags et reprise de 2017](2026-07-25.md) | 10 | Tags, cache et éditions historiques |
| 26 juillet 2026 | [Favoris locaux et nouvelles éditions](2026-07-26.md) | 4 | Favoris privés et restauration |
| 27 juillet 2026 | [Administration et curation depuis Chrome](2026-07-27.md) | 15 | Admin, extension, publication et Web Store |
| 16 août 2026 | [Publication, identité visuelle et partage LinkedIn](2026-08-16.md) | 33 | Publication progressive, images sociales et diffusion LinkedIn |
| 17 août 2026 | [Actions éditoriales et captures LinkedIn durcies](2026-08-17.md) | 11 | Administration des liens, favicons et captures sécurisées |
| 18 août 2026 | [Le carré LinkedIn, du faux succès au post visible](2026-08-18.md) | 17 | Images carrées, upload synchrone et récupération des posts invisibles |
| 20 août 2026 | [Du cartouche suisse à la mémoire du Blog OOBLIK](2026-08-20.md) | 24 | Taxonomie, registre suisse et import patrimonial WordPress |
| 25 août 2026 | [Répéter sans effacer sur LinkedIn](2026-08-25.md) | 3 | Republication volontaire et historique LinkedIn |

## Provenance

Git constitue la source factuelle pour les dates, commits et fichiers. Les
résultats de GitHub Actions apportent l’état des validations et déploiements.

Les conversations ne sont pas stockées intégralement dans le dépôt. Pour les
24, 25 et 26 juillet, la section « Demandes et échanges » est donc une
reconstitution prudente à partir des commits et de leurs diffs. Le billet du
27 juillet reprend aussi les décisions explicites de la conversation de
conception de l’extension.

Le relevé initial des quatre journées de juillet comptait 71 exécutions GitHub
Actions, toutes réussies. Elles provenaient principalement de
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

Ce relevé d’exécutions reste un instantané historique et ne prétend pas couvrir
les journées des 16 et 17 août.

Le relevé initial du journal couvre les 40 commits allant de `15a33606` à
`25128b45`.
Le commit qui introduit matériellement cette documentation n’est pas inclus
dans son propre relevé afin d’éviter une autoréférence impossible à stabiliser.

## Continuer le journal

Copier [le modèle](TEMPLATE.md) pour chaque nouvelle journée active. Les
commits doivent être liés à GitHub et les affirmations de déploiement doivent
être fondées sur un workflow ou une vérification publique.

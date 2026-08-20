# Documentation d’OOBLIK Digest

Cette documentation raconte autant le fonctionnement actuel du projet que la
façon dont il a été construit. Elle complète le `README.md`, qui reste centré
sur l’installation et l’exploitation.

## État documenté

Dernière mise à jour : 20 août 2026.

- 4 005 liens dans le catalogue ;
- 837 éditions archivées ;
- 937 pages de tags ;
- journal couvrant huit journées actives, du 24 juillet au 20 août 2026 ;
- site public Hugo, administration propriétaire et extension Chrome de
  curation, taxonomie administrable, images sociales et publication LinkedIn
  native.

## Parcours de lecture

- [Architecture](architecture.md) : composants, données et flux de
  publication.
- [Principes d’interface](interface.md) : identité suisse, cartouches,
  interactions et accessibilité.
- [Décisions](decisions.md) : choix structurants et raisons de ces choix.
- [Journal du projet](journal/README.md) : billets quotidiens, conversations,
  commits, validations et déploiements.
- [Procédure Chrome Web Store](../browser-extension/CHROME_WEB_STORE.md) :
  préparation et diffusion de l’extension.
- [Exploitation de l’administration](operations.md) : récupération des états
  de publication ambigus et opérations sensibles.

## Règle de maintenance

Une journée qui modifie le projet doit produire ou compléter un billet
`docs/journal/YYYY-MM-DD.md`. Le billet ne remplace pas Git : il explique
l’intention, les arbitrages et le résultat que les diffs seuls ne racontent
pas.

Le [modèle de billet](journal/TEMPLATE.md) distingue :

- les demandes et conversations ;
- les décisions prises ;
- les changements réalisés ;
- les validations et déploiements ;
- les commits de référence ;
- les suites ouvertes.

Les secrets, données privées de curation, adresses sélectionnées et
identifiants d’authentification ne doivent jamais apparaître dans ce journal.

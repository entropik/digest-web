---
title: "Règles de confidentialité"
description: "Règles de confidentialité de l’extension Chrome OOBLIK Digest — Curation."
url: "/confidentialite/"
aliases:
  - "/confidentialite-extension/"
lastmod: 2026-07-27
---

Les présentes règles décrivent les données traitées par l’extension Chrome
**OOBLIK Digest — Curation**, leur utilisation et les choix laissés à
l’utilisateur.

L’objectif unique de l’extension est d’enregistrer manuellement la page active
dans la file éditoriale privée d’OOBLIK Digest afin de préparer une future
édition. Elle est destinée au propriétaire du Digest.

## Données traitées

L’extension ne lit une page qu’après une action explicite sur son icône ou son
raccourci clavier. Elle peut alors préremplir le formulaire avec :

- l’adresse de la page active et son éventuelle adresse canonique ;
- son titre et sa meta description ;
- le texte éventuellement sélectionné par l’utilisateur ;
- la catégorie, le résumé et les tags saisis ou corrigés dans le formulaire ;
- une note éditoriale privée saisie par l’utilisateur.

Ces données relèvent principalement de l’historique Web et du contenu du site
Web au sens du Chrome Web Store. L’extension ne surveille pas la navigation, ne
constitue aucun historique général et ne collecte rien en arrière-plan.

## Moment de l’envoi et finalité

Toutes les informations sont affichées dans le formulaire avant leur envoi.
Elles ne sont transmises qu’au clic sur « Enregistrer le brouillon », en HTTPS,
vers `digest.ooblik.com`.

Elles servent exclusivement à :

- préremplir et enregistrer un brouillon éditorial privé ;
- détecter les doublons ;
- préparer, relire et publier volontairement une édition du Digest ;
- assurer la traçabilité technique et éditoriale des publications.

L’extension n’utilise pas les données pour la publicité, le profilage, la
mesure d’audience commerciale, le crédit ou toute autre finalité.

## Données privées et publication

Le texte sélectionné et la note éditoriale restent privés. Ils ne sont jamais
ajoutés au catalogue public, aux archives publiques ni aux commits Git.

L’URL, le titre, le résumé, la catégorie et les tags ne deviennent publics
qu’après une publication explicitement confirmée depuis l’administration. Cette
publication est une action distincte de l’enregistrement du brouillon.

## Conservation et suppression

Les brouillons sont stockés dans la base privée du service d’administration.
Un brouillon actif peut être modifié ou supprimé depuis cette administration.

Après publication, son historique privé peut être conservé afin d’assurer la
traçabilité, la reprise idempotente et la déduplication. Les notes privées
restent privées pendant cette conservation. Les métadonnées volontairement
publiées suivent la politique de mémoire éditoriale du Digest.

## Authentification, accès et partage

Le service exige la session GitHub du propriétaire autorisé. Aucun jeton GitHub
ou secret d’administration n’est lu ou stocké par l’extension.

Les données ne sont ni vendues, ni utilisées pour la publicité, ni transmises à
des tiers pour leur propre usage. GitHub reçoit uniquement les métadonnées que
le propriétaire décide explicitement de publier, afin de versionner et déployer
le Digest.

## Sécurité

Les transmissions entre l’extension et `digest.ooblik.com` utilisent HTTPS. Le
service d’administration exige une authentification propriétaire, limite les
origines autorisées et conserve ses données dans un espace serveur privé.

L’extension n’utilise aucun code distant : tout le JavaScript exécuté est inclus
dans le package distribué par le Chrome Web Store.

## Permissions Chrome

- `activeTab` permet de lire l’URL et le titre de l’onglet actif uniquement
  après une action de l’utilisateur ;
- `scripting` permet d’extraire ponctuellement l’adresse canonique, la meta
  description et le texte sélectionné ;
- l’accès à `https://digest.ooblik.com/*` permet de vérifier la session et
  d’enregistrer le brouillon dans l’administration privée.

L’extension ne demande ni accès à tous les sites, ni accès à l’API des cookies.

## Utilisation limitée

L’utilisation des informations reçues par l’extension respecte le règlement
Chrome Web Store relatif aux données utilisateur, y compris les exigences
**Limited Use**. Les données sont utilisées uniquement pour fournir la fonction
de curation décrite sur cette page.

## Modifications et contact

Toute modification substantielle de ces pratiques sera publiée sur cette page
et signalée dans l’extension lorsque cela est requis.

Pour toute question, utiliser les coordonnées indiquées sur la page
[À propos](/a-propos/).

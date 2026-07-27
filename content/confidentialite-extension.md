---
title: "Confidentialité de l’extension"
description: "Données utilisées par l’extension Chrome de curation d’OOBLIK Digest."
---

L’extension **OOBLIK Digest — Curation** sert uniquement à enregistrer, sur
action explicite de son propriétaire, une page web dans la file éditoriale
privée du Digest.

## Données traitées

Après un clic sur l’icône ou le raccourci, l’extension lit dans l’onglet actif :

- l’adresse de la page et son éventuelle adresse canonique ;
- son titre et sa meta description ;
- le texte que le propriétaire a volontairement sélectionné.

Elle ne surveille pas la navigation et ne collecte rien en arrière-plan.

## Utilisation et conservation

Les informations sont affichées dans un formulaire avant d’être envoyées en
HTTPS à `digest.ooblik.com`. Les brouillons sont stockés dans la base privée du
service d’administration.

Le texte sélectionné devient une note éditoriale privée. Il n’est jamais ajouté
au catalogue public ni aux commits Git. L’URL, le titre, le résumé, la catégorie
et les tags ne deviennent publics qu’après la publication explicite d’un
Digest.

Les brouillons supprimés avant publication sont effacés. Après publication, un
enregistrement privé minimal est conservé pour assurer la traçabilité et la
déduplication. L’historique public suit la politique de mémoire éditoriale du
Digest.

## Accès et partage

Le service exige la session GitHub du propriétaire autorisé. Aucun jeton GitHub
ou secret d’administration n’est stocké dans l’extension.

Les données ne sont ni vendues, ni utilisées pour la publicité, ni transmises à
des tiers sans rapport avec cette fonction. GitHub reçoit uniquement les
métadonnées que le propriétaire décide de publier, afin de versionner et
déployer le Digest.

Pour toute question, utiliser les coordonnées indiquées sur la page
[À propos](/a-propos/).

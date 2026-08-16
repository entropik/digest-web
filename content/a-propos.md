---
title: "À propos"
date: 2026-07-24
ShowBreadCrumbs: false
---

J’ai un rapport assez personnel au Web : quelque part entre la curiosité méthodique et l’entropie joyeuse.

Chez moi, une session de navigation ressemble rarement à une ligne droite. Elle commence avec une question, bifurque vers un outil, ouvre un article, trois dépôts GitHub et une vidéo, puis finit avec douze mille onglets répartis dans plusieurs fenêtres, plusieurs navigateurs et parfois plusieurs machines. Ce désordre n’est pas seulement une mauvaise habitude : c’est aussi ma façon d’explorer, de relier des idées et de laisser la curiosité faire son travail.

Le problème, évidemment, c’est de retrouver ce qui méritait vraiment d’être gardé.

## Une mémoire pour mon Web

J’entretiens des Digest depuis des années. Ils sont à la fois des carnets de veille, des marque-pages commentés et des instantanés de mes obsessions du moment : intelligence artificielle, outils pour développeurs, design, photographie, édition, fabrication numérique, logiciels libres ou curiosités difficiles à classer.

Ce site transforme cette accumulation en une mémoire plus durable. Les liens sont dédupliqués, débarrassés autant que possible de leurs paramètres de suivi, classés par sujet et accompagnés d’un court résumé. Les archives permettent de retrouver chaque édition et les tags font apparaître les thèmes qui reviennent au fil du temps.

La sélection reste volontairement personnelle. Il ne s’agit ni d’un flux d’actualité exhaustif ni d’une collection automatisée de tout ce qui passe. Je garde ce qui m’intrigue, ce qui peut devenir utile, ce qui nourrit une idée — et parfois ce dont je ne sais pas encore quoi faire.

## Pourquoi « Digest » ?

Le nom est aussi un hommage à mon papi Richard. Il a été abonné au *Reader’s Digest* pendant presque toute sa vie. Il nous faisait lire ces livres, nous en parlait et nous offrait également les éditions spéciales jeunesse. Ces volumes qui rassemblaient des histoires, des découvertes et des portes ouvertes sur le monde m’ont toujours fasciné.

Avec le recul, mes Digest prolongent un peu ce geste : choisir, rassembler et transmettre ce qui a éveillé la curiosité. Le support a changé et les livres sont devenus des liens, mais l’envie reste la même — partager des choses qui donnent envie de lire, de comprendre et d’aller voir plus loin.

## Des images générées par le code

Chaque édition produit automatiquement une affiche unique de 1 200 × 627 pixels. Elle n’est pas créée par une IA : elle est entièrement composée par un générateur graphique développé pour le Digest.

Une empreinte SHA-256 de la date, du titre et de la description initialise un générateur pseudo-aléatoire déterministe. Une même édition conserve donc toujours la même image, tandis que chaque nouveau Digest obtient sa propre composition.

Le système choisit parmi trois familles graphiques — collisions, écrans ou grilles brisées — puis fait varier la structure, les couleurs, les rotations, les trames, les textures d’encre, le bruit et les accidents visuels. La palette associe le rouge, le noir et le papier à une couleur d’accent. La description, la date et le nombre de liens sont intégrés automatiquement, avec une gestion du retour à la ligne et de la longueur des textes.

L’image est d’abord construite en SVG. Elle est ensuite rendue avec Resvg en utilisant exclusivement la police Bricolage Grotesque fournie par le site, sans dépendre des polices installées sur le serveur. Le PNG obtenu est enfin optimisé avec Sharp : palette limitée à 256 couleurs, compression maximale et contrôle d’un poids inférieur à 500 Ko.

Le hasard intervient dans la composition, mais jamais dans la reproductibilité du résultat.

## Partager sur LinkedIn

Partager simultanément un texte, une URL et une grande image s’est révélé peu fiable avec les aperçus Open Graph et les outils de partage des navigateurs.

Le Digest utilise donc directement l’API LinkedIn : l’affiche est téléversée comme un véritable média, puis associée au texte et à l’URL de l’édition. Avant l’envoi, une fenêtre permet de rédiger le post, de modifier les hashtags calculés à partir des tags du Digest et de confirmer explicitement la publication.

## Geek, imprimeur et photographe

Je suis Marc Tallec, geek depuis suffisamment longtemps pour avoir connu plusieurs Web, mais aussi imprimeur et photographe. J’aime autant comprendre comment fonctionne un outil que voir ce qu’il permet de fabriquer : une image, un livre, une interface, un service ou une nouvelle manière de travailler.

Vous pouvez retrouver mon travail personnel sur [marctallec.com](https://marctallec.com/). Avec Claire, je développe aussi [OOBLIK](https://ooblik.com/), notre atelier consacré à l’image, à l’impression et aux objets éditoriaux.

Ce Digest est donc mon espace de décantation : une tentative de transformer le bruit, les fenêtres ouvertes et mon entropie numérique en quelque chose de partageable — ce qui mérite d’être gardé… ou pas.

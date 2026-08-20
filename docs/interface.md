# Principes d’interface

L’interface d’OOBLIK Digest traduit une archive éditoriale personnelle. Elle ne
cherche pas à ressembler à un tableau de bord générique : elle doit évoquer un
registre précis, construit et durable.

## Direction visuelle

Deux références structurent le langage graphique :

- la rigueur du style typographique suisse, pour la grille, les alignements, la
  hiérarchie et l’économie de moyens ;
- les cartouches de plans d’architecte, pour les filets, les indices, les
  cellules et la relation entre information principale et métadonnées.

Cette inspiration n’impose pas une imitation historique. Elle fournit une
discipline : peu d’encres, des formes rectilignes, une typographie franche et
des détails utiles. Le rouge signale, le noir structure et le fond laisse
respirer le contenu.

Les arrondis ne sont pas interdits partout. Ils doivent correspondre à une
fonction identifiable, comme le cœur des favoris. La navigation taxonomique,
elle, reste rectangulaire et ne prend pas la forme de pilules.

## Registre des catégories

Au repos, les catégories forment un index compact :

- chaque cellule porte un indice, un nom et un compteur ;
- les filets partagés donnent la sensation d’un seul tableau plutôt que d’une
  collection de boutons indépendants ;
- `Tout`, `Aléatoire` et `Favoris` appartiennent au même système de repérage ;
- une catégorie configurée apparaît même lorsque son compteur vaut zéro.

Lorsqu’une catégorie éditoriale est activée, l’index passe en mode focus :

1. les autres cellules s’effacent ;
2. le cartouche sélectionné se place à gauche ;
3. sa description apparaît dans une fiche à droite ;
4. une commande explicite restaure toutes les catégories.

Sur mobile, le cartouche et la fiche s’empilent dans cet ordre. La composition
ne doit jamais créer de défilement horizontal.

## Pagination et folios

La pagination prolonge le registre au lieu d’introduire deux boutons génériques.
`Précédent`, le folio et `Suivant` forment un cartouche unique à trois cellules,
avec des filets partagés et aucun arrondi. Le centre emploie une notation courte
de type `Folio 01/21 · 1045 liens` ; les cellules latérales utilisent une flèche
comme indice directionnel et s’inversent en noir au survol ou au focus.

Le cartouche conserve ses trois cellules sur mobile. Les dimensions et la
typographie se resserrent, mais l’ordre et les libellés restent stables afin de
ne pas transformer la pagination en une autre interface selon la largeur.

## Taxonomie et contenu

`data/categories.json` est la source de vérité. Chaque entrée possède un `name`
et une `description`. Les gabarits publics utilisent cette donnée même si aucun
lien ne porte encore la catégorie ; les noms ne doivent donc jamais être codés
en dur.

Le filtre `Tout` reste limité à la sélection éditoriale principale et n’absorbe
pas les publications classées dans les flux. Le compteur et le filtre d’une
catégorie portent en revanche sur tous ses liens publics : une catégorie comme
« Mémoire du web social » peut donc ouvrir ses archives Twitter, Instagram,
Tumblr et blog sans transformer la page d’accueil en flux continu.

Les cartes issues des « Archives du blog OOBLIK » peuvent recevoir un bandeau
photographique 16:9 local. L’image réserve sa hauteur avant chargement, garde
des angles droits et un filet inférieur. La même image ouvre la modale ; une
carte sans image conserve exactement la composition typographique habituelle.

Après un changement de folio, le début de la nouvelle grille doit être aligné
juste sous l’en-tête et le cartouche de filtres sticky. Le calcul de défilement
s’ancre sur la position naturelle de la grille, jamais sur la position visuelle
du cartouche devenu collant.

La description est un court texte d’orientation éditoriale, pas une suite de
mots-clés. En son absence, l’interface peut afficher une phrase de repli sobre,
mais le texte administré reste prioritaire.

## Mouvement et accessibilité

Le mouvement explique un changement d’état : retrait de l’index, déplacement
du cartouche, arrivée de la fiche. Il reste court et ne doit pas devenir une
signature autonome.

- utiliser de vrais boutons pour les filtres ;
- synchroniser l’état visuel avec `aria-pressed` ;
- conserver un retour clavier visible vers l’index complet ;
- restaurer le focus sur `Tout` après ce retour ;
- désactiver transitions et animations avec `prefers-reduced-motion` ;
- vérifier contraste, lisibilité et débordements sur ordinateur et mobile.

## Points d’implémentation

- gabarit et données : `layouts/index.html` et `data/categories.json` ;
- composition visuelle : `assets/css/extended/digest.css` ;
- état, filtres et focus : `assets/js/digest.js` ;
- gestion éditoriale : `admin-service/src/admin-assets.ts`.

Toute évolution importante de ce système doit être contrôlée dans un navigateur
réel aux états repos, focus et retour, sur un écran large et un écran mobile.

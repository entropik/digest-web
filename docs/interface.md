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

## Journal du Digest

Le Journal du Digest est un carnet de développement public distinct des flux
patrimoniaux. Sa source unique reste `docs/journal/YYYY-MM-DD.md` : Hugo en
extrait la date, le titre, le résumé et le corps complet sans recopier les
billets dans `content/`.

Sur la page Flux, un bandeau-cartouche pleine largeur précède les quatre flux
historiques. L’index du journal utilise un registre de deux colonnes sur grand
écran et d’une colonne sur mobile. Une navigation jointive par année et par
mois mène à des ancres stables ; la page de chaque billet se termine par le
cartouche `Précédent · Index · Suivant`. Le journal possède son propre flux RSS
et ne modifie jamais le flux `blog-ooblik`.

Le résumé n’apparaît qu’une fois dans l’en-tête du billet : sa section source
sert aux métadonnées, à l’index et au RSS, puis est retirée du corps rendu. Sur
mobile, le nombre de billets et la date de départ partagent un cartouche
horizontal ; l’année et les deux mois publiés tiennent sur une même rangée,
tandis que les cellules Repères et RSS conservent toute la largeur.

Dans un billet, les paragraphes et les éléments de liste sont justifiés avec
césure française ; les titres restent alignés à gauche. Les registres de
commits indiquent la date et l’heure de chaque objet Git en heure de Paris et
gardent les identifiants et horodatages compacts et insécables. La colonne Objet
revient seule sur plusieurs lignes afin que le tableau reste toujours contenu
dans la largeur disponible, sans ascenseur horizontal. Les listes conservent
un retrait intérieur suffisant pour que leurs marqueurs restent dans la zone de
lecture.

Chaque résumé public tient en trois phrases maximum. Chaque carte reçoit un
bandeau issu d’un corpus local de cent affiches américaines des années 1940 et
1950 ; la page du billet reprend la même image, entière et presque bord à bord,
dans un cadre qui suit ses proportions afin de réduire le blanc tournant.
`data/journal_posters.json` garde titre, date, droits, source
IIIF et attribution, tandis que `scripts/scrape-journal-posters.mjs` permet de
reconstruire le corpus depuis Northwestern University Libraries. Le crédit et
le lien vers la fiche originale restent visibles sous l’image du billet. Le
titre d’une carte passe au corail au survol et au focus, sans supprimer
l’inversion générale de la cellule. Dans chaque billet, l’administration peut
ouvrir le compositeur « Publier sur LinkedIn » avec l’affiche carrée du billet ;
ce contrôle reste caché aux visiteurs non authentifiés.

## Grille des archives

Sur grand écran, les éditions archivées forment un registre de trois colonnes ;
la grille passe à deux colonnes sur tablette puis à une seule sur mobile. Les
affiches sont unifiées par l’encre corail au repos et retrouvent leur palette
d’origine au survol comme au focus clavier. Le folio des archives reprend le
même cartouche à trois cellules jointives que la pagination des liens, y compris
sur petit écran.

Sur la page d’une édition, le titre principal commence toujours par
`DIGEST -`. Le texte éditorial emploie un retrait de première ligne de `1,75 em`
pour chaque paragraphe, et les intertitres ménagent une respiration nette avant
et après. L’affiche est affichée entière dans ses proportions propres : une
version carrée ne doit jamais être recadrée au ratio panoramique de l’image Open
Graph.

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

Dans la modale, la destination actuelle et la provenance historique ne se
concurrencent pas. La première ligne présente, dans cet ordre, l’URL de
destination, Favoris et l’action principale « Visiter le site ». Un second
filet introduit ensuite « Billet d’origine » comme lien discret vers le
permalink WordPress. Sans provenance, cette seconde ligne disparaît
complètement. Sur mobile, les trois éléments principaux s’empilent sans changer
d’ordre et sans créer de débordement horizontal.

Après un changement de folio, le début de la nouvelle grille doit être aligné
juste sous l’en-tête et le cartouche de filtres sticky. Le calcul de défilement
s’ancre sur la position naturelle de la grille, jamais sur la position visuelle
du cartouche devenu collant.

La description est un court texte d’orientation éditoriale, pas une suite de
mots-clés. En son absence, l’interface peut afficher une phrase de repli sobre,
mais le texte administré reste prioritaire.

Dans l’administration, les tags sont facultatifs et limités à trois par lien.
La saisie utilise une recherche dans le seul registre actif de `data/tags.json`,
jamais une liste déroulante contenant les tags historiques. Les sélections
prennent la forme de cartouches rectangulaires supprimables au clavier. Le
panneau `Tags` permet de créer, documenter, renommer, fusionner, archiver et
réactiver une définition. Il sépare les vues actives et archivées, signale les
tags créés depuis l’extension qui restent à documenter et affiche les usages
dans les liens et les brouillons. Une ancienne route reste conservée après
fusion ou archivage.

Dans l’extension, les suggestions automatiques précèdent la recherche dans le
registre. Une création nouvelle est une action distincte, confirmée et décrite
comme une modification du registre public ; elle n’est jamais déclenchée par la
seule saisie d’un texte.

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

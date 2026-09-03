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

## Ponctuation et retours à la ligne

Ne pas laisser la ponctuation seule en début de ligne. La règle globale
`line-break: strict`, complétée par `text-wrap: pretty` pour la prose, accompagne
les espaces insécables avant `: ; ! ? »` et après `«`. Un point, une virgule ou
des points de suspension se collent au mot précédent.

`static/js/typography.js` applique ces corrections aux nœuds de texte affichés,
sur toutes les pages publiques et dans l’administration, puis aux contenus
ajoutés dynamiquement. Il ne modifie ni les données enregistrées ni les URL et
attributs. Le code, les champs de saisie et les zones éditables sont exclus ;
`data-typography="off"` permet de préserver un autre texte littéral. Les sources
éditoriales nouvelles doivent employer directement les espaces insécables,
pour conserver cette qualité même sans JavaScript.

Ces corrections suivent la langue du document : `typography.js` ignore les
pages dont l’attribut `lang` commence par `en`. La version anglaise conserve
ainsi sa propre ponctuation, sans insertion d’espaces françaises.

Sur le site public, Hugo donne à ce script une URL avec empreinte de contenu.
Dans l’administration et son aperçu local, le même script est inclus dans
`/admin/app.js` : il ne dépend pas du déploiement séparé du site statique et
ne peut pas charger prématurément un fichier encore absent, puis mis en cache
comme une erreur 404.

Ne jamais imposer `white-space: nowrap` à tout un paragraphe : le texte doit
continuer à s’adapter à l’écran. Vérifier la phrase signalée dans l’édition du
29 août 2026, les cartes et les modales, sur ordinateur et à 320 px de largeur.

## Langue de consultation

Le sélecteur `FR / GB` reste dans l’en-tête public sur ordinateur et mobile,
à côté des autres commandes. Il utilise deux liens textuels, une séparation
discrète et un soulignement de la langue active ; il conserve une hauteur de
cible de 44 px et un focus visible. `aria-current` indique la langue courante,
les noms accessibles sont « Français » et « English » et `hreflang` distingue
le français de l’anglais britannique.

Le changement de langue mène à la même page sous `/` ou `/en/`. Lorsqu’un texte
anglais manque, le français reste consultable avec une mention explicite de
traduction en attente, discrète et lisible. Le choix de langue ne doit pas
faire croire que tous les contenus sont déjà traduits.

## Suivi des traductions

`Traductions` est la dixième cellule du registre administratif. La navigation
forme deux rangées de cinq cellules sur grand écran, passe à trois colonnes
sous 900 px puis à deux sous 520 px. Les indices, les libellés et l’inversion
de la cellule active prolongent les autres panneaux.

L’ordre de lecture est stable : titre et actualisation du quota, état du
traitement, trois métriques, deux jauges, actions, historique, lots et contenus.
Le cartouche de métriques distingue :

- la couverture éditoriale, en pourcentage et en caractères sources à jour ;
- le crédit consommé, avec limite, relevé disponible et réservations depuis
  ce relevé ;
- le rattrapage disponible, avec le plafond du compte rappelé séparément.

Couverture et consommation disposent chacune d’une jauge nommée. Le crédit
Developer est présenté comme non renouvelable mensuellement. Les valeurs
inconnues sont des tirets ; elles ne doivent pas devenir des zéros trompeurs.
Les nombres utilisent des chiffres tabulaires et les légendes peuvent revenir
à la ligne. Sous 680 px, les trois métriques et les deux jauges s’empilent sans
changer d’ordre ni créer de débordement horizontal.

Les comptes de contenus et les volumes préparés ou en ligne précèdent les
commandes de rattrapage, suspension, reprise et nouvelle tentative. Ces actions
restent jointives et reflètent leur disponibilité réelle. Les retours d’état
sont annoncés dans une zone `role="status"` ; les erreurs ont un libellé lisible.
Le lancement du rattrapage précise le volume maximal dans sa confirmation et
la reprise de requêtes incertaines signale le risque de seconde facturation.

L’historique trace la couverture éditoriale et propose un mois ou toute la
période. Ses valeurs quotidiennes sont aussi consultables dans un tableau
dépliable, avec les caractères facturés dans une colonne distincte. Les lots
restent des lignes de registre. Le tableau des contenus garde le titre et le
type en premier, puis la date, l’état et les champs terminés ; les titres longs
reviennent à la ligne et les états restent compréhensibles sans couleur.

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
affiches Digest sont unifiées par l’encre corail au repos et retrouvent leur
palette d’origine au survol comme au focus clavier. Les cartes Focus emploient
à la place une photographie technique ancienne en bichromie jaune et noir, sans
rotation, avec le préfixe `FOCUS -` séparé du titre. Le folio des archives
reprend le même cartouche à trois cellules jointives que la pagination des
liens, y compris sur petit écran.

Sur la page d’une édition, le titre principal commence par `DIGEST -` ou, pour
un dossier thématique déclaré `editorial_type: "focus"`, par `FOCUS -`. Les
cartes d’archives reprennent le même signal. Pour les Digest, les titres
historiques déjà préfixés (`DIGEST -`, `Digest -` ou `Digest —`) sont normalisés à l’affichage :
un seul `DIGEST -` apparaît sur les cartes, les pages et dans le titre proposé
au partage LinkedIn, sans modifier le titre éditorial enregistré.

Les affiches Focus conservent les formats panoramique et carré mais emploient
un langage distinct : une seule
photographie technique ancienne en plein cadre, bichromie, grille et titre
massif. Le mot `FOCUS` reste un petit cartouche de format et ne concurrence pas
le sujet du billet.
Le texte éditorial emploie un retrait de première ligne de `1,75 em`
pour chaque paragraphe, et les intertitres ménagent une respiration nette avant
et après. L’affiche est affichée entière dans ses proportions propres : une
version carrée ne doit jamais être recadrée au ratio panoramique de l’image Open
Graph.

Les tableaux Markdown des éditions forment des cartouches numérotés à filets
partagés : en-têtes compacts, première colonne en titre de ligne et valeurs
numériques alignées à droite. Sous 640 px, chaque ligne devient un cartouche
avec son titre, deux cellules de données par rangée et les libellés rappelés.
Les en-têtes et la sémantique du tableau restent accessibles aux lecteurs
d’écran ; aucune donnée ne disparaît et aucun défilement horizontal n’est requis.

Le registre de projets de la Software Factory emploie une variante large à
quatre colonnes. Le projet vient en premier, les étoiles et la licence partagent
une cellule, le rôle reçoit 44 % de la grille et la maturité ferme la ligne. Le
tableau peut s’élargir jusqu’à 1120 px au-delà de la colonne de lecture. Sur
mobile, ses quatre champs s’empilent pour préserver des lignes lisibles.

Dans l’administration, le registre des éditions peut être filtré entre
brouillons et publications. L’édition choisie affiche son état et ses comptes
de liens dans un cartouche rectangulaire avant les champs éditoriaux. Les
actions « Publier l’édition » et « Remettre en brouillon » sont mutuellement
exclusives, demandent une confirmation explicite et rejoignent le panneau de
suivi. Une divergence entre l’archive Markdown et le catalogue utilise un état
d’erreur lisible, accompagné d’une explication, et masque les deux transitions.
Sur mobile, les filtres, le cartouche d’état et les actions s’empilent sans
changer leur ordre logique.

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

L’index interactif respecte un budget après chaque build. Le fragment initial
`Tout` reste sous 280 Kio gzip et 230 Kio Brotli ; le complément des flux sous
240/200 Kio ; les textes d’archive, chargés seulement à l’ouverture d’une
modale, sous 140/120 Kio. Une catégorie ou les favoris chargent le complément
sans perdre de résultat. Le filtrage synchrone d’une requête doit rester sous
50 ms afin de ne pas créer de tâche longue sur le profil mobile de contrôle.

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

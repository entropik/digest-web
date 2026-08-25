---
name: OOBLIK Digest
description: Une archive éditoriale sobre, structurée comme un cartouche d’architecte.
colors:
  interface-coral: "#FF5C35"
  ooblik-red: "#E10600"
  registry-ink: "#161616"
  archive-paper: "#F5F2EC"
  page-gray: "#F5F5F5"
  muted-stone: "#77736D"
  hairline: "#DEDBD5"
  dark-paper: "#1C1C1A"
  dark-line: "#3A3936"
  chalk-white: "#F4F2ED"
  process-cyan: "#00AEEF"
  process-yellow: "#FFD500"
  process-magenta: "#EC008C"
  primary-blue: "#1646D8"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Arial Narrow, sans-serif"
    fontSize: "clamp(3.25rem, 9vw, 7.5rem)"
    fontWeight: 750
    lineHeight: 0.92
    letterSpacing: "-0.075em"
  title:
    fontFamily: "Bricolage Grotesque, Arial Narrow, sans-serif"
    fontSize: "clamp(1.25rem, 2vw, 1.65rem)"
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  body:
    fontFamily: "JetBrains Mono, Consolas, monospace"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "JetBrains Mono, Consolas, monospace"
    fontSize: "0.72rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.06em"
rounded:
  none: "0"
  control: "0.25rem"
  modal: "0.35rem"
  round: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "32px"
  xl: "64px"
components:
  category-cell:
    backgroundColor: "transparent"
    textColor: "{colors.registry-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0.7rem 0.65rem"
    height: "4rem"
  category-cell-active:
    backgroundColor: "{colors.registry-ink}"
    textColor: "{colors.archive-paper}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0.7rem 0.65rem"
    height: "4rem"
  digest-card:
    backgroundColor: "transparent"
    textColor: "{colors.registry-ink}"
    rounded: "{rounded.none}"
    padding: "1.35rem"
  primary-action:
    backgroundColor: "{colors.interface-coral}"
    textColor: "{colors.registry-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0.8rem 1rem"
    height: "44px"
  input-field:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.registry-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.72rem"
  favorite-control:
    backgroundColor: "transparent"
    textColor: "{colors.muted-stone}"
    rounded: "{rounded.round}"
    height: "2rem"
    width: "2rem"
---

# Design System: OOBLIK Digest

## Overview

**Creative North Star: « Le registre d’architecte »**

OOBLIK Digest ressemble à une feuille de registre dessinée avec la rigueur
d’une composition suisse et la précision d’un cartouche de plan. La grille est
visible, les cellules se touchent et les filets organisent l’information sans
l’enfermer dans une accumulation de cartes. Indices, folios, dates et compteurs
donnent au site public, à l’administration et à l’extension la même sensation
d’outil durable, calme et précis.

La sobriété prime : peu de couleurs, peu de formes, aucune décoration sans
fonction. La hiérarchie naît de l’échelle typographique, de l’alignement, de
l’espace et du contraste. Les titres peuvent être francs et monumentaux, mais
les parcours et les contenus restent simples. L’expressivité graphique est
réservée aux affiches et aux moments éditoriaux ; elle ne contamine pas
l’interface fonctionnelle.

**Key Characteristics:**

- grille et filets structurels visibles ;
- composition plane, rectiligne et sans effets décoratifs ;
- typographie grotesque franche associée à une monospace signalétique ;
- cartouches rectangulaires numérotés, cellules jointives et folios compacts ;
- noir structurant, papier chaud et accent corail rare ;
- densité maîtrisée, avec de grandes respirations autour des registres ;
- expressivité réservée aux affiches et aux moments éditoriaux.

### Principes directeurs

1. **Construire avant de décorer.** La grille, les filets et les alignements
   doivent suffire à donner sa forme à l’écran.
2. **Regrouper par le cartouche.** Les commandes ou informations liées partagent
   un contour et des séparations internes ; elles ne flottent pas comme des
   boutons indépendants.
3. **Hiérarchiser par la typographie.** Une grotesque porte le sujet ; la
   monospace porte les repères, les métadonnées et les commandes.
4. **Employer la couleur comme un signal.** Le noir structure, le papier
   accueille et le corail désigne une action ou un état exceptionnel.
5. **Préserver une lecture calme.** La densité se concentre dans les registres ;
   leurs abords gardent assez de blanc pour rendre l’ensemble évident.

## Colors

Le système distingue les encres fonctionnelles de l’interface et les encres
expressives des images sociales. Le corail signale les actions et états clés ;
le rouge OOBLIK, le noir absolu et les couleurs process construisent les
affiches sans transformer chaque écran en poster.

L’interface courante tend vers une impression monochrome sur papier chaud. Un
écran doit rester compréhensible si l’accent coloré disparaît : structure,
libellés et états ne reposent jamais sur la couleur seule.

### Primary

- **Corail de repérage** (`colors.interface-coral`) : focus chromatique,
  survols francs, actions principales et indices éditoriaux.
- **Rouge OOBLIK** (`colors.ooblik-red`) : signature de marque et encre
  permanente des compositions sociales, non couleur d’action par défaut.

### Secondary

- **Cyan process**, **jaune process**, **magenta process** et **bleu primaire**
  (`colors.process-*`, `colors.primary-blue`) : une seule encre dominante par
  affiche, choisie de manière déterministe.

### Neutral

- **Encre de registre** (`colors.registry-ink`) : texte, filets forts et états
  inversés.
- **Papier d’archive** (`colors.archive-paper`) : surface éditoriale chaude.
- **Gris de page** (`colors.page-gray`) : fond légèrement distinct des zones de
  contenu.
- **Pierre atténuée** (`colors.muted-stone`) : métadonnées et informations
  secondaires qui restent lisibles.
- **Filet pâle** (`colors.hairline`) : divisions, grilles et contours au repos.
- **Papier sombre** et **filet sombre** (`colors.dark-paper`,
  `colors.dark-line`) : équivalents du thème sombre.
- **Blanc craie** (`colors.chalk-white`) : papier des affiches et texte inversé
  sur les compositions les plus sombres.

**The Accent-Is-a-Signal Rule.** Le corail indique une action, un état ou un
repère ; il ne remplit pas systématiquement les surfaces.

**The Two-Ink Rule.** Une affiche conserve rouge et noir comme signature puis
choisit une seule encre process dominante.

## Typography

**Display Font:** Bricolage Grotesque, avec Arial Narrow comme repli.

**Body Font:** JetBrains Mono, avec Consolas comme repli.

**Label/Mono Font:** la même JetBrains Mono ; les petits corps assument une
fonction de registre, de compteur et de signalétique.

**Character:** la grotesque porte les titres, les masses et les collisions ; la
monospace stabilise la lecture utilitaire, les métadonnées et les contrôles.
L’administration et l’extension utilisent actuellement Arial et la monospace
système comme équivalents compacts lorsque les fontes du site ne sont pas
chargées.

### Hierarchy

- **Display** (graisse 750, échelle fluide, interligne 0.92) : héros publics,
  titres d’archives et grands en-têtes.
- **Title** (graisse 650, échelle fluide, interligne 1.12) : titres de cartes et
  éléments de registre.
- **Body** (graisse 400, 1rem, interligne 1.6) : descriptions et textes
  éditoriaux, généralement limités entre 65 et 72 caractères par ligne.
- **Label** (graisse 700, 0.72rem, approche positive) : indices, dates,
  compteurs, kickers, états et actions courtes.

**The Protected Copy Rule.** Une lettre décorative peut être coupée ; un titre
informatif, une métadonnée ou une commande ne l’est jamais.

## Layout

Le site public s’inscrit dans un conteneur maximal de 1180px. Les surfaces
principales utilisent des grilles jointives plutôt que des collections de
cartes flottantes : trois colonnes pour les ressources et archives sur grand
écran, deux sur tablette, une sur mobile. La recherche et la date forment deux
colonnes avant de s’empiler ; le registre des catégories utilise des cellules
auto-ajustées d’au moins 180px.

Les états changent la composition sans changer son vocabulaire. Une catégorie
active reste à gauche tandis que sa description ouvre un volet à droite ; les
deux zones s’empilent sous 520px. Les paginations gardent trois cellules
jointives sur toutes les largeurs. Le site évite tout débordement horizontal et
réduit les dimensions plutôt que de supprimer les libellés.

L’administration reprend un conteneur de 1180px et bascule ses rangées complexes
en une colonne sous 760px. L’extension condense la même hiérarchie dans une
fenêtre fixe de 540px. L’espacement suit principalement une cadence de 8px,
avec 16px pour le rythme courant, 32px pour séparer les groupes et 64px pour
les grandes respirations.

La composition suit trois échelles simples : la page fournit la respiration,
le registre fournit la structure et la cellule fournit l’information. Les
alignements de titres, de filtres et de grilles se répondent sur les mêmes axes.
Une largeur inutilisée peut rester vide : elle participe à la hiérarchie et ne
doit pas être remplie artificiellement.

**The Shared-Rule Rule.** Des éléments appartenant au même registre partagent
leurs filets ; ils ne deviennent pas des boutons isolés avec des marges entre
eux.

## Elevation & Depth

Le système est plat par défaut. La hiérarchie vient des filets, des aplats, des
inversions et des recouvrements. Les ombres sont réservées aux couches qui
quittent réellement le plan — modales, calendrier, notifications — et restent
neutres. Les affiches créent leur profondeur par les trames, transformations,
contrastes et superpositions, jamais par un relief d’interface décoratif.

### Shadow Vocabulary

- **Couche modale** (`0 24px 80px rgb(0 0 0 / 24%)`) : dialogue public au-dessus
  du registre.
- **Couche de composition** (`0 24px 80px rgb(0 0 0 / 35%)`) : éditeur de
  publication LinkedIn.
- **Couche contextuelle** (`0 18px 45px rgb(0 0 0 / 18%)`) : calendrier et petits
  panneaux temporaires.

**The Flat-By-Default Rule.** Une surface au repos n’a pas d’ombre ; une ombre
signifie qu’une couche temporaire est réellement passée au-dessus du contenu.

## Shapes

Les formes rectangulaires à angles droits dominent les catégories, cartes,
folios, archives et panneaux. Les champs et actions autonomes peuvent utiliser
un arrondi discret de contrôle ; les modales gardent un rayon à peine plus
visible. Les cercles et pilules sont réservés à une fonction qui justifie leur
silhouette : favori, fermeture, navigation modale, statut ou tag.

Les filets d’un pixel construisent les registres. Les images locales gardent un
ratio 16:9 et des angles droits. Les affiches sociales peuvent employer
cercles, anneaux, ellipses, rectangles, lignes et trames, y compris lorsqu’ils
débordent du cadre, tant que les informations restent protégées.

**The Functional-Radius Rule.** Un arrondi doit signaler une fonction ou une
couche distincte ; la taxonomie et la pagination restent strictement
rectangulaires.

## Components

Les composants sont francs, denses et lisibles. Le contraste ou l’inversion
porte l’état ; chaque commande importante conserve une cible d’au moins 44px et
un focus clavier explicite.

### Anatomie d’un cartouche

Un cartouche associe un contour d’un pixel et des séparations internes de même
poids. Il peut réunir un indice, un libellé principal, une valeur ou une action.
Les contenus s’alignent sur une grille commune ; les métadonnées restent petites
mais lisibles. Au repos, le fond reste transparent ou papier. L’état actif
emploie une inversion franche encre-papier plutôt qu’une ombre, un dégradé ou un
gonflement du composant.

### Buttons

- **Shape:** angle droit dans un registre ; arrondi discret pour une action
  autonome ; cercle uniquement pour une commande iconique.
- **Primary:** fond corail, texte encre et graisse forte, avec une hauteur utile
  d’au moins 44px.
- **Hover / Focus:** inversion encre-papier ou accent chromatique net, sans
  translation décorative ; focus visible même quand le survol utilise le même
  aplat.
- **Secondary / Ghost:** fond transparent, filet d’un pixel et texte encre ; un
  lien textuel secondaire peut employer un soulignement fin et décalé.

### Chips

- **Style:** petites formes arrondies réservées aux tags publics et statuts,
  avec filet et fond discret. Dans l’administration, un thème sélectionné reste
  au contraire un cartouche rectangulaire de registre, jamais une pilule.
- **State:** un chip informe ou filtre ; il ne remplace jamais une cellule de
  navigation taxonomique.

### Cards / Containers

- **Corner Style:** angles droits et filets partagés.
- **Background:** transparent ou papier au repos ; corail avec texte sombre au
  survol des cartes publiques.
- **Shadow Strategy:** aucune ombre au repos.
- **Border:** filet pâle d’un pixel, construit comme une grille continue.
- **Internal Padding:** environ 1.35rem pour une carte de ressource et 1.5rem
  pour une archive.

### Inputs / Fields

- **Style:** fond blanc ou fond de page, filet d’un pixel, rayon de contrôle
  discret et corps monospace.
- **Focus:** contour fort et décalé dans l’administration ; accent ou filet
  renforcé sur le site public.
- **Error / Disabled:** texte sémantique explicite en plus de la couleur ; état
  désactivé par opacité sans effacer le libellé.
- **Recherche de thèmes:** combobox sur le seul registre actif, avec liste
  rectangulaire jointive. Les flèches déplacent l’option active, `Entrée` la
  sélectionne, `Échap` ferme la liste et le nombre de résultats comme la limite
  de trois sont annoncés aux technologies d’assistance.

### Navigation

L’en-tête reste collant et séparé par un filet. Sur mobile, un menu plein écran
reprend les indices, grands titres et lignes jointives du registre. Les
catégories associent systématiquement indice, nom et compteur ; la sélection
conserve `aria-pressed` et ouvre une fiche descriptive. La pagination associe
`Précédent`, folio et `Suivant` dans un seul cartouche.

### Affiche générative

Les images d’édition sont des composants déterministes produits depuis la date,
le titre et la description. Elles utilisent Bricolage Grotesque, le rouge et le
noir OOBLIK, une encre process dominante, des trames et un nombre limité
d’accidents monumentaux. Les formats 1200 × 627 et 1200 × 1200 partagent une
identité, sans marges artificielles ni dépendance à une police système.

## Do's and Don'ts

### Do:

- **Do** commencer chaque écran par une structure monochrome lisible avant
  d’ajouter un accent.
- **Do** montrer la grille et les filets avant de les briser localement.
- **Do** associer catégories, pagination et navigation à des indices, noms et
  métadonnées stables.
- **Do** employer le corail comme signal rare et conserver un contraste WCAG AA
  pour toute information essentielle.
- **Do** rendre les compositions génératives déterministes et protéger les
  titres, dates et compteurs.
- **Do** empiler les relations spatiales sur mobile sans changer leur ordre ni
  créer de débordement horizontal.
- **Do** distinguer les cartouches de thèmes administratifs des chips de tags
  publics et préserver le parcours clavier complet de leur combobox.
- **Do** désactiver transitions et animations avec `prefers-reduced-motion`.

### Don't:

- **Don't** ajouter une forme, une couleur ou un effet qui ne clarifie ni la
  hiérarchie, ni l’état, ni l’action.
- **Don't** transformer les catégories ou la pagination en pilules ou boutons
  arrondis isolés.
- **Don't** employer glassmorphism, 3D molle, ombres diffuses décoratives ou
  dégradés violet-bleu génériques.
- **Don't** utiliser les encres process comme une palette arc-en-ciel dans
  l’interface fonctionnelle.
- **Don't** confondre un état de chargement avec une progression fictive.
- **Don't** sacrifier une information, un focus clavier ou la lisibilité à une
  collision, une trame ou une animation.

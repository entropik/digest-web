---
name: OOBLIK Digest
description: Une archive éditoriale suisse, typographique et volontairement indisciplinée.
colors:
  ooblik-red: "#E10600"
  absolute-black: "#0A0A0A"
  chalk-white: "#F4F2ED"
  structural-gray: "#B7B5B0"
  process-cyan: "#00AEEF"
  process-yellow: "#FFD500"
  process-magenta: "#EC008C"
  primary-blue: "#1646D8"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Arial Narrow, sans-serif"
    fontSize: "clamp(3rem, 8vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  body:
    fontFamily: "JetBrains Mono, Consolas, monospace"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "JetBrains Mono, Consolas, monospace"
    fontSize: "0.78rem"
    fontWeight: 700
    lineHeight: 1.3
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "32px"
  xl: "64px"
components:
  share-link:
    backgroundColor: "{colors.absolute-black}"
    textColor: "{colors.chalk-white}"
    typography: "{typography.label}"
    padding: "0 16px"
    height: "44px"
---

# Design System: OOBLIK Digest

## Overview

**Creative North Star: "La grille insoumise"**

OOBLIK part d’une discipline suisse visible — grille, grotesque, alignements,
contrastes — puis autorise certains éléments à la saboter. Les grandes lettres,
formes primaires et trames imprimées peuvent déborder, se répéter, entrer en
collision ou se superposer, tant que le contenu éditorial conserve une zone de
lecture nette.

L’identité refuse le poli générique des interfaces SaaS. Elle doit évoquer une
affiche culturelle construite avec des encres franches, pas une image décorative
produite sans système.

**Key Characteristics:**

- grille structurelle perceptible ;
- typographie monumentale et parfois recadrée ;
- chaos local, hiérarchie globale ;
- formes géométriques et trames d’impression ;
- rouge et noir comme signature permanente.

## Colors

Le rouge signal et le noir portent OOBLIK. Le blanc craie sert de papier ; cyan,
jaune, magenta et bleu primaire sont des encres d’accent, une ou deux au maximum
dans une composition.

**The Two-Ink Rule.** Une image sociale conserve rouge et noir comme signature,
puis choisit une seule encre primaire dominante. Selon l’édition, le champ peut
donc être majoritairement cyan, jaune, magenta, bleu, noir ou rouge sans devenir
un arc-en-ciel.

## Typography

**Display Font:** Bricolage Grotesque, avec Arial Narrow comme repli.

**Body Font:** JetBrains Mono, avec Consolas comme repli.

**Character:** la grotesque porte les masses et les collisions ; la monospace
stabilise les métadonnées et le contenu utilitaire.

- **Display** (800, jusqu’à 6rem, 0.95) : titres, dates et fragments graphiques.
- **Body** (400, 1rem, 1.6) : descriptions et textes éditoriaux, limités à 70ch.
- **Label** (700, 0.78rem) : dates, nombres de liens et actions courtes.

**The Protected Copy Rule.** Une lettre décorative peut être coupée ; un titre
informatif ou une métadonnée ne l’est jamais.

## Elevation

Le système est plat. La profondeur vient des recouvrements, des changements
d’échelle et des aplats, jamais des ombres diffuses.

**The Flat Print Rule.** Pas de glassmorphism, de relief 3D ni de grande ombre
floue ; chaque couche doit pouvoir être comprise comme une encre imprimée.

## Components

Les composants publics restent francs et rectangulaires. Les boutons et liens
d’action ont une cible d’au moins 44px, un contraste élevé et un changement
d’aplat visible au survol et au focus. Les listes de liens utilisent l’espace,
la typographie et les séparateurs plutôt que des cartes décoratives imbriquées.

L’image sociale est un composant génératif déterministe de 1200 × 627 pixels.
Elle choisit une famille de composition, une encre d’accent et des paramètres de
grille à partir de la date, du titre et de la description du Digest. Ses fonds
peuvent employer des dégradés d’encres, un grain ponctuel et des bandes ondulées
pour éviter que le blanc craie ne devienne une toile systématique. Un à deux
accidents monumentaux — ellipses tramées, plaques de lignes, anneaux, barreaux ou
formes coupées — traversent les couches et sortent volontairement du cadre. La
sobriété vient du nombre réduit de gestes ; la variation, de leur échelle, leur
rotation et leur position. Toute forme décorative colorée reçoit un grain ou une
trame interne : les aplats parfaitement lisses sont réservés à la typographie et
aux zones fonctionnelles qui protègent les métadonnées.

La sortie sociale reste un PNG 1200 × 627 pour la compatibilité des aperçus de
liens. Une seconde composition 1200 × 1200, dédiée aux publications LinkedIn
natives, reprend la même identité sans ajouter de marges artificielles. Les deux
images sont quantifiées à 256 couleurs, compressées au niveau maximal et doivent
rester sous un budget de 500 Ko. WebP n’est produit que si une image est un jour
affichée directement dans une page, jamais comme unique source `og:image`.


## Do's and Don'ts

### Do:

- **Do** montrer la grille avant de la briser localement.
- **Do** utiliser des cercles, rectangles, lignes, arcs et trames simples.
- **Do** réserver une zone contrastée aux informations éditoriales.
- **Do** rendre l’aléatoire déterministe afin qu’une édition garde son identité.
- **Do** traiter dégradés, grain et ondulations comme des matières d’impression.
- **Do** texturer chaque forme décorative, y compris les anneaux et rectangles.

### Don't:

- **Don't** utiliser de dégradés pastel ou violet-bleu génériques associés aux productions IA.
- **Don't** employer le glassmorphism, la 3D molle ou des ombres décoratives.
- **Don't** ajouter d’illustrations figuratives ou de bruit sans structure.
- **Don't** lisser les compositions pour les faire ressembler à une interface SaaS.
- **Don't** sacrifier la lisibilité à un effet de collision ou de trame.

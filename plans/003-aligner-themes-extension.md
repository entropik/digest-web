# Plan 003 : Repenser les tags dans l’extension et l’administration

> **Nature du document** : PRD et plan d’implémentation. Ce document décrit le
> comportement attendu ; il n’autorise pas à publier ni à distribuer
> l’extension sans les vérifications et validations prévues plus bas.
>
> **Contrôle de dérive à exécuter avant l’implémentation** :
> `git diff --stat 85b2ac6b4..HEAD -- browser-extension/entrypoints/popup/index.html browser-extension/entrypoints/popup/main.ts browser-extension/entrypoints/popup/style.css browser-extension/lib/tag-suggestions.ts browser-extension/test/popup.test.ts browser-extension/test/tag-suggestions.test.ts browser-extension/package.json browser-extension/wxt.config.ts admin-service/src/curation.ts admin-service/src/server.ts admin-service/src/tag-taxonomy.ts admin-service/test/curation-input.test.ts admin-service/test/admin-assets.test.ts data/tags.json docs/architecture.md docs/decisions.md docs/interface.md hugo.yaml`
> Si le contrat des thèmes, la sauvegarde des brouillons ou l’interface de
> l’extension ont changé, comparer le code vivant à la section « État actuel »
> avant de commencer.

## Statut

- **Priorité** : P1
- **Effort** : M
- **Risque** : MED
- **Dépend de** : aucun
- **Catégorie** : produit, extension Chrome, administration, API, taxonomie,
  accessibilité
- **Planifié à** : commit `85b2ac6b4`, 2026-08-25
- **État d’exécution** : DONE, livré et vérifié le 2026-08-25

## Résumé

L’extension doit présenter les suggestions automatiques en premier, permettre
ensuite de rechercher et sélectionner les tags actifs existants, puis offrir
une action explicite pour créer un nouveau tag lorsqu’aucun nom ni alias ne
correspond à la saisie.

Créer « Memory », par exemple, ne doit pas ajouter un mot-clé libre uniquement
au brouillon. L’action doit créer un tag éditorial actif dans `data/tags.json`,
créer sa route publique et sélectionner son nom canonique dans le brouillon.
Le serveur reste la source de vérité et la limite demeure de trois tags par
lien.

L’administration doit parallèlement exposer un menu principal `Tags`, à la
place de l’entrée actuelle `Thèmes` visible dans l’Atelier. Ce menu devient le
lieu de gestion du registre : création, description, alias, renommage, fusion,
archivage et réactivation. Les tags créés rapidement depuis l’extension doivent
y apparaître et pouvoir être enrichis sans modifier les brouillons un par un.

Dans le code existant, certains objets et méthodes peuvent conserver le nom
interne `theme` afin d’éviter une migration cosmétique risquée. Dans toute
l’interface visible, le terme retenu par ce PRD est `tag`.

## Problème observé

La capture du 25 août montre le parcours suivant :

1. l’extension affiche `Tags existants ou nouveaux` ;
2. elle accepte librement `Memory` et l’affiche comme sélection ;
3. le serveur, qui n’accepte que le registre actif, répond `UNKNOWN_TAG` ;
4. l’extension expose ce code technique sous la forme
   `Enregistrement impossible : UNKNOWN_TAG`.

Ce comportement vient d’un décalage entre la refonte des thèmes livrée dans
l’administration et l’ancienne interaction conservée dans l’extension :

- `browser-extension/entrypoints/popup/index.html` promet encore des tags
  « existants ou nouveaux » sans expliquer la création dans le registre ;
- `browser-extension/entrypoints/popup/main.ts` accepte toute chaîne dans
  `addTag()` et autorise jusqu’à douze sélections ;
- l’API limite les thèmes actifs à trois et rejette tout libellé inconnu ;
- la réponse de `/api/admin/curation/options` expose les définitions sous
  `themes`, tandis que le type de l’extension cherche encore
  `tagDefinitions`. L’extension perd donc les descriptions et alias utiles à
  la suggestion et retombe sur une liste de noms ;
- les erreurs de sauvegarde ne traduisent que `ALREADY_PUBLISHED`.

## Objectifs produit

1. Accélérer la capture en faisant apparaître immédiatement les thèmes les
   plus plausibles pour la page courante.
2. Rendre l’ensemble du registre actif accessible sans transformer le popup en
   longue liste déroulante.
3. Autoriser la création volontaire d’un tag manquant depuis l’extension.
4. Fournir dans l’administration un menu `Tags` couvrant tout le cycle de vie
   du registre.
5. Préserver une taxonomie canonique, administrable et limitée à trois tags
   par lien.
6. Ne plus exposer de code d’erreur serveur à la personne qui édite.
7. Garantir le même résultat au clavier, à la souris et avec un lecteur
   d’écran.

## Non-objectifs

- Réintroduire les 937 tags historiques dans la saisie.
- Autoriser des mots-clés libres propres à un seul brouillon.
- Générer automatiquement un nouveau tag sans action explicite.
- Réactiver silencieusement un tag archivé.
- Créer automatiquement une description éditoriale ou des alias.
- Modifier l’explorateur public des tags.
- Importer automatiquement les centaines de tags historiques dans le registre
  actif administrable.
- Refaire toute l’architecture visuelle du popup.

## Principes fonctionnels

### 1. Suggestions automatiques prioritaires dans l’extension

- La section `Suggestions pour cette page` apparaît avant le champ de
  recherche dès qu’au moins une suggestion est disponible.
- Elle utilise le titre, le résumé et le texte analysable de la page active.
- Elle ne propose que des tags actifs issus du serveur.
- Le moteur exploite le nom, la description et les alias de chaque tag.
- Les correspondances sont renvoyées sous leur nom canonique, jamais sous
  l’alias détecté.
- Un maximum de cinq suggestions non sélectionnées est affiché.
- Une suggestion se sélectionne en une action et disparaît alors de la liste.
- La modification du titre ou du résumé recalcule les suggestions sans
  modifier automatiquement la sélection.
- Si aucune suggestion n’est suffisamment pertinente, la section est masquée
  et le champ des tags existants reste immédiatement disponible.

### 2. Recherche dans les tags existants

- Sous les suggestions, un champ intitulé `Rechercher un tag existant`
  remplace le couple actuel champ libre + bouton `Ajouter`.
- Au focus, il présente jusqu’à huit tags actifs non sélectionnés.
- La saisie filtre sur le nom, la description et les alias, sans distinction de
  casse ni d’accent.
- Chaque résultat affiche le nom canonique et, lorsqu’elle existe, une courte
  description.
- `Flèche haut`, `Flèche bas`, `Entrée` et `Échap` pilotent la liste selon le
  modèle ARIA combobox/listbox.
- Les tags choisis apparaissent sous forme de cartouches rectangulaires
  supprimables. La suppression rend le tag de nouveau disponible dans les
  suggestions et la recherche.
- Le compteur `n/3 tags sélectionnés` est visible. À trois sélections, les
  suggestions et la création sont désactivées avec une explication lisible.

### 3. Création explicite d’un nouveau tag

- Si la saisie non vide ne correspond exactement à aucun nom ni alias actif,
  la dernière option de la liste est `Créer le tag « … »`.
- Cette option n’apparaît pas tant que les définitions du serveur ne sont pas
  chargées. Une panne réseau ne doit jamais transformer arbitrairement une
  recherche en création.
- Son activation ouvre une confirmation compacte dans le popup :
  `Ce nouveau tag sera ajouté au registre public du Digest.`
- La confirmation affiche le nom tel qu’il sera créé, après suppression des
  espaces périphériques et du préfixe `#`. Elle ne corrige pas silencieusement
  l’orthographe ou la casse.
- Les actions sont `Créer et sélectionner` et `Annuler`.
- La description et les alias restent facultatifs et sont complétés plus tard
  dans l’administration. Ils ne bloquent pas la capture.
- Pendant la création, toutes les actions de tag et la sauvegarde du brouillon
  sont désactivées. L’état annonce `Création du tag…`.
- Après succès, le nouveau nom canonique est sélectionné, le registre local du
  popup est rafraîchi et le brouillon peut être enregistré normalement.
- Si un autre client a créé entre-temps un nom ou un alias équivalent, le
  serveur renvoie le tag canonique existant ; l’extension le sélectionne sans
  créer de doublon.
- Si le libellé correspond à un tag archivé, la création est refusée avec :
  `Ce nom appartient à un ancien tag. Réactivez-le ou renommez-le depuis
  l’administration.` La route historique reste réservée.
- Une création réussie ne doit jamais finir par `UNKNOWN_TAG`, y compris après
  une reprise réseau ou un nouvel envoi idempotent.

### 4. Menu « Tags » dans l’administration

- La navigation principale contient une entrée `Tags` ; l’entrée actuelle
  `Thèmes` montrée dans l’Atelier est renommée.
- Le libellé `Thèmes` présent dans chaque fiche de brouillon devient également
  `Tags`, avec l’aide `facultatifs · 3 maximum` inchangée sur le fond.
- Le menu charge le registre de `data/tags.json`, pas la totalité des routes
  historiques de `content/tags/`.
- Son en-tête affiche le nombre de tags actifs, de tags archivés et de tags
  actifs sans description.
- Une recherche unique filtre le nom, la description et les alias sans
  distinction de casse ni d’accent.
- Deux vues rectangulaires `Actifs` et `Archivés` évitent de mêler les états.
  Elles conservent le focus, l’état `aria-pressed` et restent utilisables sans
  débordement horizontal.
- Par défaut, les tags sont triés alphabétiquement. Un tag créé depuis
  l’extension sans description porte le libellé `À documenter`, sans dépendre
  uniquement d’une couleur.

Chaque ligne active affiche :

- le nom canonique modifiable ;
- une description éditoriale modifiable ;
- les alias sous forme de valeurs séparées et supprimables ;
- le nombre de liens publiés et de brouillons qui utilisent le tag ;
- les actions `Enregistrer`, `Fusionner` et `Archiver`.

Le formulaire de création reste placé en tête du menu. Il demande un nom et
propose une description et des alias facultatifs. La création utilise les mêmes
règles de collision que l’extension et ne produit jamais deux routes
équivalentes.

Le cycle de vie attendu est le suivant :

- **Renommer** migre les liens et brouillons vers le nouveau nom canonique,
  conserve l’ancienne route et ajoute l’ancien nom comme alias lorsque cela ne
  crée pas de collision.
- **Fusionner** demande un tag cible actif, présente avant confirmation les
  nombres de liens et brouillons concernés, migre les usages, puis réserve
  l’ancienne route.
- **Archiver** retire le tag des suggestions et des brouillons encore actifs,
  mais conserve les liens publiés et la route historique conformément à la
  mémoire éditoriale du projet.
- **Réactiver** remet une définition inactive dans le registre proposé après
  vérification des collisions. Cette action reste réservée à l’administration
  et n’est jamais déclenchée depuis l’extension.

Après chaque succès, les compteurs, la recherche et les lignes sont rafraîchis
depuis la réponse serveur sans rechargement complet. Une erreur reste attachée
à la ligne ou au formulaire concerné afin d’éviter un message global ambigu.

### 5. Enregistrement du brouillon

- Le serveur reste responsable de la canonicalisation finale.
- La limite est de trois tags au total, existants et nouveaux confondus.
- La sauvegarde accepte zéro tag.
- Le libellé technique `UNKNOWN_TAG` n’est jamais affiché brut. Pour un client
  périmé ou un état concurrent, le message devient :
  `Ce tag n’existe plus dans le registre. Choisissez-en un autre.`
- `TOO_MANY_THEMES` devient : `Choisissez au maximum trois tags.`
- Les erreurs de création, d’authentification, de conflit et de réseau gardent
  la saisie locale et proposent une nouvelle tentative.
- Une erreur ne ferme jamais automatiquement le popup.

## Parcours cible

### Parcours nominal avec tags existants

1. La personne ouvre l’extension sur une page GitHub.
2. Les suggestions `agents`, `code` et `opensource` apparaissent en premier.
3. Elle sélectionne `agents`.
4. Elle recherche `javascript` dans les tags existants et sélectionne le
   résultat canonique `JavaScript`.
5. Le compteur indique `2/3 tags sélectionnés`.
6. Le brouillon est enregistré sans erreur.

### Parcours avec création de « Memory »

1. La personne saisit `Memory` dans `Rechercher un tag existant`.
2. Aucun nom ni alias exact ne correspond ; les résultats proches restent
   visibles et l’action `Créer le tag « Memory »` apparaît en dernier.
3. Elle choisit cette action puis confirme `Créer et sélectionner`.
4. Le serveur ajoute `Memory` au registre actif et crée sa route publique.
5. `Memory` apparaît comme tag sélectionné et compte dans la limite de trois.
6. La sauvegarde du brouillon réussit ; aucune réponse `UNKNOWN_TAG` n’est
   visible.

### Parcours avec alias existant

1. La personne saisit un alias d’un tag existant.
2. L’interface propose le tag canonique correspondant et n’affiche pas
   l’action de création pour cet alias.
3. La sélection enregistre uniquement le nom canonique.

### Parcours d’enrichissement dans l’administration

1. Après la capture, la personne ouvre `Tags` dans l’administration.
2. Le compteur signale un tag actif sans description et la ligne `Memory`
   porte l’état `À documenter`.
3. Elle ajoute une description et éventuellement des alias, puis enregistre.
4. Les suggestions automatiques de l’extension utilisent ces informations dès
   le prochain chargement du registre.

### Parcours d’archivage et de réactivation

1. La personne ouvre la vue `Actifs`, choisit un tag et demande son archivage.
2. La confirmation indique combien de liens publiés seront conservés et combien
   de brouillons perdront ce tag.
3. Le tag rejoint la vue `Archivés` et disparaît de l’extension.
4. Une réactivation ultérieure vérifie les collisions, restaure le tag actif et
   le rend de nouveau disponible dans l’extension.

## Contrat API cible

L’extension doit consommer un seul nom de propriété pour les définitions
actives. Le contrat recommandé est de conserver la réponse actuelle :

```json
{
  "categories": ["IA & Agents"],
  "tags": ["agents", "IA"],
  "themes": [
    {
      "name": "agents",
      "description": "Agents logiciels, orchestration et assistants capables d’agir.",
      "aliases": ["AI assistant", "MCP"]
    }
  ]
}
```

Le type `CurationOptions` de l’extension utilise `themes`; le repli sur une
propriété fantôme `tagDefinitions` est supprimé. `tags` peut être conservé pour
compatibilité avec d’anciennes versions de l’extension.

La création peut réutiliser `POST /api/admin/themes`, mais le parcours complet
doit être idempotent :

- même authentification propriétaire et même origine d’extension que les
  autres routes privées ;
- `confirm: true` obligatoire ;
- validation insensible à la casse et aux accents sur les noms et alias ;
- succès avec la définition canonique si un thème actif équivalent existe déjà
  à la suite d’une course ;
- erreur distincte `THEME_RESERVED` si une définition inactive réserve le nom
  ou l’alias ;
- invalidation du cache de taxonomie avant la sauvegarde suivante du brouillon.

Si la séquence actuelle `créer le thème`, puis `enregistrer le brouillon` ne
peut pas garantir ce dernier point, ajouter une opération serveur orchestrée
ou rendre la seconde étape tolérante au thème créé par la première. Une
tentative rejouée après une réponse réseau perdue doit sélectionner le thème
existant et continuer, pas retourner `THEME_ALREADY_EXISTS`.

Le contrat du menu d’administration doit fournir, pour chaque tag, son état
`active`, son nombre de liens publiés et son nombre de brouillons. Le serveur
expose une action de réactivation dédiée plutôt que de détourner la création.
Les réponses de renommage, fusion, archivage et réactivation renvoient la
définition canonique et les compteurs actualisés.

## Exigences d’interface et d’accessibilité

- Conserver la largeur compacte du popup et empêcher tout débordement
  horizontal.
- Respecter la direction suisse/cartouche : groupes rectangulaires, filets
  partagés, aucune pilule décorative supplémentaire.
- Les suggestions automatiques, résultats existants et action de création sont
  distingués par leur libellé, pas uniquement par la couleur.
- Le focus revient au champ de recherche après une sélection ou une annulation.
- La confirmation de création reçoit le focus à son ouverture et le restitue à
  sa fermeture.
- Les états asynchrones utilisent la zone `role="status"` existante sans
  répétitions excessives.
- La sélection et la suppression fonctionnent entièrement au clavier.
- Toute animation éventuelle respecte `prefers-reduced-motion`.
- Vérifier le popup à sa largeur normale et à 200 % de zoom.
- Vérifier le menu `Tags` dans un navigateur réel sur ordinateur et mobile,
  notamment les formulaires longs, les confirmations et les vues actif/archive.

## Mesure de succès

Le chantier est réussi si :

- aucune saisie proposée par l’interface ne peut conduire normalement à
  `UNKNOWN_TAG` ;
- une personne peut sélectionner un thème automatique en une action ;
- l’ensemble des thèmes actifs reste recherchable ;
- un nouveau tag peut être créé et associé au brouillon sans passer par
  l’administration ;
- les noms/alias équivalents ne produisent aucun doublon ;
- aucun tag historique inactif n’est réactivé par accident ;
- chaque tag actif ou archivé du registre est gérable depuis le menu `Tags` ;
- les tags créés depuis l’extension et encore sans description sont faciles à
  retrouver et à documenter ;
- toutes les limites et erreurs sont exprimées en français courant.

Une télémétrie supplémentaire n’est pas requise : il s’agit d’un outil privé à
utilisateur unique. Les tests de contrat et la validation manuelle constituent
la preuve attendue.

## Périmètre d’implémentation probable

### Extension

- `browser-extension/entrypoints/popup/index.html`
- `browser-extension/entrypoints/popup/main.ts`
- `browser-extension/entrypoints/popup/style.css`
- `browser-extension/lib/tag-suggestions.ts`
- `browser-extension/test/popup.test.ts`
- `browser-extension/test/tag-suggestions.test.ts`
- `browser-extension/package.json`
- `browser-extension/package-lock.json`
- `browser-extension/wxt.config.ts`

### Service et documentation

- `admin-service/src/admin-assets.ts`
- `admin-service/src/curation.ts`
- `admin-service/src/server.ts` si le contrat de route évolue
- `admin-service/src/curation-db.ts` si le comptage des brouillons nécessite une
  requête dédiée
- `admin-service/src/tag-taxonomy.ts`
- tests admin ciblés sur le contrat, les courses et les thèmes archivés
- `docs/architecture.md`
- `docs/decisions.md`
- `docs/interface.md`
- `README.md` ou `browser-extension/CHROME_WEB_STORE.md` si la procédure de
  diffusion évolue
- `hugo.yaml`, `admin-service/src/admin-assets.ts` et
  `admin-service/test/admin-assets.test.ts` pour la version du site

Ne pas modifier `data/tags.json` pour y ajouter `Memory` dans le cadre de
l’implémentation elle-même : le but est de valider le parcours de création,
pas d’imposer ce thème éditorial dans les fixtures de production.

## Étapes d’implémentation

### Étape 1 — Aligner le vocabulaire et le contrat de lecture

1. Employer `Tags` dans les interfaces de l’extension et de l’administration,
   tout en conservant si nécessaire les noms internes existants.
2. Faire consommer `options.themes` à l’extension.
3. Partager un type représentant `name`, `description` et `aliases` si cela
   réduit les divergences sans coupler directement les deux packages.
4. Ramener la limite du popup de douze à trois.
5. Ajouter les messages français pour toutes les erreurs de tag connues.

### Étape 2 — Construire la hiérarchie suggestions puis recherche

1. Conserver et tester le moteur de suggestion existant.
2. Afficher les suggestions avant la recherche.
3. Transformer le champ en combobox accessible sur le registre actif.
4. Exclure les thèmes déjà sélectionnés et synchroniser le compteur.
5. Conserver correctement les sélections dans la reprise locale.

### Étape 3 — Rendre la création sûre et idempotente

1. Détecter un libellé sans correspondance exacte de nom ou d’alias.
2. Ajouter la confirmation `Créer et sélectionner`.
3. Durcir `addTheme()` pour distinguer thème actif concurrent, thème archivé
   réservé et entrée invalide.
4. Garantir que la taxonomie fraîche est utilisée lors de l’enregistrement du
   brouillon suivant.
5. Conserver la saisie et permettre un nouvel essai après une panne réseau.

### Étape 4 — Construire le menu « Tags » de l’administration

1. Renommer l’entrée de navigation `Thèmes` en `Tags` et structurer les vues
   `Actifs` et `Archivés`.
2. Enrichir le contrat avec les compteurs de liens publiés et de brouillons.
3. Conserver la création et l’édition existantes, puis rendre les opérations de
   renommage, fusion et archivage explicites.
4. Ajouter la réactivation sûre d’un tag archivé.
5. Signaler et filtrer les tags `À documenter` créés depuis l’extension.
6. Afficher les erreurs dans la ligne ou le formulaire qui les a produites.

### Étape 5 — Tester les contrats et les régressions

Ajouter au minimum les scénarios suivants :

- les suggestions automatiques précèdent le champ de recherche ;
- elles utilisent noms, descriptions et alias de `options.themes` ;
- une suggestion ajoute le nom canonique ;
- la recherche trouve un nom avec différences de casse et d’accent ;
- un alias sélectionne son thème canonique et ne propose pas de création ;
- une saisie inconnue propose la création, sans la déclencher implicitement ;
- confirmation, succès, annulation et échec réseau de la création ;
- rejeu après réponse perdue sans doublon ;
- refus lisible d’un nom historique réservé ;
- limite de trois dans l’interface et dans l’API ;
- reprise locale avec un thème nouvellement créé ;
- traduction de `UNKNOWN_TAG`, `TOO_MANY_THEMES`, `THEME_RESERVED`,
  `THEME_ALREADY_EXISTS`, 401/403 et erreur réseau ;
- parcours clavier de la combobox et restauration du focus.
- navigation vers le menu `Tags`, compteurs actifs/archivés/incomplets et
  recherche par nom, description ou alias ;
- apparition d’un tag créé depuis l’extension avec l’état `À documenter` ;
- renommage avec conservation de route, fusion avec migration des liens et
  brouillons, archivage avec retrait des brouillons et réactivation ;
- messages et focus corrects après succès ou erreur sur une ligne admin.

### Étape 6 — Versionner, vérifier et préparer la diffusion

Cette évolution est une nouvelle fonctionnalité :

- passer le site et l’administration de `v1.18.1` à `v1.19.0` dans
  `hugo.yaml`, `admin-service/src/admin-assets.ts` et son test ;
- passer l’extension de `1.2.0` à `1.3.0` dans `package.json`, le lockfile et
  `wxt.config.ts` ;
- mettre à jour les documents durables afin de préciser que les mots-clés
  libres restent interdits, mais qu’un libellé peut être explicitement promu
  en tag actif pendant la capture et géré ensuite dans le menu `Tags` ;
- vérifier visuellement l’extension réelle dans Chrome, sur ordinateur, au
  clavier et à 200 % de zoom ;
- vérifier visuellement le menu `Tags` de l’administration dans un navigateur
  réel sur ordinateur et mobile ;
- après fusion et déploiement, vérifier `v1.19.0` dans le pied de page public et
  l’administration, puis créer le tag Git annoté `v1.19.0` sur le commit
  effectivement déployé ;
- produire et tester l’archive `extension-v1.3.0` avant toute mise à jour Chrome
  Web Store.

## Commandes de vérification

| Usage | Commande | Résultat attendu |
|---|---|---|
| Tests extension | `npm --prefix browser-extension test` | tous les tests passent |
| Types extension | `npm --prefix browser-extension run typecheck` | code 0 |
| Build extension | `npm --prefix browser-extension run build` | archive MV3 construite |
| Tests admin | `npm --prefix admin-service test` | tous les tests passent |
| Build admin | `npm --prefix admin-service run build` | code 0 |
| Vérification globale | `node scripts/verify.mjs` | code 0 |

## Conditions d’arrêt

Arrêter l’implémentation et rendre compte si :

- la création depuis l’origine signée de l’extension exigerait d’élargir les
  permissions à une origine différente de `https://digest.ooblik.com/*` ;
- le serveur ne peut pas distinguer un thème actif d’un thème archivé avant la
  création ;
- la création suivie de la sauvegarde ne peut pas être rendue idempotente sans
  migration destructive ou sans risque de perdre un brouillon existant ;
- une divergence fonctionnelle récente remet en cause la limite de trois ou le
  rôle de `data/tags.json` comme source de vérité ;
- la copie de travail contient des modifications utilisateur dans les fichiers
  ciblés qui se chevauchent avec le chantier.

## Critères de terminé

- [x] Les suggestions automatiques sont affichées avant la recherche dans les
  tags existants.
- [x] Les suggestions utilisent les définitions actives complètes du serveur.
- [x] Tous les tags actifs sont recherchables par nom, description et alias.
- [x] La saisie d’un nouveau libellé offre une création explicite et confirmée.
- [x] Le tag créé rejoint le registre actif et sa route publique existe.
- [x] Le nouveau tag est sélectionné et le brouillon s’enregistre sans
  `UNKNOWN_TAG`.
- [x] Les alias, courses réseau et rejouements ne créent aucun doublon.
- [x] Les tags archivés restent réservés et ne sont pas réactivés
  silencieusement.
- [x] Zéro à trois tags sont acceptés ; un quatrième est bloqué avec un
  message lisible.
- [x] La navigation de l’administration contient le menu `Tags` et les fiches
  de brouillon utilisent le même terme.
- [x] Le menu sépare les tags actifs et archivés et affiche leurs compteurs
  d’usage dans les liens publiés et les brouillons.
- [x] Les tags sans description sont signalés et filtrables comme
  `À documenter`.
- [x] La création, l’édition, le renommage, la fusion, l’archivage et la
  réactivation sont couverts par l’interface et les tests.
- [x] Aucun code d’erreur technique n’est exposé dans le popup.
- [x] La reprise locale ne perd ni champs ni tags après une erreur.
- [x] Le parcours est validé à la souris, au clavier et à 200 % de zoom dans
  Chrome.
- [x] Le menu `Tags` est validé dans un navigateur réel sur ordinateur et
  mobile.
- [x] Tests, types, builds et vérification globale passent.
- [x] Les versions du site, de l’administration et de l’extension sont mises à
  jour conformément à SemVer.
- [x] La documentation durable reflète la création explicite depuis
  l’extension.

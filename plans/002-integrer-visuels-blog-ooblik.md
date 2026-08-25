# Plan 002 : Intégrer les visuels patrimoniaux du Blog OOBLIK

> **Instructions d’exécution** : suivre ce plan dans l’ordre, exécuter chaque
> vérification et confirmer son résultat avant de continuer. Si une condition
> d’arrêt survient, s’arrêter et rendre compte sans improviser. À la fin,
> passer la ligne de ce plan à `DONE` dans `plans/README.md`, sauf si le
> réviseur maintient lui-même l’index.
>
> **Contrôle de dérive initial** :
> `git diff --stat f246c11ab..HEAD -- admin-service/src/wordpress-import.ts admin-service/scripts/import-wordpress.ts admin-service/test/wordpress-import.test.ts admin-service/test/fixtures/wordpress-export.xml scripts/check_digest_consistency.py layouts/index.html assets/css/extended/digest.css docs/architecture.md docs/journal/2026-08-20.md hugo.yaml admin-service/src/admin-assets.ts admin-service/test/admin-assets.test.ts`
> Si un fichier fonctionnel concerné a changé, comparer le code réel à l’état
> décrit ci-dessous avant de commencer. Un écart qui modifie le contrat
> d’import est une condition d’arrêt.

## Statut

- **Priorité** : P1
- **Effort** : L — une journée de code et de contrôles, puis une revue visuelle
- **Risque** : MED — enrichissement massif du catalogue et ajout de plusieurs
  centaines de fichiers versionnés
- **Dépend de** : aucun plan actif
- **Catégorie** : direction / données éditoriales
- **Planifié au commit** : `f246c11ab`, 2026-08-23

## Pourquoi ce chantier

Les billets patrimoniaux sont présents dans `data/links.json`, mais leur import
du 20 août 2026 a volontairement utilisé `--skip-images`. Le rapport local
confirme donc 0 image prête. Les sources FTP, environ 2,7 Go, sont disponibles
dans `import-blog/uploads/<année>/...` et doivent rester hors Git ; seuls les
WebP associés à une carte doivent être publiés.

Le pipeline sait déjà choisir l’image mise en avant, se rabattre sur la première
image du contenu, recadrer en 16:9 et écrire sous
`static/media/blog-ooblik/<année>/`. Une passe directe échouerait toutefois sur
145 URL historiques commençant par `//blog.ooblik.com/`. Il manque aussi une
revue visuelle exploitable avant `--apply` et un contrôle durable entre les
chemins du catalogue et les fichiers publiés.

## État actuel vérifié

### Corpus réel au 23 août 2026

- Le WXR `C:/Users/marct/Downloads/blogooblik.WordPress.2026-08-20.xml`
  contient 832 billets publiés.
- Avec le catalogue, les probes et les overrides actuels, 823 billets sont
  prêts à être rejoués : 643 ont une image mise en avant, 153 utilisent la
  première image du contenu et 27 n’ont aucune image candidate.
- 796 candidats possèdent donc une URL d’image ; 145 de ces URL sont relatives
  au protocole (`//blog.ooblik.com/...`) et le code actuel les rejette.
- Après normalisation purement analytique, 789 fichiers candidats sont trouvés
  dans `import-blog/uploads`, sans erreur de décodage par Sharp.
- Six premières images de contenu sont hébergées sur un domaine externe : elles
  doivent rester exclues conformément à la règle « images du seul domaine du
  blog ».
- Un billet (`wordpress_id: 711`) pointe vers un ancien nom Unicode absent,
  alors que des variantes correspondantes existent dans
  `import-blog/uploads/2015/07/`. Cette correspondance doit être décidée dans
  `import/wordpress/overrides.json`, jamais par rapprochement flou automatique.
- 16 sources sont très petites dans au moins une dimension ; 420 sont sous
  960 × 540. Le convertisseur n’agrandit pas artificiellement ces fichiers,
  mais leur rendu doit être contrôlé.
- Seules 76 images candidates ont un texte alternatif WordPress. Les 720 autres
  restent décoratives avec `alt=""` : ne pas fabriquer automatiquement un alt
  trompeur ou redondant avec le titre voisin.

### Code à préserver et à renforcer

- `admin-service/src/wordpress-import.ts:258` sélectionne la première balise
  `<img>` du contenu.
- `admin-service/src/wordpress-import.ts:309-337` donne la priorité à
  `_thumbnail_id`, puis à cette première image.
- `admin-service/src/wordpress-import.ts:558-623` produit le chemin final,
  convertit en WebP 16:9 et interdit les domaines ou chemins non sûrs.
- `admin-service/scripts/import-wordpress.ts:110-168` lit d’abord le média FTP,
  puis tente actuellement le réseau, remplit `link.image` et n’écrit dans
  `static/` qu’avec `--apply`.
- `layouts/index.html:165-171` et
  `assets/css/extended/digest.css:1195-1211` savent déjà afficher le bandeau
  16:9 dans la carte et la modale. Ils ne nécessitent aucun nouveau composant.
- `admin-service/test/wordpress-import.test.ts:42-54` teste déjà la priorité
  image mise en avant / première image ; les tests de conversion et de chemin
  commencent à la ligne 199.
- `docs/architecture.md:62-72` définit la copie locale, le WebP 960 × 540 et
  l’idempotence. `AGENTS.md` impose que les 2,7 Go restent hors Git et que seuls
  les WebP réellement retenus soient versionnés.

## Commandes de référence

| But | Commande | Résultat attendu |
|---|---|---|
| Tests import | `npm --prefix admin-service test -- --test-name-pattern=wordpress` | les tests passent ; si npm ignore le filtre, la suite complète passe |
| Typage | `npm --prefix admin-service run typecheck` | sortie 0, aucune erreur |
| Prévisualisation locale | `npm --prefix admin-service run import:wordpress -- --input C:/Users/marct/Downloads/blogooblik.WordPress.2026-08-20.xml --probe-results import/wordpress/probe-results.json --local-only` | rapport et revue produits hors Git, aucun accès réseau |
| Application | même commande avec `--apply` après validation humaine | catalogue enrichi et WebP copiés sous `static/media/blog-ooblik/` |
| Cohérence | `python scripts/check_digest_consistency.py --site .` | sortie 0, aucun média manquant ou orphelin |
| Vérification complète | `node scripts/verify.mjs` | `Verification completed successfully.` |

La suite actuelle a été vérifiée avant rédaction : 160 tests passent et
`npm --prefix admin-service run typecheck` sort avec le code 0.

## Périmètre

**Fichiers fonctionnels autorisés** :

- `admin-service/src/wordpress-import.ts`
- `admin-service/scripts/import-wordpress.ts`
- `admin-service/test/wordpress-import.test.ts`
- `admin-service/test/fixtures/wordpress-export.xml`
- `scripts/check_digest_consistency.py`
- `docs/architecture.md`
- `docs/journal/2026-08-20.md`
- `hugo.yaml`
- `admin-service/src/admin-assets.ts`
- `admin-service/test/admin-assets.test.ts`

**Données finales autorisées après la revue** :

- `data/links.json`
- `static/media/blog-ooblik/**/*.webp`

**Fichiers locaux non versionnés utilisés par le chantier** :

- `import/wordpress/overrides.json`
- `import/wordpress/report.json`
- `import/wordpress/ready.json`
- `import/wordpress/image-review.html`
- `import/wordpress/media/*.webp`
- `import-blog/uploads/**`

**Hors périmètre** :

- ne pas copier l’arborescence FTP complète dans `static/` ;
- ne pas publier les pages HTML de revue, le WXR, les caches ou les originaux ;
- ne pas télécharger ou republier les six images de domaines externes ;
- ne pas changer les URLs de consultation, les `origin_url`, les textes
  archivés, les catégories ou les tags durant cette passe ;
- ne pas modifier le dessin des cartes ou des modales ; le rendu 16:9 existe ;
- ne pas créer d’image artificielle pour les billets sans visuel fiable ;
- ne pas déduire un fichier à partir d’un nom approchant : utiliser un override
  explicite, vérifiable et idempotent.

## Git

- Branche : `codex/002-visuels-blog-ooblik`.
- Commits courts en français, par unité logique, comme l’historique du dépôt :
  par exemple `Fiabiliser la résolution des médias WordPress`, puis
  `Intégrer les visuels du Blog OOBLIK`.
- Ne pas pousser et ne pas ouvrir de pull request sans instruction explicite.

## Étapes

### 1. Normaliser les URLs d’images historiques sans élargir la confiance

Dans `admin-service/src/wordpress-import.ts`, créer un helper unique pour
résoudre les URLs d’images WordPress :

- accepter `https://blog.ooblik.com/...`, `http://blog.ooblik.com/...`,
  `//blog.ooblik.com/...` et, si rencontré, `/wp-content/uploads/...` ;
- résoudre les formes relatives avec l’origine du blog issue du WXR ;
- continuer à n’accepter que HTTP(S), le domaine exact normalisé du blog et un
  chemin sous `/wp-content/uploads/` ;
- utiliser cette normalisation avant la résolution du chemin FTP et avant un
  éventuel téléchargement réseau ;
- filtrer la première image du contenu si elle appartient à un domaine externe,
  au lieu de la présenter comme candidat qui échouera plus tard ;
- conserver les overrides soumis exactement aux mêmes validations.

Ajouter au fixture et aux tests les cas URL absolue, `//`, chemin racine,
domaine externe et traversée de répertoire. Vérifier explicitement que les
variantes avec et sans `www` ne sont pas fusionnées par cette correction.

**Vérifier** :
`npm --prefix admin-service test -- --test-name-pattern=wordpress` → tous les
tests passent et un test prouve que `//blog.ooblik.com/...` devient un chemin
FTP sûr tandis qu’un domaine externe reste exclu.

### 2. Ajouter un mode local strict et un rapport d’images actionnable

Dans `admin-service/scripts/import-wordpress.ts`, ajouter `--local-only` :

- exiger un `mediaRoot` lisible ; sinon arrêter avec une erreur claire avant
  toute conversion ;
- ne jamais appeler `fetch` dans ce mode ;
- distinguer dans le rapport : `featured`, `content`, `none`, `external`,
  `missing_local`, `conversion_failure`, `low_resolution` et `ready` ;
- enregistrer les dimensions source et finales, le chemin FTP relatif, le
  chemin WebP final et l’identifiant WordPress ;
- garder `images.from_network` à 0 et rendre cette propriété vérifiable ;
- ne pas traiter l’absence volontaire de candidat local comme un échec global.

Pour rendre la provenance testable, faire remonter depuis
`parseWordpressExport` un discriminant `featured | content | none`, puis le
propager dans `WordpressReadyItem`. Ne pas tenter de l’inférer depuis l’URL.

La prévisualisation peut continuer à alimenter le cache ignoré
`import/wordpress/media/`, mais elle ne doit pas modifier `data/links.json` ni
`static/` sans `--apply`.

**Vérifier** : lancer la prévisualisation locale. Le rapport doit indiquer 823
éléments prêts, 0 lecture réseau, aucune erreur pour les 145 URLs `//`, six
images externes exclues et un seul nom local non résolu avant override.

### 3. Générer une planche de revue locale avant publication

Ajouter une génération déterministe de
`import/wordpress/image-review.html`, testable depuis
`admin-service/src/wordpress-import.ts` et appelée par le script. La page doit :

- fonctionner localement sans serveur et charger les WebP du cache via des
  chemins relatifs ;
- présenter titre, année, identifiant WordPress, `origin_url`, type de source,
  dimensions source/finales et statut ;
- permettre de filtrer au minimum par année, `featured`, `content`, faible
  résolution, manquant et externe ;
- montrer le recadrage 16:9 réellement destiné aux cartes, pas l’original brut ;
- utiliser des contrôles clavier, un focus visible, des cellules rectangulaires
  et `prefers-reduced-motion`, conformément à `docs/interface.md` ;
- rester strictement locale et ne contenir ni secret ni URL privée.

Tester l’échappement HTML, les filtres/statuts et les chemins relatifs. Ne pas
introduire une dépendance frontend pour cette page ponctuelle.

**Vérifier** : ouvrir `import/wordpress/image-review.html` dans un navigateur
réel, puis contrôler au minimum les 16 très petites sources, les 153 replis de
contenu, les 10 GIF convertis et un échantillon de chaque année 2015–2024.

### 4. Enregistrer les décisions éditoriales dans les overrides locaux

Dans `import/wordpress/overrides.json` :

- corriger explicitement le visuel du billet 711 vers le nom Unicode réellement
  retenu après inspection ;
- examiner les six candidats externes et les 27 billets sans candidat ; ne leur
  attribuer un média que si un fichier local du même billet est identifié sans
  ambiguïté ;
- remplacer les images manifestement décoratives, logos ou recadrages
  inutilisables uniquement lorsqu’un meilleur média local est établi ;
- laisser sans `image` toute entrée incertaine.

Si nécessaire, rendre explicite dans le type d’override la décision « aucun
visuel » (`image_url: null` ou champ équivalent), avec validation et tests, afin
qu’un futur import ne réintroduise pas un mauvais candidat. Ne pas utiliser une
chaîne vide implicite.

**Vérifier** : rejouer deux fois la prévisualisation. Les deux `ready.json` et
`report.json` doivent être identiques ; `failures` doit être vide et tous les
éléments non illustrés doivent porter un motif explicite.

### 5. Renforcer la cohérence catalogue ↔ fichiers

Étendre `scripts/check_digest_consistency.py` pour imposer :

- tout `link.image` commence par `/media/blog-ooblik/`, existe sous `static/`
  et se termine par `.webp` ;
- tout `image_alt` appartient à une entrée qui possède `image` ;
- chaque WebP sous `static/media/blog-ooblik/` est référencé exactement une
  fois par le catalogue ;
- les chemins restent sous le répertoire attendu, sans traversée ;
- les erreurs citent l’identifiant et le chemin concernés.

Ajouter des cas de validation reproductibles, soit par tests unitaires dédiés,
soit par fixtures minimales passées au script. Ne pas scanner
`import-blog/uploads` dans la CI.

**Vérifier** : le contrôle échoue sur une fixture avec média absent et sur une
fixture avec WebP orphelin, puis passe sur le dépôt après application.

### 6. Appliquer l’import validé

Une fois la planche acceptée, lancer la commande locale avec `--apply`. Le
script doit :

- enrichir les 823 cartes existantes sans changer leur identifiant ni créer de
  doublon ;
- copier uniquement les WebP retenus sous
  `static/media/blog-ooblik/<année>/` ;
- conserver intégralement `archive_text`, `origin_url`, états de lien mort et
  métadonnées éditoriales ;
- produire le même résultat lors d’un second `--apply` ;
- ne laisser aucun WebP non référencé.

Comparer avant/après par script, pas à l’œil : nombre d’entrées, ensemble des
IDs, URLs, `origin_url`, textes archivés, statuts et tags doivent rester
identiques ; seuls `image` et `image_alt` peuvent être ajoutés ou modifiés.

**Vérifier** :

1. premier `--apply` → rapport sans échec ;
2. conserver `git diff --stat` ;
3. second `--apply` → aucun changement supplémentaire dans `git diff` ;
4. `python scripts/check_digest_consistency.py --site .` → sortie 0.

Le volume final n’est pas fixé artificiellement dans le code. À corpus inchangé,
la référence attendue est d’au moins 790 visuels si le billet 711 est résolu ;
tout écart vers le bas doit être expliqué dans le rapport, pas masqué.

### 7. Vérifier le rendu public sur ordinateur et mobile

Construire Hugo et inspecter dans un navigateur réel :

- une carte avec image mise en avant ;
- une carte utilisant la première image du contenu ;
- une image verticale fortement recadrée ;
- une petite source ;
- un billet sans image ;
- la modale correspondante ;
- largeurs bureau et 375 px, sans débordement horizontal ;
- chargement différé, focus clavier et texte alternatif vide ou éditorial selon
  la donnée d’origine.

Ne modifier `layouts/index.html` ou la CSS que si cette vérification révèle une
régression réelle. Une telle correction visuelle élargirait le périmètre :
s’arrêter d’abord et rendre compte.

**Vérifier** : `hugo --gc --minify --panicOnWarning --baseURL https://digest.ooblik.com/`
→ sortie 0, puis captures de contrôle bureau/mobile conservées hors Git.

### 8. Documenter et versionner la correction technique

Mettre à jour `docs/architecture.md` avec le mode local strict, le rapport et la
revue. Compléter la suite ouverte du journal du 20 août sans prétendre que le
travail était déjà terminé.

La normalisation des URLs, la revue et la validation sont une évolution
technique destinée au déploiement : passer la version de `v1.16.2` à
`v1.16.3` dans `hugo.yaml`, `admin-service/src/admin-assets.ts` et
`admin-service/test/admin-assets.test.ts`. L’ajout des WebP lui-même reste une
publication éditoriale et ne justifie pas une seconde hausse de version.

**Vérifier** : les trois occurrences affichées valent `v1.16.3`, puis
`node scripts/verify.mjs` se termine par `Verification completed successfully.`

## Plan de tests

Dans `admin-service/test/wordpress-import.test.ts`, couvrir au minimum :

1. priorité image mise en avant puis contenu, avec provenance exposée ;
2. normalisation d’une URL `//blog.ooblik.com/...` ;
3. résolution sûre d’un chemin racine ;
4. rejet d’une image externe, d’une variante `www` différente et d’une
   traversée de chemin ;
5. mode local strict sans appel à `fetch` ;
6. média local absent classé sans tentative réseau ;
7. décision explicite de ne pas publier d’image ;
8. rapport stable et planche HTML correctement échappée ;
9. conversion déterministe WebP, orientation et suppression des métadonnées ;
10. second import strictement idempotent.

Utiliser le fixture WXR existant plutôt que le WXR réel dans les tests. Les
comptages du corpus réel appartiennent aux vérifications opératoires, pas aux
tests unitaires versionnés.

## Critères de fin

- [ ] Les 145 URLs relatives au protocole sont résolues localement sans réseau.
- [ ] Les six images externes ne sont ni téléchargées ni publiées.
- [ ] Le billet 711 a une décision explicite et vérifiée.
- [ ] Les billets sans visuel fiable restent valides et sont documentés dans le
  rapport.
- [ ] La planche locale a été contrôlée sur les cas à risque et chaque année.
- [ ] Le second `--apply` ne modifie plus aucun fichier.
- [ ] Le catalogue conserve exactement ses IDs, URLs, provenances, textes,
  statuts et tags ; seuls les champs d’image changent.
- [ ] Chaque `image` du catalogue pointe vers un WebP existant et chaque WebP
  publié est référencé une fois.
- [ ] Aucun original FTP, WXR, cache ou rapport local n’est suivi par Git.
- [ ] `npm --prefix admin-service run typecheck` passe.
- [ ] Les tests du service passent.
- [ ] `node scripts/verify.mjs` passe.
- [ ] La version publique et la version admin valent toutes deux `v1.16.3`.
- [ ] Le rendu a été vérifié dans un navigateur réel sur bureau et à 375 px.
- [ ] `plans/README.md` marque ce plan `DONE`.

## Conditions d’arrêt

S’arrêter et rendre compte si :

- le WXR, le catalogue ou les overrides ne produisent plus 823 éléments prêts
  avant décisions éditoriales ;
- l’intégration exige de modifier une URL de destination ou un `origin_url` ;
- un média ne peut être relié sans ambiguïté au billet ;
- la correction requiert d’accepter un domaine autre que `blog.ooblik.com` ;
- l’application supprime ou altère `archive_text`, les états de lien mort, les
  tags ou des identifiants ;
- un fichier hors périmètre doit être modifié ;
- le deuxième `--apply` produit encore un diff ;
- une vérification échoue deux fois après une correction raisonnable ;
- le rendu public impose finalement une refonte de carte ou de modale.

## Notes de maintenance

- Le WXR reste la source de la sélection initiale, les fichiers FTP la source
  binaire et les overrides la trace des exceptions humaines.
- Toute future passe doit utiliser le mode local strict tant que la copie FTP
  est disponible ; le réseau n’est qu’un secours explicite, jamais silencieux.
- Le contrôle d’orphelins empêchera ensuite d’oublier d’effacer un ancien WebP
  lorsqu’un override change.
- Une image vide n’est pas nécessairement une lacune : pour un billet sans
  visuel fiable, l’absence est préférable à une association patrimoniale
  erronée.
- Après fusion et déploiement, créer le tag annoté `v1.16.3` sur le commit
  effectivement publié et vérifier la version dans le pied de page public et
  l’administration, conformément à `AGENTS.md`.

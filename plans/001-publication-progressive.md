# Plan 001 : Publier un Digest en une action avec un suivi progressif fiable

> **Instructions d’exécution** : suivre ce plan pas à pas. Exécuter chaque
> commande de vérification et confirmer le résultat attendu avant de continuer.
> Si une condition de la section « Conditions d’arrêt » se produit, arrêter et
> rendre compte sans improviser. À la fin, passer la ligne de ce plan à `DONE`
> dans `plans/README.md`, sauf si le relecteur maintient lui-même l’index.
>
> **Contrôle de dérive (à exécuter en premier)** :
> `git diff --stat a885f30d9a1745bf253e071479b8ba39fb058d47..HEAD -- admin-service/src/admin-assets.ts admin-service/src/curation.ts admin-service/src/server.ts admin-service/scripts/preview-admin.mjs admin-service/test/admin-assets.test.ts README.md docs/architecture.md docs/journal/README.md docs/journal/2026-08-16.md`
> Si un fichier existant de cette liste a changé depuis la rédaction du plan,
> comparer la section « État actuel » au code vivant. En cas de divergence
> fonctionnelle, appliquer une condition d’arrêt.

## Statut

- **Priorité** : P1
- **Effort** : M
- **Risque** : MED
- **Dépend de** : aucun
- **Catégorie** : direction, bug, tests, docs
- **Planifié à** : commit `a885f30d9a1745bf253e071479b8ba39fb058d47`, 2026-08-16
- **État d’exécution** : DONE, validé localement le 2026-08-16

## Pourquoi c’est important

L’atelier présente actuellement « Vérifier le lot » puis « Publier ce Digest »
comme deux étapes, alors que la publication relance déjà la même validation
côté serveur. Ce doublon rend l’action décisive ambiguë. Une fois le commit
créé, le suivi dépend en outre d’une boucle JavaScript fragile : une erreur
réseau l’arrête et un rechargement de la page ne la reprend pas.

Le résultat attendu est un seul bouton de publication, sans perte de sécurité,
suivi d’une mini progression liée aux quatre états réels du serveur. La personne
voit immédiatement que le travail continue, peut fermer puis rouvrir l’onglet,
et obtient un lien direct vers l’édition quand elle est réellement visible en
production.

## État actuel

- `admin-service/src/admin-assets.ts` contient tout le HTML, le CSS et le
  JavaScript de l’administration.
  - lignes 89–92 : deux boutons, `Vérifier le lot` et `Publier ce Digest` ;
  - lignes 219–225 : chaque aperçu fabrique un nouvel UUID puis appelle
    `/api/admin/curation/publications/preview` ;
  - lignes 226–230 : le POST de publication attend la création du commit avant
    d’ouvrir le panneau de suivi ;
  - lignes 231–239 : les états sont affichés comme badges, le polling ne couvre
    que `validating` et `deploying`, crée des temporisateurs non gérés et
    s’arrête définitivement après une erreur réseau ;
  - lignes 256–262 : l’initialisation charge la liste, mais ne reprend aucune
    publication active.
- `admin-service/src/curation.ts:231-245` expose `previewPublication()`, qui
  appelle `preparePublication()`. `publish()` appelle à nouveau
  `preparePublication()` à la ligne 306 avant toute création ou écriture : la
  suppression de l’aperçu ne doit donc supprimer aucun contrôle.
- `admin-service/src/server.ts:244-249` expose la route privée d’aperçu. La
  recherche locale ne trouve aucun autre consommateur que l’interface admin.
- `admin-service/src/curation-types.ts` définit déjà les états nécessaires :
  `committing`, `validating`, `deploying`, `live`, `failed`. Aucun nouvel état ni
  changement de schéma n’est requis.
- `admin-service/src/curation.ts:417-490` rafraîchit un enregistrement toutes les
  15 secondes au maximum, lit les workflows `Validate` et `Deploy production`,
  puis vérifie la présence du titre sur `/archives/<date>/` avant de passer à
  `live`. Ce mécanisme reste la source de vérité.
- `admin-service/scripts/preview-admin.mjs:89-102` ne simule que la liste des
  publications. Il faudra aussi simuler le détail rafraîchi pour contrôler le
  polling en aperçu local.
- `admin-service/test/admin-assets.test.ts` utilise déjà des tests de contrat sur
  les chaînes HTML/JS. Conserver ce style léger ; ne pas ajouter `jsdom` pour ce
  seul chantier.
- Le vocabulaire visuel existant est défini par `--paper`, `--ink`, `--muted`,
  `--line`, `--accent`, `--ok` et `--warn`. Réutiliser ces jetons et les formes
  de boutons existantes.
- Contraintes produit à préserver : interface éditoriale, directe et calme ;
  action groupée explicite ; état réel de bout en bout ; clavier et lecteur
  d’écran ; l’information ne dépend pas de la couleur ; toute animation
  respecte `prefers-reduced-motion`.
- La copie de travail principale est actuellement très sale et son `HEAD`
  local est en retard sur `origin/main`. Ne jamais y faire l’implémentation.

## Brief d’interface approuvé par ce plan

Le parcours cible est le suivant :

1. La sélection affiche `13 liens prêts à publier.` et le bouton principal
   porte dynamiquement `Publier les 13 liens` (accord singulier/pluriel). Il est
   désactivé à zéro sélection et pendant l’envoi.
2. Au clic, le formulaire affiche immédiatement, sous l’action,
   `Contrôle et création du commit…` avec la première étape active. Le serveur
   continue d’exécuter tous les contrôles de `preparePublication()`.
3. Après la réponse du POST, le panneau Publications s’ouvre et la carte active
   montre quatre segments : `Préparation`, `Validation`, `Déploiement`,
   `En ligne`.
4. Un segment terminé est plein ; le segment actif contient un mouvement court
   et discret. Il n’y a pas de faux pourcentage. En mode réduction des
   mouvements, le segment actif reste statique et visuellement distinct.
5. Les textes d’état sont :
   - `Préparation du Digest…` pour `committing` ;
   - `Validation GitHub en cours…` pour `validating` ;
   - `Déploiement en cours… Comptez généralement 3 à 4 minutes.` pour
     `deploying` ;
   - `Le Digest est en ligne.` avec `Voir l’édition` pour `live` ;
   - `Publication interrompue.` avec le code d’erreur et les liens Actions
     disponibles pour `failed`.
6. Les liens secondaires `Validation` et `Déploiement` restent disponibles pour
   le diagnostic. Le bouton `Actualiser` disparaît pendant une publication
   normale, puisque le suivi devient automatique.

## Commandes nécessaires

| Usage | Commande | Résultat attendu |
|---|---|---|
| Installer l’admin | `cd admin-service && npm ci` | code 0 |
| Tests admin | `cd admin-service && npm test` | tous les tests passent |
| Compiler l’admin | `cd admin-service && npm run build` | code 0, aucune erreur TypeScript |
| Aperçu local | `cd admin-service && npm run build && node scripts/preview-admin.mjs` | serveur sur `http://127.0.0.1:4179/admin` |
| Validation des données | `python3 scripts/ensure_link_ids.py --check && python3 scripts/check_url_canonicalization.py && python3 skills/curate-web-digest/scripts/curate_links.py --check --site . && node scripts/resolve_wayback_links.mjs --check && python3 scripts/check_digest_consistency.py --site .` | code 0 |
| Build Hugo | `hugo --gc --minify --baseURL https://digest.ooblik.com/` | code 0 |

## Outils conseillés à l’exécuteur

- Utiliser le skill `impeccable` si disponible pour conserver le brief visuel,
  notamment la progression honnête, la réduction des mouvements et les états
  accessibles.
- Utiliser l’aperçu `admin-service/scripts/preview-admin.mjs` pour la validation
  visuelle sur desktop et à une largeur inférieure à 760 px.

## Périmètre

**Dans le périmètre — seuls ces fichiers peuvent être modifiés :**

- `admin-service/src/admin-assets.ts`
- `admin-service/src/curation.ts`
- `admin-service/src/server.ts`
- `admin-service/scripts/preview-admin.mjs`
- `admin-service/test/admin-assets.test.ts`
- `.gitattributes` (créé à la demande lors de l’exécution pour stabiliser Windows/WSL)
- `README.md`
- `docs/architecture.md`
- `docs/journal/README.md`
- `docs/journal/2026-08-16.md` (à créer)
- `plans/README.md`

**Hors périmètre — ne pas modifier :**

- `.github/workflows/ci.yml` et `.github/workflows/deploy.yml` : leurs noms et
  déclenchements correspondent déjà au suivi serveur ;
- `admin-service/src/curation-types.ts` et `curation-db.ts` : le modèle d’état
  existant suffit ;
- le site public, le catalogue, les archives et l’extension Chrome ;
- les règles de conservation des liens morts et toute donnée éditoriale ;
- le découpage architectural de `admin-assets.ts` ;
- les modifications locales préexistantes dans la copie de travail principale.

## Workflow Git

- Depuis le dépôt principal, faire `git fetch origin`, puis créer un worktree
  isolé basé sur la dernière `origin/main`, par exemple :
  `git worktree add ../digest-web-admin-publication-progress -b codex/admin-publication-progress origin/main`.
- Confirmer dans le worktree : `git status --short` ne produit aucune sortie et
  `git rev-parse HEAD` vaut au moins le SHA planifié ou un descendant examiné par
  le contrôle de dérive.
- Utiliser des commits logiques au format observé, par exemple
  `feat: simplifier le suivi de publication`.
- Ne pas pousser et ne pas ouvrir de PR sans instruction explicite de
  l’opérateur.

## Étapes

### Étape 1 : Supprimer l’aperçu redondant sans affaiblir la validation

Dans `admin-service/src/admin-assets.ts`, retirer le bouton
`#preview-publication` et son gestionnaire. Dans `admin-service/src/server.ts`,
retirer `POST /api/admin/curation/publications/preview`. Dans
`admin-service/src/curation.ts`, retirer uniquement `previewPublication()`.

Ne pas modifier `preparePublication()` ni l’appel à cette méthode au début de
`publish()`. Garder `requireConfirmation(body)` sur le POST réel.

**Vérifier** :
`rg -n 'preview-publication|publications/preview|previewPublication' admin-service/src`
→ aucune sortie, code 1 ; puis `cd admin-service && npm run build` → code 0.

### Étape 2 : Transformer le formulaire en action unique avec retour immédiat

Dans `dashboardPage()` de `admin-service/src/admin-assets.ts` :

- donner un identifiant stable au bouton principal, par exemple
  `#submit-publication` ;
- ajouter une région compacte dédiée à l’état d’envoi sous les actions ;
- rendre la région invisible au repos sans la retirer du flux accessible.

Dans `adminJs` :

- mettre à jour le libellé et l’état désactivé du bouton depuis
  `updateSelection()` ;
- générer un UUID au début de l’intention de publication, puis conserver cet
  UUID pour une nouvelle tentative si la réponse réseau est incertaine ; ne pas
  créer plusieurs publications pour un même clic ;
- afficher immédiatement l’état `committing` côté client avant d’attendre le
  POST ;
- sur erreur de validation explicite, remettre le formulaire en état actionnable
  et afficher le code retourné ;
- sur succès, vider la sélection, recharger les brouillons, ouvrir Publications,
  rendre la publication renvoyée et démarrer son suivi.

La région textuelle doit avoir un statut accessible (`role="status"` ou
`aria-live="polite"`) sans voler le focus. Le bouton garde un focus visible.

**Vérifier** : `cd admin-service && npm test -- --test-name-pattern="publication wording|publication action"`
→ les tests ciblés passent.

### Étape 3 : Ajouter une progression segmentée fondée sur les états réels

Dans `adminCss` et `renderPublications()` :

- créer une progression compacte à quatre segments, en réutilisant les jetons
  CSS existants ;
- associer les états à leur étape : `committing=1`, `validating=2`,
  `deploying=3`, `live=4` ;
- afficher simultanément le libellé textuel, afin que la couleur ne soit jamais
  la seule information ;
- utiliser un `role="progressbar"` avec `aria-valuemin="1"`,
  `aria-valuemax="4"`, la valeur d’étape réelle et un `aria-valuetext`
  intelligible. Pour `failed`, annoncer l’échec sans inventer une valeur ;
- animer seulement le segment actif avec `transform`/opacité, entre 150 et
  250 ms pour les transitions d’état ;
- neutraliser l’animation dans
  `@media (prefers-reduced-motion: reduce)` ;
- ajouter à l’état `live` un lien relatif
  `/archives/<digestDate>/` nommé `Voir l’édition`.

Les cartes anciennes restent compactes. La publication active la plus récente
porte la progression détaillée ; les publications terminales peuvent conserver
un résumé et leurs liens de diagnostic.

**Vérifier** : `cd admin-service && npm test -- --test-name-pattern="publication progress"`
→ les tests de structure, d’états et de réduction des mouvements passent.

### Étape 4 : Rendre le polling unique, résilient et reprenable

Toujours dans `adminJs` :

- définir une constante des états actifs incluant `committing`, `validating` et
  `deploying` ;
- gérer un seul identifiant de publication active et un seul temporisateur ;
  annuler l’ancien avant d’en planifier un nouveau ;
- conserver l’intervalle de 15 secondes, aligné avec le throttle serveur ;
- après une erreur réseau, afficher un message calme et replanifier une
  tentative au lieu d’abandonner ;
- à l’initialisation, choisir la publication active la plus récente renvoyée par
  `loadPublications()` et reprendre automatiquement son suivi ;
- au retour d’un onglet masqué vers `document.visibilityState === "visible"`,
  déclencher un rafraîchissement immédiat sans créer une seconde boucle ;
- arrêter le temporisateur sur `live` ou `failed` ;
- n’envoyer une annonce globale que lors d’un changement réel d’état, pour
  éviter une répétition toutes les 15 secondes ;
- supprimer le bouton manuel `Actualiser` des états normaux.

Ne pas augmenter la fréquence serveur et ne pas rafraîchir simultanément toutes
les publications historiques.

**Vérifier** : `cd admin-service && npm test -- --test-name-pattern="publication polling"`
→ les contrats couvrent les trois états actifs, la reprise à l’initialisation,
le temporisateur unique et la relance après erreur.

### Étape 5 : Mettre à jour l’aperçu local et les tests de contrat

Dans `admin-service/scripts/preview-admin.mjs`, conserver la réponse de liste et
ajouter la réponse de détail pour
`/api/admin/curation/publications/<id>`. Prévoir un petit scénario en mémoire
qui passe de `validating` à `deploying`, puis `live` après plusieurs lectures,
avec les URL Actions factices et les champs de date attendus.

Dans `admin-service/test/admin-assets.test.ts`, ajouter des tests nommés couvrant
au minimum :

- une seule action de publication et aucune référence à l’aperçu supprimé ;
- le libellé singulier/pluriel et le bouton désactivé à zéro ;
- les quatre étapes et leur texte ;
- le lien `Voir l’édition` à l’état `live` ;
- `committing`, `validating` et `deploying` comme états actifs ;
- un temporisateur géré plutôt que des `setTimeout()` orphelins ;
- la reprise au chargement et la relance après erreur ;
- la règle `prefers-reduced-motion`.

Rester sur les tests de contrat existants et ne pas ajouter de dépendance de
DOM. Si ces contrats deviennent trop fragiles pour prouver le polling, arrêter
et proposer séparément l’extraction du contrôleur dans un module testable.

**Vérifier** : `cd admin-service && npm test` → tous les tests passent.

### Étape 6 : Aligner la documentation active

- Dans `README.md`, remplacer « composition explicite » par le parcours réel :
  sélection, publication en une action, validation automatique et suivi jusqu’à
  la visibilité publique.
- Dans `docs/architecture.md`, documenter que les états persistés pilotent une
  progression reprenable et que l’URL publique n’est proposée qu’après le
  contrôle de présence.
- Créer `docs/journal/2026-08-16.md` depuis le modèle. Documenter la demande, la
  décision d’éviter un faux pourcentage, les fichiers modifiés, les tests
  réellement exécutés et le déploiement uniquement s’il est prouvé.
- Ajouter la journée à `docs/journal/README.md`. Ne pas réécrire le billet du
  27 juillet : il décrit fidèlement l’existence historique de l’aperçu.

**Vérifier** :
`rg -n 'une action|progression|reprend' README.md docs/architecture.md docs/journal/2026-08-16.md`
→ les trois documents contiennent le nouveau parcours ;
`rg -n '2026-08-16' docs/journal/README.md` → une ligne trouvée.

### Étape 7 : Valider le chantier complet et l’interface

Exécuter dans l’ordre :

1. `cd admin-service && npm ci && npm test && npm run build`
2. depuis la racine, la commande « Validation des données » du tableau ci-dessus
3. `hugo --gc --minify --baseURL https://digest.ooblik.com/`
4. `cd admin-service && node scripts/preview-admin.mjs`

Dans l’aperçu, contrôler au clavier et visuellement : zéro, un et treize liens ;
états `validating`, `deploying`, `live`, `failed` ; largeur desktop et 760 px ;
rechargement pendant un état actif ; réduction des mouvements simulée. Vérifier
que la progression ne déborde pas et que le lien final pointe vers l’archive.

**Vérifier** : toutes les commandes sortent avec le code 0 ; l’inspection
manuelle ne révèle aucun blocage clavier, débordement ou libellé contradictoire.

## Plan de tests

- Étendre `admin-service/test/admin-assets.test.ts` sur les contrats listés à
  l’étape 5, en prenant les deux tests existants comme modèle.
- Cas nominal : 13 liens, POST réussi, transitions validation → déploiement → en
  ligne, lien d’archive visible.
- Cas limites : zéro lien, un lien, erreur de validation, erreur réseau
  transitoire, page rechargée pendant chacun des trois états actifs, workflow en
  échec, préférence de réduction des mouvements.
- Régression sécurité : `publish()` appelle encore `preparePublication()` et le
  POST réel exige toujours `confirm: true`.
- Vérification complète : `cd admin-service && npm test && npm run build` → tous
  les tests passent et TypeScript compile.

## Critères de terminé

- [ ] Un seul bouton principal publie le lot ; son libellé reflète le nombre de
  liens et il est désactivé à zéro.
- [ ] `rg -n 'preview-publication|publications/preview|previewPublication' admin-service/src` ne retourne aucune correspondance.
- [ ] `publish()` appelle toujours `preparePublication()` avant toute écriture et
  la route conserve `requireConfirmation(body)`.
- [ ] La progression affiche quatre étapes réelles, sans pourcentage inventé,
  avec texte accessible et réduction des mouvements.
- [ ] Le polling inclut `committing`, `validating`, `deploying`, reprend après un
  rechargement et après une erreur réseau, et n’utilise qu’un temporisateur.
- [ ] L’état `live` propose `/archives/<date>/`; l’état `failed` conserve les
  liens de diagnostic disponibles.
- [ ] `cd admin-service && npm test && npm run build` sort avec le code 0.
- [ ] `.gitattributes` impose LF aux textes et marque explicitement les formats
  binaires, sans renormalisation massive de contenu.
- [ ] Les validations de données et le build Hugo sortent avec le code 0.
- [ ] `git status --short` dans le worktree ne liste aucun fichier hors du
  périmètre, à l’exception des artefacts de build ignorés.
- [ ] `plans/README.md` indique `DONE` lorsque le travail est réellement fini.

## Conditions d’arrêt

Arrêter et rendre compte si :

- le contrôle de dérive révèle que le parcours, les routes ou les états ont été
  modifiés depuis `a885f30d` ;
- un consommateur réel de `/api/admin/curation/publications/preview` est trouvé
  hors de l’interface admin ;
- `publish()` ne rappelle plus `preparePublication()` ou la confirmation serveur
  a disparu ;
- la progression requiert un nouvel état persistant ou une migration SQLite ;
- prouver la reprise du polling exige une grosse dépendance DOM ou une
  refactorisation hors périmètre ;
- un test ou un build échoue deux fois après une correction raisonnable ;
- une étape exige de toucher aux archives, au catalogue ou aux modifications
  locales préexistantes.

## Notes de maintenance

- Les libellés `Validate` et `Deploy production` sont couplés aux noms des
  workflows. Tout renommage futur doit mettre à jour
  `CurationService.refreshPublication()` et ses tests.
- L’intervalle client de 15 secondes doit rester aligné avec le throttle serveur
  de `refreshPublication()`.
- Relecture PR : surveiller surtout la gestion du temporisateur, les annonces
  accessibles, la conservation de l’idempotence et l’absence de faux progrès.
- Une extraction future de `adminJs` vers des modules testables peut être un
  chantier séparé ; elle n’est pas nécessaire pour livrer ce parcours.

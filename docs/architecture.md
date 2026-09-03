# Architecture

## Vue d’ensemble

OOBLIK Digest sépare strictement la lecture publique, l’administration privée
et la capture depuis Chrome.

```text
Extension Chrome
      │ HTTPS, session propriétaire
      ▼
admin-service ── SQLite privée
      │
      │ commit atomique via GitHub App
      ▼
branche main ── GitHub Actions ── branche production
                                      │
                                      │ relève CloudPanel
                                      ▼
                              digest.ooblik.com
```

## Site public

La construction bilingue passe par `scripts/build-site.mjs` : manifeste public
français, puis adaptation des champs traduits vers `/en/`. La file DeepL et son
historique résident dans SQLite, dans le service Node existant. Les snapshots
de traduction et affiches anglaises suivent le circuit GitHub de publication.
Les contrats de quota, empreintes et reprise sont détaillés dans
[Traductions FR / GB](translations.md).

Le site est construit avec Hugo et PaperMod. Le catalogue éditorial réside
dans `data/links.json`; la taxonomie et ses descriptions résident dans
`data/categories.json`; les éditions sont décrites dans
`content/archives/YYYY-MM-DD.md`. Les catégories puis les titres sont triés
alphabétiquement. Une catégorie configurée reste disponible dans le registre
public même lorsqu’aucun lien ne l’utilise encore.

`data/tags.json` constitue le registre des tags éditoriaux. Il porte leur nom
canonique, leur description, leurs alias et conserve les définitions archivées
avec `active: false` afin de réserver leurs anciennes routes ; seule sa partie
active, volontairement courte, est proposée à la saisie. Les pages sous
`content/tags/` forment un registre historique plus large : elles conservent
les anciennes routes même lorsqu’un tag n’est plus proposé à la saisie.
L’administration canonicalise les variantes connues vers le registre actif,
refuse les mots-clés libres propres à un lien et autorise un lien sans tag. Un
nouveau libellé peut toutefois être promu explicitement en tag actif depuis
l’extension authentifiée : le service écrit alors sa définition et sa route
avant de l’associer au brouillon. Une publication
revalide les brouillons juste avant le commit afin qu’un ancien alias ne puisse
plus faire échouer le build après coup. Les imports placent en revue toute
taxonomie inconnue. Côté public, la modale reçoit directement les routes Hugo
enregistrées ; le contrôle de cohérence bloque tout tag public sans destination.

La branche `main` contient les sources. GitHub Actions valide les données et
construit le site, puis force la branche `production` sur la sortie statique.
CloudPanel relève cette branche, crée une release locale et bascule un lien
symbolique `current`. Les cinq dernières releases sont conservées.

## Mémoire éditoriale

Une ressource publique disparue n’est pas supprimée uniquement parce qu’elle
ne répond plus. Elle conserve son URL d’origine, reçoit `status: "dead"`, une
note lisible et le tag `lien-mort`. Une capture Wayback peut servir de
destination de consultation.

Cette conservation ne s’applique jamais à une URL privée, locale,
authentifiée ou contenant des informations sensibles.

## Import ponctuel du Blog OOBLIK

L’ancien blog est repris à partir d’un export WordPress WXR conservé hors Git,
dans `import/wordpress/`. La commande `npm --prefix admin-service run
import:wordpress -- --input <export.xml>` produit d’abord `report.json` et
`ready.json` sans toucher au catalogue. Elle n’écrit dans `data/links.json` et
`static/media/blog-ooblik/` qu’avec `--apply`.

Chaque billet publié doit posséder une source externe publique non ambiguë. Les
exceptions restent dans le rapport et peuvent être résolues dans un petit
`overrides.json` indexé par identifiant WordPress. Les images du seul domaine du
blog sont copiées avant son arrêt, débarrassées de leurs métadonnées et
converties en WebP 960 × 540. L’opération est idempotente : une destination déjà
présente dans le Digest gagne toujours.

Ces références appartiennent à une collection historique et non aux éditions
quotidiennes du Digest : le contrôle de cohérence valide leur date originale,
mais ne fabrique pas de page `content/archives/YYYY-MM-DD.md` pour elles.
Elles restent identifiables dans le flux `blog-ooblik`, mais les billets issus
du WXR et munis d’une provenance `origin_url` rejoignent aussi le filtre
principal `Tout`. Les catégories WordPress `Photo`, `Photographes`,
`Argentique`, `Camera Porn` et `Exposition` sont explicitement converties en
catégorie Digest `Photographie`; `Livre / Book` rejoint `Design & Création`.
Une catégorie photographique est prioritaire sur le format livre. Les
taxonomies sans correspondance restent dans `Archives du blog OOBLIK`.

Pour les billets sans bloc « Source », la commande `npm --prefix
admin-service run recover:wordpress -- --input <export.xml>` analyse les liens
externes encore présents dans le contenu. Elle sépare les destinations uniques,
les cas ambigus et les billets sans aucune piste, puis produit
`recovery-report.json` et une revue locale autonome `recovery-review.html`.
Cette page mémorise les décisions dans le navigateur et exporte un
`overrides.json` compatible avec l’importeur. Elle ne publie et ne modifie
aucune donnée du Digest.

La recherche web complémentaire ne peut qualifier une proposition de
`confiance haute` que si le score lexical est accompagné d’un indice d’identité
fort : au moins trois termes distinctifs concordants ou un nom reconnaissable
dans le domaine. Les titres génériques restent en revue même si leur premier
résultat de recherche reprend exactement les mêmes mots.

Le texte intégral nettoyé de chaque billet WXR est conservé dans le champ
facultatif `archive_text`, y compris lors de la mise à jour d’un billet déjà
importé. Le résumé de carte reste limité à 300 caractères ; le texte complet
est affiché séparément dans la modale. Les billets réellement dépourvus de
destination externe peuvent être archivés sous leur permalink WordPress avec
`recover:wordpress -- --archive-unresolved`. Le billet WordPress d’exemple
reste exclu.

La même commande produit `validation-review.html` pour tous les billets encore
bloqués. Cette seconde revue présente les destinations détectées, les
redirections inter-domaines et les sources ambiguës. Elle permet de choisir une
piste, de saisir une URL, d’archiver le billet sous son permalink ou de
l’ignorer. Son export fusionne les nouvelles décisions avec les overrides déjà
acquis afin de ne jamais perdre une passe précédente.

Après l’archivage, `recover:wordpress -- --restore-detected-sources` réexamine
uniquement les fiches qui pointent encore vers leur permalink WordPress. Une
source explicite unique est restaurée ; un lien ordinaire ne l’est que si son
libellé, son URL et le titre apportent une identité suffisamment forte. Les
destinations déjà occupées restent des doublons signalés et les cas incertains
ne sont jamais modifiés automatiquement. La commande produit aussi
`source-gap-review.html`, limité aux archives qui possèdent encore au moins une
piste externe : les billets réellement sans lien n’encombrent plus la revue.

Lorsque le billet WordPress lui-même devient l’objet archivé, les ambiguïtés de
destination externe ne sont plus bloquantes. L’option
`--archive-all-remaining` conserve alors chaque billet restant sous son
permalink, y compris ceux dont la destination externe existe déjà dans le
Digest. Seul le billet WordPress automatique « Bonjour tout le monde » est
ignoré.

Une passe locale distincte peut ensuite rechercher les destinations actuelles
des billets archivés sous leur propre permalink. La commande
`recover:wordpress-destinations` interroge Brave Search avec une clé conservée
dans `import/wordpress/.env`, exclut les domaines OOBLIK et toutes les URL non
publiques, normalise les paramètres de suivi, signale les résultats déjà
présents dans le catalogue et met ses réponses en cache. Elle ne modifie jamais
le Digest directement : une page HTML autonome présente jusqu’à cinq candidats
classés par correspondance de titre, d’auteur et de sujet, puis exporte les
seules décisions humaines dans `overrides.json`. Une nouvelle exécution reprend
le cache et reste ainsi idempotente et économe en requêtes.

Quand l’hébergeur bloque les téléchargements automatisés, la copie FTP locale
`import-blog/uploads` est détectée automatiquement ; `--media-root
<wp-content/uploads>` permet d’en choisir une autre. L’importeur fait
correspondre les URL du WXR à cette arborescence.
La résolution refuse tout chemin sortant de ce répertoire et conserve le même
traitement WebP déterministe. Les 2,7 Go de sources FTP restent ignorés par Git :
seuls les médias réellement associés aux cartes sont recadrés, compressés avec
l’effort WebP maximal et copiés dans le site.

La passe patrimoniale utilise `--local-only` avec un `--media-root` explicite.
Ce mode exige une arborescence locale lisible et interdit tout téléchargement,
y compris lorsqu’un fichier manque. Les URL absolues, relatives au protocole ou
à la racine sont résolues depuis l’origine WXR, puis limitées au domaine exact
du blog et à `/wp-content/uploads/` ; `www` reste donc une identité distincte.

Chaque preview écrit dans `import/wordpress/` un `report.json` déterministe et
une planche autonome `image-review.html`. Le rapport distingue les images mises
en avant, les premières images de contenu, les exclusions externes, les absences
volontaires, les fichiers locaux manquants, les échecs de conversion et les
faibles résolutions, avec dimensions et chemins de provenance. La planche charge
les WebP du cache local, montre leur recadrage 16:9 et permet une revue par année
et par statut avant `--apply`. Ces artefacts restent ignorés par Git.

Après application, `scripts/check_digest_consistency.py` impose qu’un visuel du
catalogue soit un WebP sûr sous `/media/blog-ooblik/`, présent dans `static`, et
référencé exactement une fois. Il refuse aussi les `image_alt` sans image et les
WebP publiés orphelins. Une seconde application doit laisser catalogue et médias
strictement identiques.

## Administration propriétaire

`admin-service/` est un service Node.js séparé du site statique :

- authentification GitHub avec Better Auth ;
- autorisation limitée à l’identité GitHub propriétaire ;
- lecture et modification contrôlée du catalogue ;
- création, renommage, description et suppression contrôlée des catégories ;
- SQLite privée pour les brouillons et le suivi des publications ;
- GitHub App limitée aux contenus du dépôt et à la lecture des Actions ;
- sauvegardes avant migration et sauvegardes tournantes.

La publication LinkedIn d’un lien demande également à ce service une capture
Chromium isolée. Seule l’URL du catalogue peut être capturée ; la résolution
DNS est épinglée par un proxy local pendant toute la navigation et chaque
sous-ressource est refusée dès qu’elle vise un réseau privé. Les tunnels sont
fermés avec leur client et leur tampon d’attente est borné. Le
PNG 1200 × 1200 transformé est mis en cache dans le répertoire partagé du
service, puis exposé par un chemin public strict nécessaire au téléversement
LinkedIn. Une composition typographique déterministe prend le relais quand le
site bloque la capture. Les affiches d’édition possèdent elles aussi une
variante LinkedIn carrée distincte de leur image Open Graph 1200 × 627.

L’asset est enregistré en upload synchrone : le service attend la fin du
traitement de l’image avant de demander la création du post. SQLite conserve
chaque URN dans un historique append-only. Une première soumission retrouve la
publication la plus récente et bloque le doublon involontaire ; l’action
propriétaire explicite « Republier sur LinkedIn » réserve la même URL puis crée
une nouvelle occurrence sans effacer les précédentes. Le verrou de réservation
reste unique par URL afin d’empêcher deux envois concurrents.
À l’ouverture du compositeur, le navigateur interroge cet historique central :
le mode republication et le compteur restent donc corrects d’un poste à
l’autre, sans dépendre d’un état conservé localement.

Un lien publié peut être corrigé sans perdre son identifiant, son URL, sa date
ou son historique. Un retrait public modifie sa visibilité sans effacer la
ressource.

## Extension Chrome et Firefox

`browser-extension/` contient une même extension construite avec WXT,
TypeScript et une interface HTML/CSS sans framework. Chrome reçoit un manifeste
V3 et Firefox un manifeste V2 ciblant Firefox 142 ou plus récent.

Une action explicite sur l’icône ou le raccourci autorise la lecture ponctuelle
de la page active. L’extension extrait l’URL, le titre, l’adresse canonique, la
meta description et, si elle existe, la sélection de texte. La sélection et
la note restent privées.

L’extension ne possède aucun jeton GitHub. Elle communique uniquement avec
`https://digest.ooblik.com/*`, et le serveur n’accepte que les origines exactes
configurées. Chrome possède l’origine publiée stable
`chrome-extension://nlejcccmpbajpoaknlecegkpgdegiflf`. Firefox attribue une
origine interne `moz-extension://<UUID>` différente à chaque profil : chaque
profil propriétaire est donc explicitement inscrit dans
`FIREFOX_EXTENSION_ORIGINS`. Aucun joker d’origine n’est accepté.

La fiche Chrome Web Store et la distribution Firefox Add-ons sont non listées.
Le manifeste Firefox déclare l’identifiant `curation@digest.ooblik.com`, la
version minimale 142 et la transmission requise de l’URL et du contenu choisi
par l’utilisateur.

Le popup présente d’abord les tags suggérés à partir du contenu de la page,
puis une recherche dans le registre actif. Une saisie sans correspondance peut
devenir un nouveau tag après confirmation explicite. Le menu `Tags` de
l’administration gère ensuite noms, descriptions, alias, fusions, archivages et
réactivations ; les définitions archivées ne sont jamais réactivées depuis
l’extension.

## Publication d’un Digest ou d’un Focus

1. Les captures sont conservées comme brouillons SQLite.
2. L’administration sélectionne explicitement un lot.
3. Le serveur vérifie les champs obligatoires, la taxonomie, les doublons, les
   URL et l’unicité de la date.
4. Il génère le catalogue et l’archive dans un seul commit idempotent.
5. Il suit l’unique workflow `Deploy production` pour le SHA produit.
6. Il vérifie enfin la présence du titre et de la date sur le site public avant
   d’annoncer l’état « En ligne ».

L’interface traduit ces états persistés en quatre étapes : préparation,
validation, déploiement et mise en ligne. Elle ne calcule pas de pourcentage
artificiel. Le suivi reprend à l’ouverture de l’administration, au retour sur
l’onglet et après une erreur réseau transitoire ; un seul polling actif interroge
le serveur toutes les 15 secondes. Le lien public n’apparaît qu’après le contrôle
de présence de l’archive.

Une date existante est refusée avec `409 EDITION_EXISTS`. Un brouillon
incomplet peut être enregistré, mais jamais publié.

Le front matter peut déclarer `editorial_type: "focus"`. L’administration
propose ce format à la création comme à la correction. Les gabarits ajoutent
alors le préfixe `FOCUS -` sans le dupliquer dans le titre éditorial, et le
générateur social compose une famille distincte à partir d’archives techniques
NASA préparées localement. Sans ce champ, l’édition reste un Digest classique.

Une édition existante possède aussi un cycle de vie administrable. Son état
est cohérent seulement si `draft: true` correspond à zéro lien public dans
`data/links.json`. La remise en brouillon masque les liens encore visibles avec
`visibility_reason: "edition-draft"`; une publication ne restaure que ces liens
préparés et laisse les retraits éditoriaux, anciens ou explicitement marqués
`editorial`, hors ligne. L’archive, le catalogue et les deux affiches sociales
sont écrits dans un même commit. Les deux transitions utilisent le suivi
persisté des publications et peuvent reprendre une réponse GitHub ambiguë.

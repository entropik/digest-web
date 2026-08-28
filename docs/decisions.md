# Décisions structurantes

Ce registre synthétise les choix durables. Les détails chronologiques et les
commits figurent dans le [journal](journal/README.md).

## 24 juillet 2026

### Hugo reste le système public

Le Digest est une archive de lecture : un site statique rend sa consultation
rapide, portable et indépendante d’un service applicatif permanent.

### Le catalogue et les éditions sont versionnés

`data/links.json` forme le catalogue principal et chaque date possède une page
`content/archives/YYYY-MM-DD.md`. Git apporte la traçabilité éditoriale et
permet de reconstruire le site.

### Le déploiement ne donne aucun accès serveur à GitHub

GitHub Actions publie uniquement la branche statique `production`. CloudPanel
la relève par scrutation et bascule des releases locales atomiques. Aucun
secret de connexion au serveur n’est stocké dans GitHub.

### Les liens morts sont conservés pour mémoire

Une disparition publique devient un état documenté, pas une suppression. Les
destinations privées ou sensibles restent exclues sans exception.

## 25 et 26 juillet 2026

### La restauration historique est progressive

Les anciennes éditions Pinboard sont importées par lots vérifiables. Les
éditions vides ou artificielles ne sont pas conservées.

### Les favoris restent locaux

Les favoris utilisent `localStorage`, sans compte utilisateur ni synchronisation
serveur. Ce choix respecte la nature personnelle du site et évite une nouvelle
collecte de données.

### Les ressources frontales personnalisées sont versionnées

Les scripts qui évoluent fréquemment utilisent des URL versionnées afin
d’éviter les incohérences dues aux caches du navigateur ou du CDN.

## 27 juillet 2026

### L’administration est strictement propriétaire

L’accès dépend de la session GitHub et d’un identifiant propriétaire immuable.
L’administration permet de masquer ou corriger sans détruire l’historique.

### L’extension ne parle jamais directement à GitHub

Le seul backend de curation est `admin-service`. L’extension ne contient donc
ni jeton GitHub ni secret applicatif.

### La capture est toujours déclenchée par l’utilisateur

L’extension lit uniquement l’onglet actif après un clic ou un raccourci. Elle
ne surveille pas la navigation en arrière-plan et ne demande pas
`<all_urls>`.

### La taxonomie est fermée

Les catégories et tags proposés à la capture proviennent du catalogue
existant. La publication exige un titre, une catégorie, un résumé et au moins
un tag.

### Un lot produit une édition et un commit

La publication d’un Digest met à jour le catalogue et l’archive dans un commit
atomique. Une date correspond à une édition unique. L’opération est
idempotente et peut être reprise après une interruption.

### Le déploiement est confirmé de bout en bout

La réussite du commit ne suffit pas : l’administration suit le workflow
`Deploy production`, qui valide et construit une seule fois le commit, puis
vérifie le résultat servi par le site.

### La note et la sélection restent privées

Le texte sélectionné et la note éditoriale ne doivent apparaître ni dans un
commit, ni dans les journaux applicatifs, ni dans les messages d’erreur.

### Le Chrome Web Store fournit l’identité et les mises à jour

La diffusion est non répertoriée. L’examen Google reste obligatoire, mais
apporte une extension signée, un identifiant stable et les mises à jour
automatiques. Le backend reste inutilisable sans l’identité GitHub
propriétaire.

## 16 août 2026

### La progression de publication reflète des états réels

L’administration expose préparation, validation, déploiement et mise en ligne,
sans fabriquer de pourcentage. Une publication interrompue peut reprendre son
suivi après un rechargement, un retour dans l’onglet ou une erreur réseau.

### Une seule construction Hugo devient l’artefact déployé

Le workflow de production valide les sources, construit Hugo une fois puis
publie exactement cette sortie sur la branche `production`. La validation d’un
commit et son déploiement ne reposent ainsi plus sur deux constructions
indépendantes.

### Les images sociales font partie de l’identité éditoriale

Chaque édition reçoit un PNG déterministe de 1200 × 627, produit depuis son
contenu et versionné avec le site. La grille, la typographie et un nombre réduit
d’encres assurent la variété sans perdre la signature OOBLIK.

### LinkedIn est publié par une intégration propriétaire

Le partage natif passe par l’API LinkedIn et reste réservé à l’administration.
Les identifiants de l’application peuvent être configurés dans cette interface,
mais sont chiffrés dans SQLite et ne sont jamais renvoyés au navigateur. Le
jeton membre suit la même règle de confidentialité.

### Le texte social reste éditable avant l’envoi

Le titre, le résumé, le lien et les hashtags fournissent un point de départ,
pas un texte imposé. Le propriétaire peut corriger la composition avant une
publication native avec image.

## 17 août 2026

### Un lien individuel possède sa propre image sociale

Pour partager une ressource précise, le service capture son premier écran,
l’intègre dans un carré 1200 × 1200, l’uniformise en noir et blanc et ajoute
l’habillage éditorial OOBLIK. Si le
site refuse la capture, une carte typographique propre au lien remplace la page
plutôt que de réutiliser l’affiche générique de l’édition.

### Une capture distante ne fait confiance ni au DNS ni aux sous-ressources

La destination et chaque ressource chargée doivent rester publiques. La
résolution DNS est épinglée pendant la navigation afin d’empêcher un rebinding
vers le réseau privé. Le proxy limite les données en attente et ferme les
tunnels dès que le navigateur abandonne la connexion.

### Les corrections éditoriales restent non destructives

Les actions d’administration permettent de modifier, masquer ou restaurer un
lien en conservant son identifiant et son histoire. Les favoris et les filtres
publics restent purement locaux au navigateur.

## 18 août 2026

### LinkedIn reçoit un carré distinct de l’image Open Graph

L’image Open Graph des éditions reste en 1200 × 627 pour les aperçus de liens.
La publication native LinkedIn utilise une variante 1200 × 1200, comme les
captures des liens individuels. Le carré remplit le fil ; les éventuelles
bandes gris sombre de la visionneuse agrandie appartiennent à LinkedIn et ne
doivent pas être compensées dans le fichier source.

### La création du post attend le traitement de l’image

L’API LinkedIn peut accepter un post avant que son image asynchrone soit prête,
puis rendre ce post invisible. Le Digest demande donc un upload synchrone et
ne soumet le post qu’après son succès.

### Une ressource LinkedIn peut avoir plusieurs occurrences de publication

La déduplication par URL reste la règle pour une soumission ordinaire, mais
« publié » n’est plus un état terminal. L’action explicite « Republier sur
LinkedIn » rouvre le compositeur et crée un nouveau post. Chaque URN, date et
compte propriétaire reste conservé dans SQLite ; aucune occurrence précédente
n’est supprimée. Les réservations par URL continuent de bloquer les envois
concurrents et les résultats distants ambigus.

## 20 août 2026

### Les thèmes actifs sont séparés des tags historiques

Les 937 tags accumulés ne constituent plus le vocabulaire de saisie. Un registre
court dans `data/tags.json` définit les thèmes actifs et leurs alias, tandis que
`content/tags/` conserve les routes historiques. Les thèmes deviennent
facultatifs et limités à trois par lien. Une fusion migre les liens vers le nom
canonique sans supprimer l’ancienne adresse publique ; l’archivage retire
seulement le thème des suggestions et garde sa définition inactive pour empêcher
la réutilisation accidentelle d’une ancienne route.

### L’extension peut promouvoir explicitement un nouveau tag

La taxonomie reste fermée au niveau de chaque lien : un brouillon ne conserve
jamais un mot-clé libre inconnu. Lorsque le registre ne contient pas le libellé
recherché, l’extension peut en revanche proposer `Créer le tag`, expliquer que
le registre public sera modifié, puis demander une confirmation. Le service
crée la définition canonique et sa route avant de sélectionner le tag. Les
alias actifs sont canonicalisés, les définitions archivées restent réservées et
les nouvelles entrées sans description sont signalées dans l’administration.

Le vocabulaire visible redevient `Tags`, cohérent avec les routes publiques et
le catalogue. Le nom interne `theme` peut subsister dans le code pour éviter une
migration sans valeur produit.

### La taxonomie devient une donnée éditoriale administrable

Les grandes catégories ne sont plus implicites dans les seuls liens publiés.
`data/categories.json` conserve leur nom et leur description, tandis que
l’administration permet de les créer, modifier et supprimer avec les garde-fous
nécessaires. Une catégorie vide reste visible : elle existe comme intention
éditoriale avant de recevoir son premier lien.

### L’interface suit une rigueur suisse et des cartouches d’architecte

La navigation des catégories abandonne les pilules arrondies pour un registre
typographique rectangulaire, numéroté et construit par filets. Cette direction
cherche la densité, la lisibilité et une hiérarchie explicite plutôt qu’un
habillage décoratif. Le rouge reste une encre d’accent, pas un remplissage
systématique. La pagination reprend le même vocabulaire sous la forme d’un
cartouche à trois cellules autour d’un folio compact.

### La description s’ouvre comme le volet d’un plan

La sélection d’une catégorie produit une transition spatiale : son cartouche
reste seul à gauche et une fiche descriptive apparaît à droite. Les deux zones
s’empilent sur mobile. Le retour à l’index restaure toutes les catégories et le
focus clavier ; les animations respectent la préférence de mouvement réduit.
Le détail de ces conventions se trouve dans le
[guide d’interface](interface.md).

### Le Blog OOBLIK est importé comme une archive, pas comme une copie

Le WXR WordPress fournit la date, le titre, le texte et les taxonomies, mais le
Digest ne recrée pas le blog complet. Chaque publication devient une fiche de
lien : son texte est conservé comme archive, son permalink reste la provenance
et une destination externe distincte est utilisée lorsqu’elle peut être
établie. L’import est ponctuel, local, idempotent et précédé d’un rapport ; il
ne justifie pas une interface permanente dans l’administration.

### Une destination incertaine reste une décision éditoriale

Un lien explicite unique ou une identité fortement concordante peut être
restauré automatiquement. Une redirection inter-domaine, plusieurs candidats,
un homonyme ou un domaine repris restent en revue. Une URL disparue n’est pas
supprimée : elle est marquée morte, documentée et reliée à Wayback lorsque
l’archive existe. Les pages HTML de revue restent locales et hors Git.

### La provenance reste secondaire dans l’action

« Visiter le site » ouvre la destination de consultation. « Billet d’origine »
sert uniquement à retrouver le contexte WordPress et apparaît sous un filet,
comme métadonnée discrète. Cette hiérarchie empêche le permalink historique de
ressembler à l’action principale ou de remplacer par erreur une destination
encore vivante.

## 28 août 2026

### Une édition possède un cycle de vie réversible

Une correction de titre, d’introduction ou de description ne change jamais
implicitement l’état d’une édition. La publication et la remise en brouillon
sont deux actions distinctes, confirmées et suivies jusqu’au déploiement.

### Le motif de masquage protège les retraits éditoriaux

Un lien masqué par une remise en brouillon reçoit
`visibility_reason: "edition-draft"`. Seuls ces liens sont restaurés lors de la
publication suivante ; un retrait `editorial` ou historique sans motif reste
masqué. Cette distinction rend la transition réversible sans annuler une
décision éditoriale indépendante.

### Le front matter et le catalogue forment un invariant

`draft: true` exige qu’aucun lien de l’édition ne soit public, et une édition
publiée exige au moins un lien visible. Le contrôle de cohérence bloque les
divergences, tandis que l’administration les signale explicitement au lieu de
proposer une transition risquée.

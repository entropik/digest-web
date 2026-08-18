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

### Un post inaccessible peut être republié sans banaliser les doublons

La déduplication par URL reste la règle. Lorsqu’un ancien URN mémorisé mène à
un post inaccessible, l’interface le signale et propose une action de
récupération explicite. Le clic sur ce libellé sans ambiguïté suffit : aucune
seconde boîte de confirmation ne s’interpose.

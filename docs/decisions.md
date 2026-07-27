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

La réussite du commit ne suffit pas : l’administration suit les deux workflows
GitHub Actions puis vérifie le résultat servi par le site.

### La note et la sélection restent privées

Le texte sélectionné et la note éditoriale ne doivent apparaître ni dans un
commit, ni dans les journaux applicatifs, ni dans les messages d’erreur.

### Le Chrome Web Store fournit l’identité et les mises à jour

La diffusion est non répertoriée. L’examen Google reste obligatoire, mais
apporte une extension signée, un identifiant stable et les mises à jour
automatiques. Le backend reste inutilisable sans l’identité GitHub
propriétaire.

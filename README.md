# OOBLIK DIGEST

Une collection personnelle de ressources sur l’intelligence artificielle, le
développement, le design, l’édition et l’image.

Le site est construit avec [Hugo](https://gohugo.io/) et le thème
[PaperMod](https://github.com/adityatelange/hugo-PaperMod).

## Documentation du projet

La documentation durable se trouve dans [`docs/`](docs/README.md). Elle
comprend l’architecture, les décisions structurantes et un
[journal chronologique](docs/journal/README.md) avec un billet pour chaque
journée active du projet.

## Développement

Initialiser le thème après un nouveau clonage :

```shell
git submodule update --init --recursive
```

Lancer le serveur local :

```shell
hugo server
```

Le site est alors disponible sur <http://localhost:1313/>.

## Liens morts et mémoire du web

L’adresse publique d’origine reste stockée dans `url`. Pour chaque entrée
marquée `status: "dead"`, résoudre sa destination Wayback avant validation :

```shell
node scripts/resolve_wayback_links.mjs
```

Le script cherche d’abord la dernière capture réussie de l’URL exacte, puis la
dernière capture de la racine du même site. Il mémorise aussi l’absence de
capture afin que les exécutions suivantes ne sollicitent que les nouveaux liens
morts. Utiliser `--refresh` pour revérifier l’ensemble du catalogue. La CI
refuse une nouvelle entrée morte qui n’a pas encore été vérifiée.

## Build de production

```shell
hugo --gc --minify
```

Les fichiers statiques sont générés dans `public/`. L’URL canonique de
production est <https://digest.ooblik.com/>.

## Déploiement

La branche `main` est validée par GitHub Actions. Le workflow `Deploy
production` construit Hugo et publie le résultat sur la branche
`production`. Un cron exécuté par l’utilisateur CloudPanel du site transforme
chaque révision de cette branche en release locale.

Le serveur conserve les cinq dernières releases et le lien symbolique
`current` permet une bascule ou un retour arrière atomique.

Le dépôt public permet à CloudPanel de récupérer la branche sans clé ni
identifiant de serveur stocké dans GitHub.

## Administration propriétaire

Le site Hugo reste statique. Un service Node séparé, dans `admin-service/`,
fournit Better Auth, la page non référencée `/admin` et les actions de retrait
ou de restauration. Un retrait ajoute `visibility: "hidden"` et `hidden_at` à
l’entrée : la ressource reste dans l’historique éditorial et Git, mais toutes
les vues publiques l’excluent.

### GitHub App

Créer une GitHub App privée avec :

- URL de callback :
  `https://digest.ooblik.com/api/auth/callback/github` ;
- permission de compte `Email addresses: Read-only` ;
- permission du dépôt `Contents: Read and write` ;
- permission du dépôt `Actions: Read-only`, utilisée pour suivre la validation
  et le déploiement du commit ;
- installation limitée au dépôt `entropik/digest-web` ;
- aucun webhook.

Copier `admin-service/.env.example` vers
`/home/digest/apps/digest-admin/shared/.env` et renseigner les secrets. La clé
privée PEM de la GitHub App est stockée sous forme Base64 dans
`GITHUB_APP_PRIVATE_KEY_BASE64`. L’autorisation serveur vérifie l’identifiant
GitHub immuable `1025402`, et non seulement le nom `entropik`.

Après avoir ajouté la permission `Actions: Read-only` à une GitHub App déjà
installée, accepter la nouvelle permission dans les paramètres d’installation
GitHub avant de redéployer le service.

#### Lectures GitHub et cache

Une lecture froide du catalogue commence toujours par la référence fraîche de
`main`. Avant l’optimisation, le service attendait ensuite successivement le
commit, puis `data/links.json`, soit trois allers-retours GitHub sur le chemin
critique (`ref → commit → contenu`).

Pour un SHA inconnu, le commit et le catalogue sont maintenant lus en parallèle
après le `ref` (`ref → [commit + contenu]`). Le dernier snapshot est conservé
par SHA : comme un commit Git est immuable, une nouvelle lecture fraîche du
`ref` qui renvoie le même SHA peut réutiliser ce snapshot sans requête
conditionnelle. `ETag`/`If-None-Match` n’apporterait alors qu’un aller-retour
`304` supplémentaire.

Le cache de 30 secondes reste réservé aux lectures du popup. Les mutations
résolvent toujours le `ref` courant avant de travailler, conservent les
protections de concurrence GitHub, et toute écriture réussie par le service
invalide à la fois le cache temporaire et le snapshot indexé par SHA.

### CloudPanel

Le service doit utiliser Node.js 22 ou supérieur et PM2. Le script
`scripts/deploy-admin-cloudpanel.sh` conserve cinq releases, garde SQLite et
les secrets dans `shared/`, exécute les migrations Better Auth puis redémarre
le processus sans interrompre le site Hugo.

Ajouter au vhost les routes fournies dans
`deploy/cloudpanel-digest-admin.nginx.conf`, puis exécuter le déploiement
administratif depuis un cron distinct du déploiement Hugo. Exemple :

```cron
* * * * * /bin/sh /home/digest/bin/deploy-admin-cloudpanel.sh >> /home/digest/logs/digest-admin-deploy.log 2>&1
```

Copier ce script dans `/home/digest/bin/` avant d’activer le cron, car la
branche `production` ne contient que la sortie Hugo. Une fois connecté sur
`/admin`, les commandes propriétaire apparaissent automatiquement dans les
fiches du Digest.

### Curation et extension Chrome

Le service conserve les captures dans SQLite jusqu’à la composition explicite
d’un Digest. La publication sélectionne un lot, crée sa page d’archive et met à
jour `data/links.json` dans un seul commit. L’administration suit ensuite les
workflows GitHub Actions et vérifie la présence de l’édition en production.

L’extension Manifest V3 se trouve dans `browser-extension/` :

```shell
cd browser-extension
npm ci
npm test
npm run build
npm run zip
```

Pour le développement, charger `.output/chrome-mv3` comme extension non
empaquetée. L’origine Chrome Web Store de production est
`chrome-extension://nlejcccmpbajpoaknlecegkpgdegiflf` ; l’ajouter à
`CHROME_EXTENSION_ORIGINS` dans le fichier `.env` du service. La procédure
Chrome Web Store et les textes de fiche sont documentés dans
`browser-extension/CHROME_WEB_STORE.md`.

Les brouillons utilisent le même fichier SQLite que Better Auth. Le script de
déploiement crée une sauvegarde avant toute migration et en conserve quatorze.
Pour une sauvegarde quotidienne supplémentaire :

```cron
17 3 * * * cd /home/digest/apps/digest-admin/current && npm run backup >> /home/digest/logs/digest-admin-backup.log 2>&1
```

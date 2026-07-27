# OOBLIK DIGEST

Une collection personnelle de ressources sur l’intelligence artificielle, le
développement, le design, l’édition et l’image.

Le site est construit avec [Hugo](https://gohugo.io/) et le thème
[PaperMod](https://github.com/adityatelange/hugo-PaperMod).

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
- installation limitée au dépôt `entropik/digest-web` ;
- aucun webhook.

Copier `admin-service/.env.example` vers
`/home/digest/apps/digest-admin/shared/.env` et renseigner les secrets. La clé
privée PEM de la GitHub App est stockée sous forme Base64 dans
`GITHUB_APP_PRIVATE_KEY_BASE64`. L’autorisation serveur vérifie l’identifiant
GitHub immuable `1025402`, et non seulement le nom `entropik`.

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

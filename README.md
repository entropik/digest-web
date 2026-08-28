# OOBLIK DIGEST

Une collection personnelle de ressources sur l’intelligence artificielle, le
développement, le design, l’édition et l’image.

Le site est construit avec [Hugo](https://gohugo.io/) et le thème
[PaperMod](https://github.com/adityatelange/hugo-PaperMod).

## Documentation du projet

La documentation durable se trouve dans [`docs/`](docs/README.md). Elle
comprend l’architecture, les principes d’interface, les décisions structurantes
et un [journal chronologique](docs/journal/README.md) avec un billet pour
chaque journée active du projet.

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
node scripts/verify.mjs
```

Cette commande multiplateforme installe les dépendances verrouillées, exécute
les tests et builds du service et de l’extension, valide les données, construit
Hugo sans avertissement et refuse les URL de développement. C’est exactement la
même commande qu’en CI et avant chaque déploiement. Elle nécessite Node.js 22,
Python 3 et Hugo Extended 0.164.0 ou plus récent.

Les fichiers statiques validés sont générés dans `public/`. L’URL canonique de
production est <https://digest.ooblik.com/>.

## Déploiement

Les pull requests sont validées par GitHub Actions. Sur `main`, le workflow
`Deploy production` valide le commit, construit Hugo une seule fois et publie
ce même résultat sur la branche `production`. Un cron exécuté par l’utilisateur
CloudPanel du site transforme chaque révision de cette branche en release
locale.

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

### Publication LinkedIn native

Le bouton des pages d’archive publie un post LinkedIn natif avec le texte, le
permalien et le PNG carré 1200 × 1200 dédié à LinkedIn. Il ne repose pas sur la
miniature d’un partage de lien.

Le carré remplit la largeur du fil LinkedIn. Dans la visionneuse agrandie de
bureau, LinkedIn le centre parfois dans une colonne plus haute que large : les
bandes gris sombre visibles au-dessus et au-dessous appartiennent à cette
interface et ne sont pas intégrées au PNG.

Créer une application dans le portail LinkedIn Developers, puis activer les
produits **Sign In with LinkedIn using OpenID Connect** et
**Share on LinkedIn**. Déclarer exactement cette URL de redirection :

`https://digest.ooblik.com/api/admin/linkedin/callback`

Le propriétaire peut saisir le Client ID et le Client Secret directement dans
l’onglet **LinkedIn** de `/admin`. Ils sont chiffrés dans SQLite et le secret
n’est jamais renvoyé au navigateur. Les variables `LINKEDIN_CLIENT_ID` et
`LINKEDIN_CLIENT_SECRET` dans `/home/digest/apps/digest-admin/shared/.env`
restent disponibles comme configuration de secours, sans les enregistrer dans
Git.
Le premier clic sur « Publier sur LinkedIn » demande l’autorisation des scopes
`openid profile w_member_social`. Le jeton obtenu est chiffré dans SQLite avec
une clé dérivée de `BETTER_AUTH_SECRET` et n’est jamais envoyé au navigateur.

Pour un lien individuel, la modale demande au service une capture du premier
écran du site. Chromium est piloté par Playwright avec un délai strict et les
destinations privées sont bloquées, y compris pour les sous-ressources. La
capture est composée dans un carré 1200 × 1200, passée en noir et blanc, puis habillée avec
le titre, le domaine et l’encre corail OOBLIK. Les PNG sont conservés dans
`LINKEDIN_CAPTURE_DIRECTORY`; « Régénérer l’image » force une nouvelle prise.
Si le site refuse la navigation automatisée, une carte typographique propre à
ce lien remplace la capture — jamais l’affiche générique de son édition.

L’image est enregistrée auprès de LinkedIn avec le mécanisme d’upload
synchrone avant la création du post. Si une ancienne publication mémorisée par
le Digest est pourtant inaccessible sur LinkedIn, l’interface affiche une
action explicite « Republier si le post est inaccessible ». Cette action
autorise un nouvel essai pour la même URL sans désactiver la protection normale
contre les doublons.

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

#### Diagnostic de latence

Le service écrit dans la sortie PM2 une ligne JSON par étape du bootstrap :
`github.cache`, `github.auth`, `github.ref`, `github.commit`,
`github.catalog.download`, `github.catalog.parse`, puis
`curation.bootstrap`. Le champ `request_id`, également renvoyé dans l’en-tête
HTTP `X-Request-Id`, permet de regrouper les lignes d’une même ouverture du
popup. Le cache indique explicitement `hit`, `miss` ou `shared`.
Dans ce dernier cas, `duration_ms` mesure l’attente complète de la lecture
déjà lancée par une autre requête.

Une étape GitHub de 750 ms ou plus, ou un bootstrap total de 1 500 ms ou plus,
passe au niveau `warn`. Pour diagnostiquer un popup lent, filtrer
`pm2 logs digest-admin` sur son `request_id`, puis comparer la durée totale aux
sous-durées : un `miss` suivi d’un `github.ref` lent indique le réseau ou
GitHub, tandis qu’un `github.catalog.parse` lent pointe le traitement local.
Les journaux n’incluent jamais l’URL demandée, le catalogue, les notes privées,
les cookies ou les jetons.

### CloudPanel

Le service doit utiliser Node.js 22 ou supérieur et PM2. Le script
`scripts/deploy-admin-cloudpanel.sh` conserve cinq releases, garde SQLite et
les secrets dans `shared/`, exécute les migrations Better Auth puis redémarre
le processus sans interrompre le site Hugo.

Le même script installe le Chromium Playwright dans
`/home/digest/apps/digest-admin/shared/playwright`. Lors de la première mise en
service des captures, installer une fois les dépendances système indiquées par
`npx playwright install-deps --dry-run chromium`; elles restent communes aux
releases suivantes.

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

Le service conserve les captures dans SQLite jusqu’à leur sélection explicite.
Une seule action publie le lot : le serveur valide automatiquement les données,
crée la page d’archive et met à jour `data/links.json` dans un commit idempotent.
L’administration affiche ensuite une progression reprenable entre préparation,
validation, déploiement et présence effective de l’édition en production.
Le panneau `Éditions` permet aussi de corriger une archive sans perdre son état,
de publier un brouillon ou de remettre une édition en brouillon. Ces transitions
mettent à jour l’archive, le catalogue et les affiches sociales dans un seul
commit, puis utilisent le même suivi reprenable.

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

Le dépôt impose les fins de ligne LF via `.gitattributes`. Après tout changement
entre Windows, WSL ou Linux, supprimer `node_modules` puis relancer `npm ci`
dans chaque projet Node afin de réinstaller les binaires natifs pour la
plateforme active. Ne jamais partager ce répertoire entre deux systèmes.

Les brouillons utilisent le même fichier SQLite que Better Auth. Le script de
déploiement crée une sauvegarde avant toute migration et en conserve quatorze.
Pour une sauvegarde quotidienne supplémentaire :

```cron
17 3 * * * cd /home/digest/apps/digest-admin/current && npm run backup >> /home/digest/logs/digest-admin-backup.log 2>&1
```

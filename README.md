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

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
production` construit Hugo puis transfère une release versionnée vers
CloudPanel avec l’utilisateur SSH propre au site.

Le serveur conserve les cinq dernières releases et le lien symbolique
`current` permet une bascule ou un retour arrière atomique.

Les paramètres sensibles sont stockés dans l’environnement GitHub
`production`, jamais dans le dépôt.

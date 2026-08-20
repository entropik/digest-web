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

Le site est construit avec Hugo et PaperMod. Le catalogue éditorial réside
dans `data/links.json`; la taxonomie et ses descriptions résident dans
`data/categories.json`; les éditions sont décrites dans
`content/archives/YYYY-MM-DD.md`. Les catégories puis les titres sont triés
alphabétiquement. Une catégorie configurée reste disponible dans le registre
public même lorsqu’aucun lien ne l’utilise encore.

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
l’URN retournée pour empêcher les doublons. Une republication de récupération
peut supprimer cette association uniquement après une action propriétaire
explicite signalant que le post correspondant est inaccessible.

Un lien publié peut être corrigé sans perdre son identifiant, son URL, sa date
ou son historique. Un retrait public modifie sa visibilité sans effacer la
ressource.

## Extension Chrome

`browser-extension/` contient une extension Manifest V3 construite avec WXT,
TypeScript et une interface HTML/CSS sans framework.

Une action explicite sur l’icône ou le raccourci autorise la lecture ponctuelle
de la page active. L’extension extrait l’URL, le titre, l’adresse canonique, la
meta description et, si elle existe, la sélection de texte. La sélection et
la note restent privées.

L’extension ne possède aucun jeton GitHub. Elle communique uniquement avec
`https://digest.ooblik.com/*`, et le serveur n’accepte que l’origine exacte de
l’extension publiée :
`chrome-extension://nlejcccmpbajpoaknlecegkpgdegiflf`.
La fiche Chrome Web Store reste non listée et son lien d’installation est
présenté uniquement dans l’administration après authentification propriétaire.

## Publication d’un Digest

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

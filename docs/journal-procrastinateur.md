# Journal d’un procrastinateur

Le journal KEREDIT vit dans le dépôt de l’application, sous `docs/blog/`. Le
Digest n’en devient pas la source de vérité : il en reçoit une copie de
publication, placée dans Flux et générée par
`scripts/import-keredit-journal.ps1`.

## Parti pris éditorial

Le corpus compte 137 billets entre le 8 février et le 26 août 2026, pour un peu
plus de 161 000 mots. Sa valeur n’est pas seulement technique. Il documente les
décisions, les reprises, les fausses pistes, la fatigue et le temps réel passé à
transformer un outil d’atelier en produit.

La présentation publique prend donc la forme d’un carnet de fabrication :

- un manifeste court, qui donne le ton sans réécrire les billets ;
- le dernier billet mis en avant ;
- une chronologie mensuelle compacte ;
- une page de lecture par journée, avec navigation précédent/suivant.

Le titre « Journal d’un procrastinateur » est une couche éditoriale du Digest.
Les titres et corps des billets restent ceux de la source KEREDIT.

## Fonds documentaire

Chaque billet possède un document différent. Le catalogue de 137 notices se
trouve dans `data/journal-documents.json` et les WebP optimisés dans
`static/media/journal-procrastinateur/collections/v2-nasa/`. Les sujets forment
une bibliothèque visuelle de l’informatique et des sciences : ordinateurs,
salles de contrôle, télécommunications, électronique, robotique, laboratoires
et systèmes spatiaux.

Les documents validés viennent de la
[NASA Image and Video Library](https://images.nasa.gov/). Le script conserve
pour chaque image le titre, le crédit, la date, l’identifiant, la fiche source
et une mention d’usage courte. Il produit un WebP de 1 800 pixels maximum sans
modifier le fichier NASA téléchargé :

```powershell
node .\scripts\install-journal-visuals-v2.mjs
```

L’affectation est déterministe et sémantique : le script rapproche chaque
billet de l’une des sept familles documentaires, puis calcule une correspondance
unique sur les 137 visuels validés. Une nouvelle exécution réutilise les mêmes
fichiers source, vérifie l’unicité des identifiants et reconstruit le catalogue.
L’option `--refresh` force leur téléchargement.

### Revue V2 · informatique et sciences

La première collection généraliste est conservée sans suppression dans
`static/media/journal-procrastinateur/collections/v1-general/`, avec son
catalogue `data/journal-documents-v1-general.json`. Elle n’est plus reliée aux
billets, mais reste disponible comme archive de la première curation.

La V2 candidate est centrée sur la NASA : ordinateurs, salles de contrôle,
télécommunications, électronique, robotique, laboratoires et systèmes
spatiaux. Sa sélection se régénère avec :

```powershell
node .\scripts\curate-journal-visuals-v2.mjs
```

La planche validée reste vérifiable localement à
`/review/journal-visuels-v2/` avec `hugo server --buildDrafts`. Les décisions
« Écarter » sont conservées uniquement dans le stockage local du navigateur.
Le manifeste effectivement installé est aussi archivé dans
`data/journal-documents-v2-nasa.json`.

## Import et sas de publication

Depuis PowerShell, avec le dépôt WSL disponible :

```powershell
.\scripts\import-keredit-journal.ps1
hugo server --buildDrafts
```

L’import est idempotent et produit par défaut des brouillons. Il retire de la
copie les chemins absolus de poste, URL locales, adresses LAN et comptes OOBLIK
mentionnés dans les récits. Il restaure également les diacritiques françaises
dans la prose et les titres, en excluant les blocs de code, le code en ligne,
les URL et les formes techniques ambiguës. Il ne modifie jamais les fichiers
KEREDIT.

Après relecture éditoriale, `-Publish` rend la copie publiable :

```powershell
.\scripts\import-keredit-journal.ps1 -Publish
```

Cette commande ne déploie rien. La validation et le déploiement habituels du
Digest restent nécessaires.

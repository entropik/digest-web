# Publication Firefox Add-ons

## Cible et identité

- **Nom** : OOBLIK Digest — Curation
- **Identifiant Gecko** : `curation@digest.ooblik.com`
- **Version minimale** : Firefox 142
- **Distribution** : sur votre propre site, non listée sur AMO
- **Catégorie** : Productivité
- **Langue** : français
- **URL d’accueil** : <https://digest.ooblik.com/>
- **Politique de confidentialité** :
  <https://digest.ooblik.com/confidentialite/>

La distribution non listée fournit un XPI signé par Mozilla sans créer de fiche
publique. Le paquet reste destiné au propriétaire du Digest.

## État de référence de la version 1.5.0

- **Référence Mozilla** : `Addon#3064842`
- **Identifiant de la version AMO** : `6455993`
- **Identifiant du fichier AMO** : `5000165`
- **XPI signé** : `824fca3040734408979d-1.5.0.xpi`
- **Décision** : approbation automatique le 2 septembre 2026
- **Validation** : 0 erreur et 0 avertissement

La version signée a été installée dans Firefox et contrôlée dans
`about:addons`, où elle apparaît activée en version 1.5.0. Sur une page HTTPS
publique, le formulaire préremplit correctement l’URL et le titre, vérifie le
lien et rend le brouillon enregistrable. Le contrôle de référence n’a créé
aucun brouillon.

## Construction et validation

```shell
cd browser-extension
npm ci
npm run typecheck
npm test
npm run build:firefox
npm run lint:firefox
npm run zip:firefox
```

Le ZIP à envoyer à AMO est produit dans `.output/` avec le suffixe
`-firefox.zip`. Le manifeste généré se trouve dans
`.output/firefox-mv2/manifest.json`.

## Permissions et données

- `activeTab` : lire l’URL et le titre uniquement après une action explicite ;
- `scripting` : extraire ponctuellement l’adresse canonique, la meta description
  et le texte sélectionné ;
- `storage` : conserver localement pendant 24 heures au maximum une saisie
  interrompue ;
- `https://digest.ooblik.com/*` : vérifier la session propriétaire et enregistrer
  le brouillon dans le service privé.

Déclarations Firefox obligatoires :

- `browsingActivity` : URL de la page que l’utilisateur choisit de capturer ;
- `websiteContent` : titre, description, sélection et contenu éditorial choisi.

L’extension ne lit rien en arrière-plan, n’emploie aucun code distant et
n’envoie les données qu’après le clic sur « Enregistrer le brouillon ».

## Première signature depuis Firefox

1. Ouvrir <https://addons.mozilla.org/developers/> dans Firefox et se connecter.
2. Choisir **Submit a New Add-on**, puis la distribution **On your own**.
3. Téléverser le ZIP Firefox produit localement.
4. Confirmer l’identifiant `curation@digest.ooblik.com`, la compatibilité bureau
   et les déclarations de données ci-dessus.
5. Fournir l’URL de confidentialité et envoyer la version en validation.
6. Télécharger le XPI signé lorsque Mozilla l’a accepté.

## Installation et autorisation du profil

1. Dans Firefox, ouvrir `about:addons`, puis **Installer un module depuis un
   fichier** et choisir le XPI signé.
2. Ouvrir `about:debugging#/runtime/this-firefox`.
3. Dans la fiche de l’extension, relever l’UUID interne affiché et former
   l’origine exacte `moz-extension://<UUID>`.
4. Ajouter cette origine à `FIREFOX_EXTENSION_ORIGINS` dans le `.env` du service,
   séparée par une virgule des autres profils, puis redéployer le service.
5. Se connecter à `/admin`, ouvrir l’extension sur une page publique et vérifier
   l’enregistrement d’un brouillon.

Firefox choisit cet UUID par profil ; l’identifiant Gecko ne permet pas de le
prédire. Une réinstallation peut donc exiger de mettre à jour la liste blanche.
Ne jamais autoriser `moz-extension://*`.

## Test temporaire

Avant signature, ouvrir `about:debugging#/runtime/this-firefox`, choisir
**Charger un module complémentaire temporaire** et sélectionner
`.output/firefox-mv2/manifest.json`. L’installation disparaît au redémarrage.

## Mises à jour

1. Incrémenter la version dans `package.json` et `wxt.config.ts`.
2. Créer le tag `extension-vX.Y.Z`.
3. Télécharger l’artefact Firefox du workflow `Package browser extensions`.
4. Ajouter une nouvelle version au même module AMO et téléverser le ZIP.
5. Après signature, vérifier la mise à jour dans Firefox et refaire un test de
   capture réel.

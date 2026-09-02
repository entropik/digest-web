# Publication Chrome Web Store

## Fiche

- **Nom** : OOBLIK Digest — Curation
- **Résumé** : Capture la page active dans la file éditoriale privée d’OOBLIK
  Digest.
- **Visibilité** : non listée.
- **Catégorie** : Productivité.
- **Langue** : français.
- **URL d’accueil** : <https://digest.ooblik.com/>
- **Politique de confidentialité** :
  <https://digest.ooblik.com/confidentialite/>

Description proposée :

> Extension personnelle de curation pour OOBLIK Digest. Un clic ou un raccourci
> ouvre un formulaire prérempli avec l’URL, le titre, la description et, si
> vous en avez sélectionné, un extrait privé. Rien n’est capturé en arrière-plan.
> Les brouillons sont envoyés uniquement à digest.ooblik.com et restent privés
> jusqu’à la publication explicite d’une édition.

## Éléments graphiques prêts à téléverser

- icône de fiche : `store-assets/store-icon-128.png` ;
- capture principale : `store-assets/screenshot-capture-1280x800.jpg` ;
- petite tuile promotionnelle :
  `store-assets/promo-small-440x280.jpg` ;
- bannière facultative : `store-assets/promo-marquee-1400x560.jpg` ;
- source vectorielle du signe :
  `store-assets/ooblik-digest-mark.svg` ;
- master PNG : `store-assets/icon-master-512.png`.

Le ZIP `store-assets/ooblik-digest-store-assets-v1.zip` regroupe les fichiers
à utiliser dans la fiche. Les dimensions suivent les recommandations Chrome
Web Store : icône 128 × 128, capture 1280 × 800, petite tuile 440 × 280 et
bannière 1400 × 560.

## Justification des permissions

- `activeTab` : lire l’URL et le titre de l’onglet uniquement après un clic sur
  l’extension ou son raccourci.
- `scripting` : extraire ponctuellement l’URL canonique, la meta description et
  le texte sélectionné dans cet onglet.
- `storage` : restaurer pendant 24 heures au maximum une saisie interrompue.
  Ces données restent dans `chrome.storage.local` sur la machine courante et
  sont enregistrées automatiquement pour les pages publiques admissibles, puis
  effacées après un enregistrement réussi.
- `https://digest.ooblik.com/*` : vérifier la session propriétaire et enregistrer
  le brouillon dans le service d’administration.

L’extension n’utilise ni `<all_urls>`, ni l’API cookies, ni
`chrome.storage.sync`, ni code distant.

## Première publication

1. Créer l’élément Chrome Web Store et téléverser le ZIP produit par
   `npm run zip`.
2. Copier l’ID attribué par Chrome.
3. Ajouter
   `chrome-extension://nlejcccmpbajpoaknlecegkpgdegiflf` à
   `CHROME_EXTENSION_ORIGINS` dans le `.env` partagé du service, puis
   redéployer l’administration.
4. Compléter les déclarations de confidentialité, les captures, l’icône et les
   justifications ci-dessus.
5. Choisir la visibilité **Non listée**, envoyer en validation puis publier.

Pour un test non empaqueté, relever son ID dans `chrome://extensions` et ajouter
temporairement cette origine exacte à la variable, séparée par une virgule. Ne
jamais autoriser `chrome-extension://*`.

## Mises à jour

1. Incrémenter `version` dans `package.json` et `wxt.config.ts`.
2. Créer un tag `extension-vX.Y.Z`.
3. Télécharger l’artefact ZIP Chrome du workflow `Package browser extensions`.
4. Téléverser et publier manuellement cette version dans le tableau de bord.

Chrome met ensuite automatiquement à jour les installations existantes.

## Modifier l’icône de l’extension

Le générateur canonique des icônes 16, 32, 48 et 128 px est
`scripts/generate-icons.mjs`. Après une modification graphique, exécuter
`npm run icons`, vérifier visuellement les quatre PNG de `public/icon/`, puis
les committer avec le générateur. `npm run build` et `npm run zip` vérifient
que ces fichiers sont à jour sans les réécrire. La CI les régénère également
et refuse toute différence.

Le script `generate-store-assets.py` ne modifie pas les icônes de l’extension :
il produit seulement les ressources propres à la fiche Chrome Web Store.

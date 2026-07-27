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
  <https://digest.ooblik.com/confidentialite-extension/>

Description proposée :

> Extension personnelle de curation pour OOBLIK Digest. Un clic ou un raccourci
> ouvre un formulaire prérempli avec l’URL, le titre, la description et, si
> vous en avez sélectionné, un extrait privé. Rien n’est capturé en arrière-plan.
> Les brouillons sont envoyés uniquement à digest.ooblik.com et restent privés
> jusqu’à la publication explicite d’une édition.

## Justification des permissions

- `activeTab` : lire l’URL et le titre de l’onglet uniquement après un clic sur
  l’extension ou son raccourci.
- `scripting` : extraire ponctuellement l’URL canonique, la meta description et
  le texte sélectionné dans cet onglet.
- `https://digest.ooblik.com/*` : vérifier la session propriétaire et enregistrer
  le brouillon dans le service d’administration.

L’extension n’utilise ni `<all_urls>`, ni l’API cookies, ni stockage local, ni
code distant.

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
3. Télécharger l’artefact ZIP du workflow `Package Chrome extension`.
4. Téléverser et publier manuellement cette version dans le tableau de bord.

Chrome met ensuite automatiquement à jour les installations existantes.

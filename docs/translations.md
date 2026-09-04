# Traductions FR / GB

La version 1.27.1 conserve le français à la racine et construit l’anglais
britannique sous `/en/`. Le sélecteur FR / GB conserve la page, ses paramètres
d’URL et l’ancre. Les identifiants, destinations originales, favoris et noms
canoniques des catégories et tags restent communs. Les libellés affichés,
dates, index de recherche, métadonnées et flux RSS suivent la langue.
L’administration et l’extension restent en français.

## Crédit et ordre de traitement

Le profil Developer utilisé ici dispose d’un crédit total de 1 000 000 de
caractères. Le calendrier ne remet jamais le compteur à zéro. Le rattrapage
s’arrête avant de dépasser **700 000 caractères consommés sur le compte**,
consommation antérieure comprise. Les nouveautés peuvent utiliser le solde
jusqu’à 1 000 000. Aucun changement de forfait n’est effectué.

Le premier inventaire définit l’historique. Il reste en attente du lancement
explicite depuis l’onglet Traductions. Les nouveaux contenus publics et les
modifications de contenus déjà traduits passent ensuite en priorité. Le
rattrapage traite le socle et la taxonomie, les dix dernières éditions avec
leurs fiches et les dix derniers billets du Journal du procrastinateur avec
leurs légendes, puis le reste par date décroissante. Une même fiche réutilisée
dans plusieurs éditions ne crée qu’un élément dans l’inventaire.

Avant un groupe de dix requêtes au maximum, le service relève le quota.
Chaque requête réserve son coût maximal avant son envoi, puis remplace cette
réservation par le nombre facturé renvoyé par DeepL. Le compteur conservateur
inclut les appels récents que le relevé distant n’a pas encore intégrés.
Le plafond peut donc arrêter le lot légèrement avant 70 %. Un quota inconnu
interdit tout nouvel appel. Ce plafond local ne contrôle pas les consommations
concurrentes effectuées par d’autres logiciels sur le même compte.

## Installation et publication

1. Configurer `DEEPL_API_KEY` dans le fichier d’environnement privé du service.
   `DEEPL_API_URL` est facultatif : le suffixe `:fx` sélectionne
   `https://api-free.deepl.com`, sinon `https://api.deepl.com`.
2. Suivre le déploiement habituel : arrêt du processus, sauvegarde SQLite,
   migration, redémarrage et contrôle de santé. Les tables `translation_*`
   partagent la base `BETTER_AUTH_DATABASE` et sa sauvegarde existante.
   Conserver **un seul processus Node** pour cette file.
3. Construire le site avec `node scripts/build-site.mjs`. La première passe
   Hugo produit le manifeste français ; la seconde utilise l’adaptateur
   `content/_content.en.gotmpl` pour les pages anglaises. La CI et le
   déploiement exécutent cette commande via `scripts/verify.mjs`.
   En développement, relancer cette construction après une modification des
   sources françaises pour actualiser aussi le manifeste anglais.
4. Dans Traductions, actualiser le quota, contrôler l’estimation et lancer
   le rattrapage. La fermeture du navigateur ne l’arrête pas. Suspendre agit
   après la requête déjà en cours ; reprendre conserve le travail terminé.

Le service examine `/translation-source.json` toutes les minutes. Seuls les
contenus publics y figurent : les fiches masquées et les pages de revue sont
exclues. Les champs sont identifiés par SHA-256 de leur format et de leur
source. Une publication de traduction ne change donc pas les empreintes
éditoriales et ne relance pas les mêmes textes.

Les résultats sont sauvegardés immédiatement dans SQLite, puis exportés par
lots dans `data/translations_en.json` avec le mécanisme GitHub App existant.
Chaque lot fige aussi dans la table `translation_publications` son snapshot et
un plan `data/translation_build_plan.json` : révision publique de départ,
révision préparée, empreinte du manifeste, champs modifiés, routes Hugo et
affiches à ajouter ou retirer. Un redémarrage ou une reprise réutilise ce plan
sans appeler DeepL. Les traductions terminées pendant un déploiement sont
conservées dans SQLite et forment le lot suivant.
Les affiches typographiques anglaises sont produites dans `static/social/en/`.
Le snapshot conserve leurs textes, le nombre de liens visibles et le type
Digest/Focus. Une modification de ces données ou un fichier manquant déclenche
leur régénération, même sans nouveau texte à traduire.
Les documents historiques et captures restent inchangés. Le snapshot public
`/translation-snapshot.json` confirme ce qui est effectivement déployé.
Son empreinte est calculée après exclusion des traductions périmées et des
affiches absentes ou obsolètes. La référence de l’export d’origine permet de
reprendre une publication filtrée sans la déclarer intégralement en ligne.
Un déploiement échoué se réessaie avec « Réessayer les erreurs », sans nouvel
appel de traduction. Réessayer des champs en erreur conserve le mode de
rattrapage choisi : cette commande ne lance jamais tout l’historique en attente.
Aucun export supplémentaire n’est lancé pendant un déploiement déjà en cours.

Le manifeste public v2 associe chaque élément aux pages anglaises qui le
réutilisent. Un commit limité au snapshot, au plan et aux affiches anglaises
autorisées repart de l’arbre `production`, rend ces routes avec les segments
Hugo, actualise le snapshot racine, les listes, RSS et index de recherche
concernés, puis pousse un commit descendant de `production` sans force-push.
Le script refuse l’overlay et exécute le build complet si le commit sort de la
liste fermée, si le manifeste est encore en v1, si une révision diverge ou si
une sortie attendue manque. CloudPanel reçoit toujours une release statique
complète et conserve sa bascule atomique du lien `current`.

Le déploiement de l’administration compare l’objet tree Git de
`admin-service` au dernier tree observé. Un commit de traduction qui ne change
pas ce répertoire actualise seulement le SHA observé et contrôle la santé du
processus existant.

Une traduction absente ou devenue obsolète laisse apparaître la source avec
« Translation pending ». Le français continue à être construit et publié si
DeepL est indisponible. Le HTML exporté par Hugo est transmis à DeepL avec
protection du code ; la réponse doit conserver les balises, attributs,
destinations et blocs de code. `security.allowContent` autorise cet HTML dans
l’adaptateur Hugo, sans interpréter du contenu récupéré sur des sites externes.
Un champ supérieur à la limite conservatrice de 120 Ko est signalé en erreur
et nécessite un découpage éditorial avant une nouvelle tentative.

## Suivi et reprise

- **Couverture** : somme des caractères sources des champs actuels traduits,
  divisée par le volume public courant. Les reprises d’une fiche dans des
  listes et éditions n’ajoutent pas de volume. Des champs distincts contenant
  le même texte peuvent partager une traduction en mémoire sans partager leur
  rôle éditorial dans le dénominateur.
- **Éléments** : terminé, partiel, à traiter, à actualiser ou en erreur.
  Les catégories sont exclusives ; une erreur prime sur l’état d’actualisation.
- **Crédit** : relevé distant, date du relevé, solde et réservations récentes.
  L’enveloppe de rattrapage utilise le compteur conservateur.
- **Publication** : caractères préparés dans SQLite et caractères présents
  dans le snapshot public avec la même empreinte et le même texte.
- **Historique** : lots et événements persistants, courbe de couverture en
  fin de journée, volumes facturés par jour. Le filtre mensuel est uniquement
  une vue de cet historique et ne renouvelle aucun crédit.

Après une interruption ou un résultat ambigu, la requête devient
`uncertain` et sa réservation reste comptée. Elle n’est jamais rejouée par
« Réessayer les erreurs ». « Examiner les requêtes incertaines » demande une
confirmation distincte avant de les rejouer : un second appel peut être
facturé à nouveau. Le tableau indique le contenu et le motif concernés.

Une correction manuelle peut être conservée dans le snapshot Git en ajoutant
`manual: true` au champ corrigé, sans changer son `hash`. Le service la réimporte
après publication et la préserve tant que la source ne change pas. Une source
modifiée produit une nouvelle empreinte et une nouvelle traduction. La correction
reste propre au contenu et au champ concernés, y compris lors de la reconstruction
de SQLite depuis le snapshot ; elle ne remplace pas la mémoire partagée.
Supprimer cette correction du snapshot, ou retirer son indicateur `manual`,
retire également la correction locale lors de la prochaine synchronisation.

Les routes `/api/admin/translations/*` utilisent l’authentification propriétaire
et les contrôles d’origine existants. La clé n’est jamais incluse dans le site,
le JavaScript, le snapshot ou les réponses de suivi.

## Validation locale

`npm test` dans `admin-service` utilise une API simulée pour les plafonds,
reprises, priorités, invalidations, protection HTML et publication. Le test
Hugo construit un site temporaire bilingue, avec traduction périmée, liens
internes, alias et repli français. `node scripts/verify.mjs` ajoute les tests
de l’extension, les contrôles éditoriaux et la construction complète.

Le premier petit lot éditorial réel de cette évolution couvre les pages fixes
et les titres et descriptions des dix dernières éditions. Les résultats et
leurs affiches sont versionnables ; le reste demeure dans la file progressive.

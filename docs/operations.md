# Exploitation de l’administration

## Cron et version Node de l’administration

Le site statique et le service Node sont déployés séparément. Une exécution
réussie de `Deploy production` prouve la publication de la branche statique,
pas la mise à jour de l’administration. Le cron admin récupère `main`, construit
une release, sauvegarde les données, applique les migrations puis bascule le
service. Les deux versions affichées doivent être vérifiées après déploiement.

Le 3 septembre 2026, la ligne de la crontab du compte `digest` utilisait Node
20.20.2 alors que le service exige Node.js 22 ou supérieur. L’installation de
`better-sqlite3` échouait avec `prebuild-install: not found` et
`node-gyp: not found`, avant la bascule. L’ancienne release restait donc active.
La ligne corrigée sélectionne désormais l’installation Node 22 du compte :

```cron
* * * * * PATH=/home/digest/.local/node22/bin:/usr/local/bin:/usr/bin:/bin /bin/sh /home/digest/bin/deploy-admin-cloudpanel.sh >> /home/digest/logs/digest-admin-deploy.log 2>&1
```

L’affectation `PATH` ne concerne que cette commande, pas le cron du site public.
Node 22.23.1 et npm 10.9.8 ont été vérifiés dans un environnement minimal.
Le script ne sélectionne pas lui-même Node : ne pas compter sur un profil de
connexion ou sur la version utilisée par le processus PM2 déjà lancé.

Avant toute modification, sauvegarder la crontab complète et comparer son état
au moment de l’installation pour préserver les changements concurrents.
Inventorier à la fois la crontab du compte et les fichiers de `/etc/cron.d`.
Lors du contrôle du 3 septembre, `/etc/cron.d/digest` contenait aussi une tâche
admin utilisant déjà Node 22, un verrou externe et un contrôle de santé. Cette
tâche a été conservée : l’ajout du `PATH` n’a pas supprimé le doublon. Ne pas
ajouter une troisième planification. Une consolidation devra préserver le
contrôle de santé et faire l’objet d’une intervention distincte.

Pour contrôler une correction sans forcer un déploiement :

- Vérifier sous le compte de service, avec le `PATH` ci-dessus, les résultats
  de `command -v node`, `node --version`, `npm --version` et `command -v pm2`.
- Confirmer dans les journaux cron l’exécution de la ligne corrigée à la minute
  suivante, puis examiner `/home/digest/logs/digest-admin-deploy.log`.
- Lire la cible de `/home/digest/apps/digest-admin/current` et la comparer au
  SHA attendu de `main`.
- Vérifier `http://127.0.0.1:3210/health`, puis la version affichée dans une
  session authentifiée de `/admin` et dans le pied de page public.

Une modification de la crontab seule ne nécessite ni redémarrage PM2 ni
modification de SQLite. Pour revenir en arrière, restaurer la ligne concernée
depuis la sauvegarde en conservant les éventuelles modifications ultérieures.

## Republication éditoriale sur LinkedIn

Quand le Digest possède déjà l’URN d’une URL, une nouvelle demande ne publie
rien automatiquement : elle affiche le lien du post le plus récent et le
nombre d’occurrences conservées.

L’action « Republier sur LinkedIn » transforme volontairement cette demande en
nouvelle occurrence. Le compositeur reste ouvert pour modifier le texte et les
hashtags avant confirmation. Le service réserve de nouveau l’URL, téléverse
l’image en mode synchrone et ajoute la nouvelle URN à l’historique sans retirer
les publications précédentes.

Cette répétition volontaire reste différente du résultat ambigu ci-dessous,
où la requête de création n’a pas fourni de résultat fiable et où une
réservation `submitting` protège l’URL. Un résultat ambigu doit toujours être
réconcilié avant toute republication.

## Publication LinkedIn au résultat ambigu

L’administration enregistre une publication avec l’état `submitting` juste
avant d’envoyer la requête qui crée le post LinkedIn. Cet état est conservé
sans expiration si LinkedIn ne fournit pas de résultat certain ou si le Digest
ne parvient pas à enregistrer l’identifiant du post après sa création. Il
interdit volontairement toute nouvelle publication automatique de la même URL.

Ne levez jamais ce verrou sans avoir d’abord consulté le profil LinkedIn
connecté et vérifié qu’aucun post correspondant n’existe. Si le post existe,
conservez le verrou : une nouvelle tentative créerait un doublon.

Si aucun post n’existe :

1. arrêtez le service d’administration afin d’éviter une publication
   concurrente ;
2. sauvegardez la base désignée par `BETTER_AUTH_DATABASE` avec la commande de
   sauvegarde du service ;
3. ouvrez cette base avec SQLite et contrôlez la ligne ciblée :

   ```sql
   SELECT publication_url, state
   FROM linkedin_publication_reservations
   WHERE publication_url = 'URL_PUBLIQUE_EXACTE';
   ```

4. supprimez uniquement la réservation confirmée comme absente de LinkedIn :

   ```sql
   DELETE FROM linkedin_publication_reservations
   WHERE publication_url = 'URL_PUBLIQUE_EXACTE'
     AND state = 'submitting';
   ```

5. vérifiez qu’une seule ligne a été supprimée, puis redémarrez le service.

Une réservation `reserved` ou une URL différente ne doit pas être supprimée.
La sauvegarde permet de revenir à l’état précédent en cas d’erreur opérateur.

## Rollback d’un déploiement admin

Le script CloudPanel construit complètement la nouvelle release avant toute
interruption. Il sauvegarde ensuite SQLite, arrête PM2, applique les migrations,
bascule le lien `current`, démarre la release et contrôle `/health`.

Une erreur de migration, de démarrage PM2 ou de contrôle de santé déclenche le
rollback automatique suivant : arrêt du candidat, restauration atomique de la
sauvegarde SQLite, rétablissement du lien vers la release précédente, puis
redémarrage et contrôle de santé de cette release. Si la restauration SQLite
échoue, le service reste volontairement arrêté afin qu’un ancien binaire ne
s’exécute pas contre un schéma incertain.

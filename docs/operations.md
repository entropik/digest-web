# Exploitation de l’administration

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

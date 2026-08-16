# Mémoire éditoriale du projet

## Conservation des liens

- Le Digest est aussi une archive de la fragilité du web : une ressource ne doit
  jamais être supprimée uniquement parce que son URL ne répond plus, redirige
  ailleurs ou que le service a disparu.
- Conserver l’adresse publique d’origine et documenter ce que la ressource était.
- Marquer explicitement ces entrées avec `status: "dead"`, ajouter une
  `status_note` lisible et le tag `lien-mort`.
- Dans l’interface, afficher « Lien mort · conservé pour mémoire » tout en
  laissant l’adresse originale consultable.
- Une URL privée, locale, authentifiée ou contenant des informations sensibles
  reste exclue : la conservation patrimoniale ne l’emporte jamais sur la
  sécurité ou la confidentialité.

## Validation éditoriale des destinations

- Une réponse HTTP réussie ne suffit pas à valider un lien : vérifier que le
  nom, l’activité et le contenu de la page correspondent bien à la ressource
  décrite.
- Ne jamais supposer que les variantes avec et sans `www`, avec ou sans trait
  d’union, appartiennent à la même entité. Les comparer comme des domaines
  indépendants avant de choisir l’adresse canonique.
- Si un domaine a été repris par un faux homonyme, un site de référencement ou
  une ferme de contenus, retrouver le site officiel à partir de l’identité et
  des projets de la ressource, puis corriger aussi le résumé et les tags.

## Version du site

- Toute évolution fonctionnelle, technique ou visuelle destinée à être déployée
  doit mettre à jour la version affichée dans `params.footer.text` de
  `hugo.yaml`.
- Appliquer SemVer simplement : incrémenter le correctif pour une correction,
  une optimisation ou de la maintenance, la version mineure pour une nouvelle
  fonctionnalité, et la version majeure pour une refonte incompatible.
- Une publication purement éditoriale du Digest ne change pas la version du
  site.
- Après fusion et déploiement, créer le tag Git annoté correspondant sur le
  commit effectivement déployé, puis vérifier que la même version apparaît dans
  le pied de page public.

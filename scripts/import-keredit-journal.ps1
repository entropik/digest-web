[CmdletBinding()]
param(
  [string]$SourceDirectory = "\\wsl.localhost\Ubuntu\home\marc\code\krampouz\docs\blog",
  [string]$DestinationDirectory = (Join-Path $PSScriptRoot "..\content\flux\journal-procrastinateur"),
  [switch]$Publish,
  [switch]$RepairFrench,
  [switch]$CheckFrench
)

$ErrorActionPreference = "Stop"
$source = (Resolve-Path -LiteralPath $SourceDirectory).Path
$destination = [System.IO.Path]::GetFullPath($DestinationDirectory)
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

if (-not $destination.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "La destination doit rester dans le dépôt Digest."
}

New-Item -ItemType Directory -Force -Path $destination | Out-Null

function ConvertTo-YamlString([string]$Value) {
  return '"' + $Value.Replace('\', '\\').Replace('"', '\"').Replace("`r", '').Replace("`n", ' ') + '"'
}

function Get-TomlValue([string]$FrontMatter, [string]$Name) {
  $match = [regex]::Match($FrontMatter, "(?m)^$([regex]::Escape($Name))\s*=\s*`"(.*)`"\s*$")
  if (-not $match.Success) { return $null }
  return $match.Groups[1].Value.Replace('\"', '"')
}

function Remove-FrenchDiacritics([string]$Value) {
  $normalized = $Value.Normalize([System.Text.NormalizationForm]::FormD)
  $builder = [System.Text.StringBuilder]::new()
  foreach ($character in $normalized.ToCharArray()) {
    $category = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($character)
    if ($category -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($character)
    }
  }
  return $builder.ToString().Normalize([System.Text.NormalizationForm]::FormC).Replace('œ', 'oe').Replace('Œ', 'OE').Replace('æ', 'ae').Replace('Æ', 'AE')
}

function Get-FrenchDiacriticLexicon([System.IO.FileInfo[]]$Files) {
  $candidates = @{}
  foreach ($file in $Files) {
    $sourceText = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
    foreach ($match in [regex]::Matches($sourceText, "[\p{L}œŒæÆ]+")) {
      $word = $match.Value.ToLowerInvariant()
      $plain = (Remove-FrenchDiacritics $word).ToLowerInvariant()
      if ($plain -eq $word) { continue }
      if (-not $candidates.ContainsKey($plain)) { $candidates[$plain] = [System.Collections.Generic.HashSet[string]]::new() }
      [void]$candidates[$plain].Add($word)
    }
  }

  $lexicon = @{}
  $ambiguousPlainWords = [System.Collections.Generic.HashSet[string]]::new(
    [string[]]@('a', 'la', 'ou', 'des', 'du', 'sur', 'pres'),
    [System.StringComparer]::OrdinalIgnoreCase
  )
  foreach ($plain in $candidates.Keys) {
    if ($candidates[$plain].Count -ne 1) { continue }
    if ($ambiguousPlainWords.Contains($plain)) { continue }
    $accented = @($candidates[$plain])[0]
    # A final é/és can encode a present tense, a noun or a past participle
    # (genere -> génère/généré, commandes -> commandes/commandés). Keep it manual.
    # Feminine forms in -ée/-ées retain their final e and are not ambiguous this way.
    if ($accented -match 'és?$') { continue }
    $lexicon[$plain] = $accented
  }

  $overrides = [ordered]@{
    'aout' = 'août'; 'ca' = 'ça'; 'deja' = 'déjà'; 'ete' = 'été'; 'etre' = 'être'; 'meme' = 'même'
    'apres' = 'après'; 'tres' = 'très'; 'fenetre' = 'fenêtre'; 'fenetres' = 'fenêtres'; 'editeur' = 'éditeur'
    'probleme' = 'problème'; 'systeme' = 'système'; 'regle' = 'règle'; 'modele' = 'modèle'
    'perimetre' = 'périmètre'; 'parametre' = 'paramètre'; 'parametres' = 'paramètres'
    'memoire' = 'mémoire'; 'premiere' = 'première'; 'derniere' = 'dernière'
    'deuxieme' = 'deuxième'; 'troisieme' = 'troisième'; 'maniere' = 'manière'
    'derriere' = 'derrière'; 'frontiere' = 'frontière'; 'frontieres' = 'frontières'
    'reelle' = 'réelle'; 'reelles' = 'réelles'; 'differente' = 'différente'; 'differentes' = 'différentes'
    'intermediaire' = 'intermédiaire'; 'intermediaires' = 'intermédiaires'
    'concrete' = 'concrète'; 'concretes' = 'concrètes'; 'avancee' = 'avancée'; 'avancees' = 'avancées'; 'tete' = 'tête'; 'requete' = 'requête'; 'requetes' = 'requêtes'
    'cumule' = 'cumulé'; 'livree' = 'livrée'; 'creee' = 'créée'; 'confirmee' = 'confirmée'; 'mergee' = 'mergée'; 'mergees' = 'mergées'
    'travaillees' = 'travaillées'; 'europeen' = 'européen'; 'europeenne' = 'européenne'
    'commite' = 'commité'; 'commitee' = 'commitée'; 'prouvee' = 'prouvée'; 'desormais' = 'désormais'
    'lateraux' = 'latéraux'; 'securite' = 'sécurité'; 'volee' = 'volée'; 'degradation' = 'dégradation'
    'capacite' = 'capacité'; 'recents' = 'récents'; 'emerger' = 'émerger'
    'executee' = 'exécutée'; 'necessite' = 'nécessité'
    'cle' = 'clé'; 'cles' = 'clés'; 'controle' = 'contrôle'; 'coherence' = 'cohérence'
    'retentees' = 'retentées'; 'demandees' = 'demandées'; 'retirees' = 'retirées'
    'utilisees' = 'utilisées'; 'gerees' = 'gérées'; 'sauvees' = 'sauvées'; 'placees' = 'placées'
    'signees' = 'signées'; 'revendiquee' = 'revendiquée'; 'reformulee' = 'reformulée'
    'ere' = 'ère'; 'dernieres' = 'dernières'; 'reecriture' = 'réécriture'; 'epoque' = 'époque'
    'repertoires' = 'répertoires'; 'instantanes' = 'instantanés'; 'executables' = 'exécutables'
    'presenter' = 'présenter'; 'critere' = 'critère'; 'criteres' = 'critères'; 'magnetique' = 'magnétique'
    'regles' = 'règles'; 'alignes' = 'alignés'; 'retires' = 'retirés'; 'observes' = 'observés'
    'obsolete' = 'obsolète'; 'obsoletes' = 'obsolètes'; 'repetait' = 'répétait'
    'activite' = 'activité'; 'qualite' = 'qualité'; 'realite' = 'réalité'; 'autorite' = 'autorité'
    'fragilite' = 'fragilité'; 'reflexion' = 'réflexion'; 'reflexions' = 'réflexions'; 'sante' = 'santé'; 'equipe' = 'équipe'
    # Noms, adjectifs et infinitifs absents des graphies accentuées du corpus source.
    # Cette liste volontairement explicite évite de « corriger » les noms techniques
    # et les formes réellement ambiguës (Compose, email, faite, corrige, expose…).
    'ambiguite' = 'ambiguïté'; 'ambiguities' = 'ambiguïtés'; 'apercu' = 'aperçu'; 'apercus' = 'aperçus'
    'bibliotheque' = 'bibliothèque'; 'bibliotheques' = 'bibliothèques'
    'categorie' = 'catégorie'; 'categories' = 'catégories'; 'cloture' = 'clôture'
    'compatibilite' = 'compatibilité'; 'compatibilites' = 'compatibilités'
    'continuite' = 'continuité'; 'densite' = 'densité'; 'densites' = 'densités'
    'depart' = 'départ'; 'departs' = 'départs'; 'detail' = 'détail'; 'details' = 'détails'
    'demontrer' = 'démontrer'; 'detecter' = 'détecter'; 'depot' = 'dépôt'; 'depots' = 'dépôts'
    'derive' = 'dérive'; 'derives' = 'dérives'; 'echelle' = 'échelle'; 'echelles' = 'échelles'
    'echec' = 'échec'; 'echecs' = 'échecs'; 'ecran' = 'écran'; 'ecrans' = 'écrans'
    'efficacite' = 'efficacité'; 'egalite' = 'égalité'; 'ephemere' = 'éphémère'; 'ephemeres' = 'éphémères'
    'etape' = 'étape'; 'etapes' = 'étapes'; 'etendue' = 'étendue'; 'etendues' = 'étendues'
    'fidelite' = 'fidélité'; 'fonctionnalite' = 'fonctionnalité'; 'fonctionnalites' = 'fonctionnalités'
    'geometrie' = 'géométrie'; 'heriter' = 'hériter'; 'idee' = 'idée'; 'idees' = 'idées'
    'interieur' = 'intérieur'; 'interieure' = 'intérieure'; 'interieurs' = 'intérieurs'; 'interieures' = 'intérieures'
    'libelle' = 'libellé'; 'libelles' = 'libellés'; 'liberte' = 'liberté'; 'libertes' = 'libertés'
    'lisibilite' = 'lisibilité'; 'mecanisme' = 'mécanisme'; 'mecanismes' = 'mécanismes'
    'metadonnee' = 'métadonnée'; 'metadonnees' = 'métadonnées'; 'methode' = 'méthode'; 'methodes' = 'méthodes'
    'necessaire' = 'nécessaire'; 'necessaires' = 'nécessaires'; 'operateur' = 'opérateur'; 'operateurs' = 'opérateurs'
    'piece' = 'pièce'; 'pieces' = 'pièces'; 'priorite' = 'priorité'; 'priorites' = 'priorités'
    'propriete' = 'propriété'; 'proprietes' = 'propriétés'; 'quantite' = 'quantité'; 'quantites' = 'quantités'
    'recrire' = 'récrire'; 'reinitialiser' = 'réinitialiser'; 'reparation' = 'réparation'; 'reparations' = 'réparations'
    'responsabilite' = 'responsabilité'; 'responsabilites' = 'responsabilités'
    'souverainete' = 'souveraineté'; 'specialisee' = 'spécialisée'; 'specialisees' = 'spécialisées'
    'synthetique' = 'synthétique'; 'synthetiques' = 'synthétiques'; 'telechargement' = 'téléchargement'
    'telechargements' = 'téléchargements'; 'theme' = 'thème'; 'themes' = 'thèmes'
    'unite' = 'unité'; 'unites' = 'unités'; 'verite' = 'vérité'; 'verites' = 'vérités'
    'oeuvre' = 'œuvre'; 'oeuvres' = 'œuvres'
    'observabilite' = 'observabilité'; 'scenario' = 'scénario'; 'scenarios' = 'scénarios'; 'beta' = 'bêta'
    'identite' = 'identité'; 'identites' = 'identités'; 'proprietaire' = 'propriétaire'; 'proprietaires' = 'propriétaires'
    'reorganisation' = 'réorganisation'; 'reorganisations' = 'réorganisations'; 'reorganiser' = 'réorganiser'
    'reduction' = 'réduction'; 'reductions' = 'réductions'; 'ecrire' = 'écrire'; 'selectionner' = 'sélectionner'
    'integration' = 'intégration'; 'integrations' = 'intégrations'; 'retention' = 'rétention'; 'complexite' = 'complexité'
    'operationnel' = 'opérationnel'; 'operationnelle' = 'opérationnelle'; 'operationnels' = 'opérationnels'; 'operationnelles' = 'opérationnelles'
    'geometrique' = 'géométrique'; 'geometriques' = 'géométriques'; 'moitie' = 'moitié'; 'stabilite' = 'stabilité'
    'iteration' = 'itération'; 'iterations' = 'itérations'; 'decoupage' = 'découpage'; 'fiabilite' = 'fiabilité'
    'separement' = 'séparément'; 'sequentiel' = 'séquentiel'; 'sequentielle' = 'séquentielle'; 'referentiel' = 'référentiel'
    'referentiels' = 'référentiels'; 'poignee' = 'poignée'; 'poignees' = 'poignées'; 'temoin' = 'témoin'; 'temoins' = 'témoins'
    'merite' = 'mérite'; 'meritent' = 'méritent'; 'proteger' = 'protéger'; 'regression' = 'régression'; 'regressions' = 'régressions'
    'enorme' = 'énorme'; 'enormes' = 'énormes'; 'deduplication' = 'déduplication'; 'numerique' = 'numérique'; 'numeriques' = 'numériques'
    'grace' = 'grâce'; 'executer' = 'exécuter'; 'enchaine' = 'enchaîne'; 'general' = 'général'; 'generale' = 'générale'; 'generaux' = 'généraux'; 'generales' = 'générales'
    'recuperer' = 'récupérer'; 'operation' = 'opération'; 'operations' = 'opérations'; 'decalage' = 'décalage'; 'decalages' = 'décalages'
    'dedoublonnage' = 'dédoublonnage'; 'strategie' = 'stratégie'; 'strategies' = 'stratégies'; 'deployer' = 'déployer'; 'evoluer' = 'évoluer'
    'metal' = 'métal'; 'generation' = 'génération'; 'generations' = 'générations'; 'ecraser' = 'écraser'; 'montee' = 'montée'; 'montees' = 'montées'
    'leger' = 'léger'; 'legere' = 'légère'; 'legers' = 'légers'; 'legeres' = 'légères'; 'simplicite' = 'simplicité'
    'presence' = 'présence'; 'presentation' = 'présentation'; 'presentations' = 'présentations'; 'francais' = 'français'
    'beaute' = 'beauté'; 'carre' = 'carré'; 'carres' = 'carrés'; 'connait' = 'connaît'
    'coordonnees' = 'coordonnées'; 'credible' = 'crédible'; 'credibles' = 'crédibles'
    'deplacement' = 'déplacement'; 'deplacements' = 'déplacements'; 'difficulte' = 'difficulté'; 'difficultes' = 'difficultés'
    'elargit' = 'élargit'; 'entiere' = 'entière'; 'entieres' = 'entières'; 'magnetiques' = 'magnétiques'
    'maturite' = 'maturité'; 'obeir' = 'obéir'; 'parallele' = 'parallèle'; 'paralleles' = 'parallèles'
    'recentree' = 'recentrée'; 'recentrees' = 'recentrées'; 'resultat' = 'résultat'; 'resultats' = 'résultats'
    'separee' = 'séparée'; 'separees' = 'séparées'; 'unifiee' = 'unifiée'; 'unifiees' = 'unifiées'
    'visibilite' = 'visibilité'
    'abandonnee' = 'abandonnée'; 'abandonnees' = 'abandonnées'; 'allege' = 'allège'; 'arretait' = 'arrêtait'
    'centree' = 'centrée'; 'chaines' = 'chaînes'; 'controleurs' = 'contrôleurs'; 'controles' = 'contrôles'
    'coute' = 'coûte'; 'coutent' = 'coûtent'; 'couteuse' = 'coûteuse'; 'couts' = 'coûts'; 'croisees' = 'croisées'
    'detecte' = 'détecte'; 'disparait' = 'disparaît'; 'discrete' = 'discrète'; 'documentees' = 'documentées'
    'echoue' = 'échoue'; 'echanges' = 'échanges'; 'ecritures' = 'écritures'; 'editions' = 'éditions'
    'editables' = 'éditables'; 'effectuees' = 'effectuées'; 'entrees' = 'entrées'; 'etant' = 'étant'
    'eventuelles' = 'éventuelles'; 'evidentes' = 'évidentes'; 'francaise' = 'française'; 'francaises' = 'françaises'
    'hypotheses' = 'hypothèses'; 'immediate' = 'immédiate'; 'instantanees' = 'instantanées'
    'melangeait' = 'mélangeait'; 'mediane' = 'médiane'; 'negatives' = 'négatives'; 'observees' = 'observées'
    'possede' = 'possède'; 'prepare' = 'prépare'; 'present' = 'présent'; 'procedures' = 'procédures'
    'ramene' = 'ramène'; 'recoivent' = 'reçoivent'; 'reduisent' = 'réduisent'; 'schemas' = 'schémas'
    'selectionne' = 'sélectionne'; 'supprimee' = 'supprimée'; 'supprimees' = 'supprimées'
    'declaree' = 'déclarée'; 'declarees' = 'déclarées'; 'presigne' = 'présigné'; 'presignes' = 'présignés'
    'pret' = 'prêt'; 'prets' = 'prêts'; 'repoussee' = 'repoussée'; 'repoussees' = 'repoussées'
    'dedie' = 'dédie'; 'precise' = 'précise'; 'selecteur' = 'sélecteur'; 'selecteurs' = 'sélecteurs'
    'decorative' = 'décorative'; 'decoratif' = 'décoratif'; 'decoratifs' = 'décoratifs'; 'partagees' = 'partagées'
    'poussee' = 'poussée'; 'retrouvee' = 'retrouvée'; 'signee' = 'signée'; 'utilisee' = 'utilisée'
    'cachees' = 'cachées'; 'deborde' = 'déborde'; 'fermees' = 'fermées'; 'ignorees' = 'ignorées'; 'verifies' = 'vérifies'
    'affichees' = 'affichées'; 'ciblee' = 'ciblée'; 'decouvre' = 'découvre'; 'ecrase' = 'écrase'
    'finalisee' = 'finalisée'; 'lancees' = 'lancées'; 'manipulee' = 'manipulée'; 'pretend' = 'prétend'
    'recalee' = 'recalée'; 'restauree' = 'restaurée'; 'reussi' = 'réussi'; 'simplifiee' = 'simplifiée'; 'structuree' = 'structurée'
    'arteres' = 'artères'; 'bornees' = 'bornées'; 'cadree' = 'cadrée'; 'clarifiee' = 'clarifiée'
    'consacree' = 'consacrée'; 'conservees' = 'conservées'; 'decoupe' = 'découpe'; 'depasse' = 'dépasse'
    'deplaces' = 'déplaces'; 'edite' = 'édite'; 'envoyes' = 'envoyés'; 'exposees' = 'exposées'
    'gardee' = 'gardée'; 'geante' = 'géante'; 'guidee' = 'guidée'; 'identifiees' = 'identifiées'
    'implemente' = 'implémente'; 'isolees' = 'isolées'; 'lancee' = 'lancée'; 'marquee' = 'marquée'; 'masquee' = 'masquée'
    'matieres' = 'matières'; 'melanges' = 'mélanges'; 'posees' = 'posées'; 'prouvees' = 'prouvées'
    'publiee' = 'publiée'; 'representative' = 'représentative'; 'representent' = 'représentent'; 'respectee' = 'respectée'
    'absorbee' = 'absorbée'; 'adaptee' = 'adaptée'; 'ajustee' = 'ajustée'; 'bornee' = 'bornée'
    'branchees' = 'branchées'; 'calculee' = 'calculée'; 'cassees' = 'cassées'; 'centralisee' = 'centralisée'
    'chargee' = 'chargée'; 'ciblees' = 'ciblées'; 'communautes' = 'communautés'; 'comparees' = 'comparées'
    'configuree' = 'configurée'; 'conseillee' = 'conseillée'; 'creations' = 'créations'; 'demonstrative' = 'démonstrative'
    'depose' = 'dépose'; 'deriver' = 'dériver'; 'detache' = 'détache'; 'detruit' = 'détruit'
    'differencies' = 'différencies'; 'durees' = 'durées'; 'ecarte' = 'écarte'; 'echoues' = 'échoues'
    'economises' = 'économises'; 'elastique' = 'élastique'; 'embarquees' = 'embarquées'; 'emis' = 'émis'
    'enchaines' = 'enchaînes'; 'equipes' = 'équipes'; 'etend' = 'étend'; 'evitables' = 'évitables'; 'evitent' = 'évitent'
    'excedent' = 'excédent'; 'executent' = 'exécutent'; 'executions' = 'exécutions'; 'expliquees' = 'expliquées'
    'exposee' = 'exposée'; 'exterieure' = 'extérieure'; 'fideles' = 'fidèles'; 'fractionnee' = 'fractionnée'
    'frequentes' = 'fréquentes'; 'gache' = 'gâche'; 'gele' = 'gèle'; 'geres' = 'gères'; 'herite' = 'hérite'
    'importees' = 'importées'; 'imprimees' = 'imprimées'; 'independant' = 'indépendant'
    'installee' = 'installée'; 'installees' = 'installées'; 'interprete' = 'interprète'; 'inutilisees' = 'inutilisées'
    'inventee' = 'inventée'; 'iterative' = 'itérative'; 'livrees' = 'livrées'; 'maitrise' = 'maîtrise'
    'materielle' = 'matérielle'; 'millimetres' = 'millimètres'; 'modifiee' = 'modifiée'; 'nettoyee' = 'nettoyée'
    'normalisee' = 'normalisée'; 'particuliere' = 'particulière'; 'pensees' = 'pensées'; 'pere' = 'père'
    'placee' = 'placée'; 'preservent' = 'préservent'; 'prevue' = 'prévue'; 'rattachees' = 'rattachées'
    'reactive' = 'réactive'; 'reconstituees' = 'reconstituées'; 'recreait' = 'recréait'; 'recue' = 'reçue'
    'redige' = 'rédige'; 'reduite' = 'réduite'; 'regroupee' = 'regroupée'; 'regroupees' = 'regroupées'
    'rejouee' = 'rejouée'; 'releve' = 'relève'; 'repassee' = 'repassée'; 'resolue' = 'résolue'; 'resolues' = 'résolues'
    'restee' = 'restée'; 'securise' = 'sécurise'; 'serieuse' = 'sérieuse'; 'stabilisee' = 'stabilisée'
    'superieure' = 'supérieure'; 'symptomes' = 'symptômes'; 'tombee' = 'tombée'; 'trainait' = 'traînait'; 'verifiables' = 'vérifiables'
    'arriere' = 'arrière'; 'enleve' = 'enlève'; 'nettoye' = 'nettoyé'; 'pointille' = 'pointillé'
    'rejete' = 'rejeté'; 'selectionnes' = 'sélectionnes'
    'decomposition' = 'décomposition'; 'restructuree' = 'restructurée'; 'structurees' = 'structurées'
    'numero' = 'numéro'; 'numeros' = 'numéros'; 'comprehension' = 'compréhension'; 'hygiene' = 'hygiène'; 'fantome' = 'fantôme'; 'fantomes' = 'fantômes'
    'legerement' = 'légèrement'; 'sobriete' = 'sobriété'; 'recapitulatif' = 'récapitulatif'; 'realiste' = 'réaliste'; 'realistes' = 'réalistes'
    'declencher' = 'déclencher'; 'regulier' = 'régulier'; 'reguliere' = 'régulière'; 'lateral' = 'latéral'; 'laterale' = 'latérale'
    'energie' = 'énergie'; 'deborder' = 'déborder'; 'decoration' = 'décoration'; 'decorations' = 'décorations'; 'hebergeur' = 'hébergeur'
    'telephone' = 'téléphone'; 'telephones' = 'téléphones'; 'entete' = 'entête'; 'entetes' = 'entêtes'; 'arret' = 'arrêt'; 'arrets' = 'arrêts'
    'securiser' = 'sécuriser'; 'parite' = 'parité'; 'theorie' = 'théorie'; 'precisement' = 'précisément'; 'metrique' = 'métrique'; 'metriques' = 'métriques'
    'incomprehensible' = 'incompréhensible'; 'detection' = 'détection'; 'preference' = 'préférence'; 'preferences' = 'préférences'
    'acceleration' = 'accélération'; 'epuisement' = 'épuisement'; 'element' = 'élément'; 'elements' = 'éléments'; 'integral' = 'intégral'; 'integrale' = 'intégrale'
    'arrivee' = 'arrivée'; 'arrivees' = 'arrivées'; 'demarrer' = 'démarrer'; 'entierement' = 'entièrement'; 'incoherent' = 'incohérent'; 'incoherente' = 'incohérente'
    'thematisation' = 'thématisation'; 'numerotation' = 'numérotation'; 'clarte' = 'clarté'; 'desactiver' = 'désactiver'; 'epaisseur' = 'épaisseur'
    'regularisation' = 'régularisation'; 'productivite' = 'productivité'; 'selection' = 'sélection'; 'selections' = 'sélections'; 'pretexte' = 'prétexte'
    'tache' = 'tâche'; 'taches' = 'tâches'; 'debat' = 'débat'; 'debats' = 'débats'; 'possibilite' = 'possibilité'; 'possibilites' = 'possibilités'
    'fevrier' = 'février'; 'equivalent' = 'équivalent'; 'equivalente' = 'équivalente'; 'geographie' = 'géographie'; 'completer' = 'compléter'
    'specialisation' = 'spécialisation'; 'strategique' = 'stratégique'; 'strategiques' = 'stratégiques'; 'indefiniment' = 'indéfiniment'
    'eliminer' = 'éliminer'; 'memoriser' = 'mémoriser'; 'previsible' = 'prévisible'; 'repertoire' = 'répertoire'; 'representatif' = 'représentatif'
    'vecu' = 'vécu'; 'prevention' = 'prévention'; 'completion' = 'complétion'; 'quatrieme' = 'quatrième'; 'charniere' = 'charnière'
    'recent' = 'récent'; 'recente' = 'récente'; 'recurrent' = 'récurrent'; 'recurrente' = 'récurrente'; 'progres' = 'progrès'
    'trainer' = 'traîner'; 'economique' = 'économique'; 'economiques' = 'économiques'; 'periode' = 'période'; 'periodes' = 'périodes'
    'specifique' = 'spécifique'; 'specifiques' = 'spécifiques'; 'gravite' = 'gravité'; 'residuel' = 'résiduel'; 'residuelle' = 'résiduelle'
    'media' = 'média'; 'medias' = 'médias'; 'specification' = 'spécification'; 'specifications' = 'spécifications'
    'reutilisable' = 'réutilisable'; 'reutilisables' = 'réutilisables'; 'accessibilite' = 'accessibilité'; 'ameliorer' = 'améliorer'
    'definir' = 'définir'; 'granularite' = 'granularité'; 'demonstration' = 'démonstration'; 'aleatoire' = 'aléatoire'; 'aleatoires' = 'aléatoires'
    'complete' = 'complète'; 'completes' = 'complètes'; 'equilibre' = 'équilibre'; 'represente' = 'représente'; 'preserve' = 'préserve'; 'verifie' = 'vérifie'
    'separe' = 'sépare'; 'separent' = 'séparent'; 'decors' = 'décors'; 'deduite' = 'déduite'; 'laissees' = 'laissées'; 'bloquees' = 'bloquées'
    'simulee' = 'simulée'; 'commandee' = 'commandée'; 'commandées' = 'commandées'; 'pagines' = 'paginés'
    'deplacer' = 'déplacer'; 'competence' = 'compétence'; 'competences' = 'compétences'; 'exhaustivite' = 'exhaustivité'
    'lumiere' = 'lumière'; 'lumieres' = 'lumières'; 'reimpression' = 'réimpression'; 'transformee' = 'transformée'; 'transformees' = 'transformées'
    'depanner' = 'dépanner'; 'irreversible' = 'irréversible'; 'reconciliation' = 'réconciliation'; 'inquietant' = 'inquiétant'; 'inquietante' = 'inquiétante'
    'causalite' = 'causalité'; 'medical' = 'médical'; 'medicale' = 'médicale'; 'malgre' = 'malgré'; 'acceder' = 'accéder'
    'reglable' = 'réglable'; 'reglables' = 'réglables'; 'gouttiere' = 'gouttière'; 'decouper' = 'découper'; 'fleche' = 'flèche'; 'fleches' = 'flèches'
    'precision' = 'précision'; 'evidemment' = 'évidemment'; 'supplement' = 'supplément'; 'supplements' = 'suppléments'
    'generaliste' = 'généraliste'; 'generalistes' = 'généralistes'; 'controler' = 'contrôler'; 'delicat' = 'délicat'; 'delicate' = 'délicate'
    'serieusement' = 'sérieusement'; 'reveler' = 'révéler'; 'evaluation' = 'évaluation'; 'evaluations' = 'évaluations'; 'hesitation' = 'hésitation'
    'reinitialisation' = 'réinitialisation'; 'privilegier' = 'privilégier'; 'cloturer' = 'clôturer'; 'agreable' = 'agréable'; 'lineaire' = 'linéaire'
    'prealable' = 'préalable'; 'prealables' = 'préalables'; 'integrite' = 'intégrité'; 'decor' = 'décor'; 'verification' = 'vérification'
    'prefixe' = 'préfixe'; 'prefixes' = 'préfixes'; 'agregat' = 'agrégat'; 'agregats' = 'agrégats'; 'redecouvrir' = 'redécouvrir'
    'pedagogique' = 'pédagogique'; 'preservation' = 'préservation'; 'concretement' = 'concrètement'; 'representer' = 'représenter'
    'luminosite' = 'luminosité'; 'homothetie' = 'homothétie'; 'honnetement' = 'honnêtement'; 'scene' = 'scène'; 'scenes' = 'scènes'
    'reutiliser' = 'réutiliser'; 'mecanique' = 'mécanique'; 'telemetrie' = 'télémétrie'; 'conformite' = 'conformité'; 'inquietude' = 'inquiétude'
    'noeud' = 'nœud'; 'noeuds' = 'nœuds'; 'decisif' = 'décisif'; 'decisive' = 'décisive'; 'pieger' = 'piéger'; 'redeployer' = 'redéployer'
    'defilement' = 'défilement'; 'exasperation' = 'exaspération'; 'ideal' = 'idéal'; 'ideale' = 'idéale'; 'americain' = 'américain'; 'americaine' = 'américaine'
    'retrospectif' = 'rétrospectif'; 'retroactif' = 'rétroactif'; 'integralement' = 'intégralement'; 'verifiable' = 'vérifiable'
    'previsualisation' = 'prévisualisation'; 'etrange' = 'étrange'; 'residence' = 'résidence'; 'definition' = 'définition'; 'definitions' = 'définitions'
    'realigner' = 'réaligner'; 'pretendre' = 'prétendre'; 'tempete' = 'tempête'; 'intensite' = 'intensité'; 'experimental' = 'expérimental'
    'experimentale' = 'expérimentale'; 'complementaire' = 'complémentaire'; 'complementaires' = 'complémentaires'; 'decrire' = 'décrire'
    'edito' = 'édito'; 'memo' = 'mémo'; 'memos' = 'mémos'
  }
  foreach ($entry in $overrides.GetEnumerator()) { $lexicon[$entry.Key] = $entry.Value }
  return $lexicon
}

function Get-FrenchPastParticipleLexicon([System.IO.FileInfo[]]$Files) {
  $variants = @{}
  foreach ($file in $Files) {
    $sourceText = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
    foreach ($match in [regex]::Matches($sourceText, "[\p{L}œŒæÆ]+")) {
      $word = $match.Value.ToLowerInvariant()
      $plain = (Remove-FrenchDiacritics $word).ToLowerInvariant()
      if ($plain -eq $word) { continue }
      if (-not $variants.ContainsKey($plain)) { $variants[$plain] = [System.Collections.Generic.HashSet[string]]::new() }
      [void]$variants[$plain].Add($word)
    }
  }

  $lexicon = @{}
  foreach ($plain in $variants.Keys) {
    foreach ($expectedEnding in @('é', 'és', 'ée', 'ées')) {
      $matches = @($variants[$plain] | Where-Object { $_.EndsWith($expectedEnding, [System.StringComparison]::Ordinal) })
      if ($matches.Count -eq 1) {
        $lexicon[$plain] = $matches[0]
        break
      }
    }
  }
  return $lexicon
}

function Restore-FrenchDiacritics([string]$Text, [hashtable]$Lexicon, [hashtable]$PastParticiples) {
  $restored = [regex]::Replace($Text, '(?ms)```.*?```|`[^`\r\n]+`|https?://[^\s)]+|\]\([^)]+\)|(?<word>[\p{L}œŒæÆ]+)', {
      param($match)
      if (-not $match.Groups['word'].Success) { return $match.Value }
      $word = $match.Groups['word'].Value
      $plain = $word.ToLowerInvariant()
      if (-not $Lexicon.ContainsKey($plain)) { return $match.Value }
      if ($word -ceq 'CA') { return $match.Value }
      $replacement = [string]$Lexicon[$plain]
      if ($word -cmatch '^[A-ZÀ-ÖØ-ÞŒÆ]+$') { return $replacement.ToUpperInvariant() }
      if ($word -cmatch '^[A-ZÀ-ÖØ-ÞŒÆ]') {
        return $replacement.Substring(0, 1).ToUpperInvariant() + $replacement.Substring(1)
      }
      return $replacement
    })
  $restored = [regex]::Replace($restored, "(?i)(\b(?:jusqu|d|l))[’']ou\b", "`$1’où")
  $restored = [regex]::Replace($restored, '(?i)\b(des) que\b', 'dès que')
  $restored = [regex]::Replace($restored, '(?i)\best sauve\b', 'est sauvé')
  $restored = [regex]::Replace($restored, '(?i)\best livre\b', 'est livré')
  $restored = [regex]::Replace($restored, '(?i)\bobjets sont r[ée]f[ée]rences\b', 'objets sont référencés')
  $restored = [regex]::Replace($restored, '(?i)\bAgent utilise\s*:', 'Agent utilisé :')
  $restored = [regex]::Replace($restored, '(?i)\bTemps minimal observe\s*:', 'Temps minimal observé :')
  $restored = [regex]::Replace($restored, '(?i)\ba apporte\b', 'a apporté')
  $restored = [regex]::Replace($restored, '(?i)\ba tester\b', 'à tester')
  $restored = [regex]::Replace($restored, '(?i)\bou cree\b', 'ou crée')
  $restored = [regex]::Replace($restored, '(?i)\ba largeur\b', 'À largeur')
  $restored = [regex]::Replace($restored, '(?i)\baudit stockage conserve\b', 'audit stockage conservé')
  $restored = [regex]::Replace($restored, '(?i)\bjusque-la\b', 'jusque-là')
  $restored = [regex]::Replace($restored, '(?i)\btravail lie\b', 'travail lié')
  $restored = [regex]::Replace($restored, '(?i)\bcommits? (?:Git )?(?:non )?synthétiques? repères\b', { param($m) $m.Value -replace 'repères$', 'repérés' })
  $restored = [regex]::Replace($restored, '(?i)\bsera imprime\b', 'sera imprimé')
  $restored = [regex]::Replace($restored, '(?i)\bproduit assemble\b', 'produit assemblé')
  $restored = [regex]::Replace($restored, '(?i)\btableau borde\b', 'tableau bordé')
  $restored = [regex]::Replace($restored, '(?i)\bcadrage (?:reste )?documentaire et borne\b', { param($m) $m.Value -replace 'borne$', 'borné' })
  $restored = [regex]::Replace($restored, '(?i)\b(usage|ledger|fichier|payload) sépare\b', '$1 séparé')
  $restored = [regex]::Replace($restored, '(?i)\bpayload versionne\b', 'payload versionné')
  $restored = [regex]::Replace($restored, '(?i)\bimpacts?[^.\r\n]{0,80}\bajoutes\b', { param($m) $m.Value -replace 'ajoutes$', 'ajoutés' })
  $restored = [regex]::Replace($restored, '(?i)\b(?:prix|élément|commit) (?:est|a été) refuse\b', { param($m) $m.Value -replace 'refuse$', 'refusé' })
  $restored = [regex]::Replace($restored, '(?i)\bécarts trouves\b', 'écarts trouvés')
  $restored = [regex]::Replace($restored, '(?i)\b(?:ne sont|sont) pas pagines\b', { param($m) $m.Value -replace 'pagines$', 'paginés' })
  $restored = [regex]::Replace($restored, '(?i)\b(?:sont|ont été|seront) (ajoutes|trouves|refuses)\b', {
      param($m)
      return $m.Value.Replace('ajoutes', 'ajoutés').Replace('trouves', 'trouvés').Replace('refuses', 'refusés')
    })
  $restored = [regex]::Replace($restored, "(?i)\b(sert|consiste|oblige|continue|commence|reste|revient|vise|aide) a\b", '$1 à')
  $restored = [regex]::Replace($restored, "(?i)\b(a) (nommer|mieux|séparer|protéger|définir|corriger|tester|vérifier|rendre|conserver|éviter|remplir|choisir|partager|livrer|relier|mesurer|comprendre)\b", 'à $2')
  $restored = [regex]::Replace($restored, '(?i)\ba (chaque|cause|juste titre|Enter)\b', 'à $1')
  $restored = [regex]::Replace($restored, '(?i)\ba ce (stade|moment|ping)\b', 'à ce $1')
  $restored = [regex]::Replace($restored, "(?i)\b(a) (la|l[’']|une?\b|partir\b|travers\b|nouveau\b|droite\b|gauche\b|jour\b|cote\b|propos\b)", 'à $2')
  $restored = [regex]::Replace($restored, '(?i)\b(a) (?=\d{1,2}(?::|h)\d{2})', 'à ')
  $restored = [regex]::Replace($restored, '(?i)\b(?:chantier|objet|lot|cas|élément) isole\b', { param($m) $m.Value -replace 'isole$', 'isolé' })
  $restored = [regex]::Replace($restored, '(?i)\bAvancees concretes\b', 'Avancées concrètes')
  $restored = [regex]::Replace($restored, '(?i)\bproduits? imprimes\b', { param($m) $m.Value -replace 'imprimes$', 'imprimés' -replace 'imprime$', 'imprimé' })
  $restored = [regex]::Replace($restored, '(?i)\bclients(?<middle>[^.\r\n]{0,180})\bgenerent\b', { param($m) 'clients' + $m.Groups['middle'].Value + 'génèrent' })
  $restored = [regex]::Replace($restored, "(?i)\b(?:n['’]est|ne sont) pas lance(s)?\b", { param($m) $m.Value -replace 'lances$', 'lancés' -replace 'lance$', 'lancé' })
  $restored = [regex]::Replace($restored, '(?i)\bmal encapsule\b', 'mal encapsulé')
  $restored = [regex]::Replace($restored, '(?i)\b(CI|build|test|pipeline|workflow) a casse\b', '$1 a cassé')
  $restored = [regex]::Replace($restored, '(?i)\blockfile desynchronise\b', 'lockfile désynchronisé')
  $restored = [regex]::Replace($restored, '(?i)\bse desynchronise\b', 'se désynchronise')
  $restored = [regex]::Replace($restored, "(?i)\bCe qui s['’]est passe\b", "Ce qui s’est passé")
  $restored = [regex]::Replace($restored, '(?i)\b(store\s+Zustand|Zustand) gere\b', '$1 gère')
  $restored = [regex]::Replace($restored, '(?i)\bdes le\b', 'dès le')
  $restored = [regex]::Replace($restored, '(?i)\bforce a\b', 'force à')
  $restored = [regex]::Replace($restored, "(?i)\bqu['’]a taper\b", "qu’à taper")
  $restored = [regex]::Replace($restored, '(?i)\baurait du\b', 'aurait dû')
  $restored = [regex]::Replace($restored, '(?i)\bpas lance avant\b', 'pas lancé avant')
  $restored = [regex]::Replace($restored, '(?i)\bSaaS ou les clients\b', 'SaaS où les clients')
  $restored = [regex]::Replace($restored, '(?i)\bon connait\b', 'on connaît')
  # « revele » est ambigu sans contexte : présent « révèle », participe « révélé ».
  # Les auxiliaires tranchent les participes ; les autres occurrences sont des présents,
  # à l'exception explicite du risque « révélé la veille ».
  $restored = [regex]::Replace($restored, "(?i)\b(?<aux>a|ont|avait|avaient|aurait|aura|avaient|n['’]a|n['’]ont)(?<middle>\s+(?:(?:pas|aussi|déjà|immédiatement|surtout)\s+)*)revele\b", {
      param($match)
      return $match.Groups['aux'].Value + $match.Groups['middle'].Value + 'révélé'
    })
  $restored = [regex]::Replace($restored, '(?i)\brisque revele la veille\b', 'risque révélé la veille')
  $restored = [regex]::Replace($restored, '(?i)\brevele\b', 'révèle')
  $restored = [regex]::Replace($restored, '(?i)\bdocumentation est\.\.\. creative\b', 'documentation est… créative')
  $restored = [regex]::Replace($restored, '(?i)\b(et|puis) On enchaîne\b', '$1 on enchaîne')
  $restored = [regex]::Replace($restored, '(?i): On enchaîne\b', ': on enchaîne')
  $restored = [regex]::Replace($restored, '(?i)\bmoment-la\b', 'moment-là')
  $restored = [regex]::Replace($restored, '(?i)\b(on|il|elle) à\b', '$1 a')
  # Après « avoir », un mot en -e/-es est un participe, pas un présent.
  # Le lexique choisit uniquement une forme accentuée déjà attestée dans le corpus.
  $restored = [regex]::Replace($restored, "(?i)(?<aux>\b(?:ai|as|a|avons|avez|ont|avait|avaient|aurait|auraient|aura|n['’]a|n['’]ont)\b)(?<middle>\s+(?:(?:pas|plus|aussi|déjà|bien|encore|finalement|immédiatement|largement|simplement|ensuite|souvent|toujours|clairement|presque|mal|juste)\s+)*)(?<word>[\p{L}œŒæÆ]+)", {
      param($match)
      $plain = (Remove-FrenchDiacritics $match.Groups['word'].Value).ToLowerInvariant()
      if (-not $PastParticiples.ContainsKey($plain)) { return $match.Value }
      return $match.Groups['aux'].Value + $match.Groups['middle'].Value + [string]$PastParticiples[$plain]
    })
  $restored = [regex]::Replace($restored, "(?i)(?<aux>\b(?:être|été)\b)(?<middle>\s+(?:(?:pas|plus|aussi|déjà|bien|encore|finalement|immédiatement|largement|simplement|ensuite|souvent|toujours|clairement|presque|mal|juste)\s+)*)(?<word>[\p{L}œŒæÆ]+)", {
      param($match)
      $plain = (Remove-FrenchDiacritics $match.Groups['word'].Value).ToLowerInvariant()
      if (-not $PastParticiples.ContainsKey($plain)) { return $match.Value }
      return $match.Groups['aux'].Value + $match.Groups['middle'].Value + [string]$PastParticiples[$plain]
    })
  $copularAmbiguities = [System.Collections.Generic.HashSet[string]]::new(
    [string[]]@('valide', 'ferme', 'risque', 'simple', 'propre', 'juste', 'possible', 'double', 'utile', 'libre', 'rapide', 'souple', 'dense', 'large', 'proche'),
    [System.StringComparer]::OrdinalIgnoreCase
  )
  $restored = [regex]::Replace($restored, "(?i)(?<aux>\b(?:est|sont|était|étaient|sera|seront)\b)(?<middle>\s+(?:(?:pas|plus|aussi|déjà|bien|encore|finalement|immédiatement|largement|simplement|ensuite|souvent|toujours|clairement|presque|mal|juste)\s+)*)(?<word>[\p{L}œŒæÆ]+)", {
      param($match)
      $plain = (Remove-FrenchDiacritics $match.Groups['word'].Value).ToLowerInvariant()
      if ($copularAmbiguities.Contains($plain) -or -not $PastParticiples.ContainsKey($plain)) { return $match.Value }
      return $match.Groups['aux'].Value + $match.Groups['middle'].Value + [string]$PastParticiples[$plain]
    })
  $restored = [regex]::Replace($restored, '(?i)\bbien avance\b', 'bien avancé')
  $restored = [regex]::Replace($restored, '(?i)\bfichiers touches\b', 'fichiers touchés')
  $restored = [regex]::Replace($restored, '(?i)\bbucket R2 est copie\b', 'bucket R2 est copié')
  $restored = [regex]::Replace($restored, '(?i)\bvolume observe\b', 'volume observé')
  $restored = [regex]::Replace($restored, '(?i)\bcomptages sont verifies\b', 'comptages sont vérifiés')
  $restored = [regex]::Replace($restored, "(?i)\bd['’]être purges\b", "d'être purgés")
  $restored = [regex]::Replace($restored, '(?i)\bmarqueur persiste\b', 'marqueur persisté')
  $restored = [regex]::Replace($restored, '(?i)\bobjets sont copies\b', 'objets sont copiés')
  $restored = [regex]::Replace($restored, '(?i)\ba exerce\b', 'a exercé')
  $restored = [regex]::Replace($restored, '(?i)\ba environ\b', 'à environ')
  $restored = [regex]::Replace($restored, '^\s*à ', 'À ')
  return $restored
}

function Move-CumulativeTimeToEnd([string]$Body) {
  $section = [regex]::Match($Body, '(?ms)^## Horaires de session\s*\r?\n(?<items>.*?)(?=^## |\z)')
  if (-not $section.Success) { return $Body }
  $lines = $section.Groups['items'].Value -split '\r?\n'
  $timeLine = $lines | Where-Object { $_ -match '^-\s*Temps cumulé minimal depuis le début du journal\s*:' } | Select-Object -First 1
  if (-not $timeLine) { return $Body }
  $contentLines = @($lines | Where-Object { $_ -ne $timeLine -and $_ -ne '' }) + $timeLine
  $reordered = @('') + $contentLines + @('', '')
  return $Body.Substring(0, $section.Groups['items'].Index) + ($reordered -join "`n") + $Body.Substring($section.Groups['items'].Index + $section.Groups['items'].Length)
}

function Protect-PublicInfrastructureDetails([string]$Text) {
  $protected = $Text

  # Garder le nom du dépôt utile au récit, sans publier le chemin du poste.
  $protected = [regex]::Replace($protected, '/(?:home|Users)/marc/code/([A-Za-z0-9._-]+)', 'dépôt local $1')

  # Une destination distante doit être traitée avant son IP, sinon le compte
  # resterait visible sous la forme « utilisateur@[adresse IP] ».
  $protected = [regex]::Replace($protected, '(?im)^(?=[^\r\n]*(?:SSH|SCP|SFTP|rsync|synchronis(?:e|ation)|destination\s+(?:distante|SSH)|connexion\s+(?:distante|SSH)))(?<before>[^\r\n]*?)(?<account>[a-z_][a-z0-9._-]*)@(?<host>(?:\d{1,3}\.){3}\d{1,3}|\[[^\]\r\n]+\]|[a-z0-9](?:[a-z0-9._-]*[a-z0-9_-])?)', {
      param($match)
      return $match.Groups['before'].Value + '[compte]@[hôte]'
    })

  $protected = [regex]::Replace($protected, 'https?://(?:127\.0\.0\.1|localhost)(?::\d+)?[^\s`)\]]*', 'adresse locale')
  $protected = [regex]::Replace($protected, '(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)', '[adresse IP]')
  $protected = [regex]::Replace($protected, '\b[A-Za-z0-9._%+-]+@ooblik\.com\b', '[compte OOBLIK retiré]')

  # Les chemins système génériques restent lisibles, mais leurs comptes,
  # applications, sauvegardes et noms de fichiers ne sont pas publics.
  $protected = [regex]::Replace($protected, '(?i)(?<![A-Za-z0-9._-])/(?:home|Users)/(?!\[compte\])[^/\s`"''<>)\],;]+(?:/[^\s`"''<>)\],;]+)*', {
      param($match)
      $suffix = if ($match.Value -match '[.,;:]$') { $match.Value.Substring($match.Value.Length - 1) } else { '' }
      return '/home/[compte]/[chemin privé]' + $suffix
    })
  $protected = [regex]::Replace($protected, '(?i)(?<![A-Za-z0-9._-])/(?<root>root|opt|srv)/(?!\[chemin privé\])[^\s`"''<>)\],;]+', {
      param($match)
      $suffix = if ($match.Value -match '[.,;:]$') { $match.Value.Substring($match.Value.Length - 1) } else { '' }
      return '/' + $match.Groups['root'].Value.ToLowerInvariant() + '/[chemin privé]' + $suffix
    })
  $protected = [regex]::Replace($protected, '(?i)\b[A-Z]:\\Users\\[^\s`"''<>)\],;]+', '[chemin local]')

  # Un identifiant placé après un rôle d'infrastructure est un nom de machine,
  # contrairement à « VPS KEREDIT » ou « serveur GOF » qui restent de la prose.
  $protected = [regex]::Replace($protected, '(?<role>\b(?i:VPS|serveur|hostname|hôte|NAS|forge)\s+(?:(?i:KEREDIT|GOF)\s+)?(?:(?i:nommé[e]?)\s+)?)`(?!\[nom privé\])(?<name>[a-z0-9][a-z0-9._-]*)`', '${role}`[nom privé]`')
  $protected = [regex]::Replace($protected, '(?im)^(?=[^\r\n]*(?:environnement|comme source))(?<before>[^\r\n]*?\bVPS\s+)(?<name>[A-Za-z0-9][A-Za-z0-9._-]*)', {
      param($match)
      if ($match.Groups['name'].Value -in @('KEREDIT', 'GOF', 'Hetzner', 'bêta')) { return $match.Value }
      return $match.Groups['before'].Value + '[nom privé]'
    })

  # Ne masquer un libellé de clé que si la ligne parle réellement d'accès SSH.
  $protected = [regex]::Replace($protected, '(?im)^(?<line>(?=[^\r\n]*(?:SSH|authorized_keys|IdentityFile))[^\r\n]*)$', {
      param($match)
      return [regex]::Replace($match.Groups['line'].Value, '(?i)(?<label>\b(?:clés?|clefs?|keys?)\s+)`(?!\[libellé privé\])[^`\r\n]+`', '${label}`[libellé privé]`')
    })

  return $protected
}

function Convert-PublicBody([string]$Body) {
  $publicBody = $Body.TrimStart()
  $publicBody = [regex]::Replace($publicBody, '(?m)^# .+\r?\n+', '')
  $publicBody = [regex]::Replace($publicBody, '\[([^\]]+)\]\(\.\./[^)]+\.md\)', '$1')
  $publicBody = Protect-PublicInfrastructureDetails $publicBody
  return $publicBody.Trim() + "`n"
}

$entries = Get-ChildItem -LiteralPath $source -File -Filter "2026-??-??.md" | Sort-Object Name
if ($entries.Count -eq 0) { throw "Aucun billet daté trouvé dans $source." }
$diacriticLexicon = Get-FrenchDiacriticLexicon $entries
$pastParticipleLexicon = Get-FrenchPastParticipleLexicon $entries

if ($RepairFrench -and $CheckFrench) {
  throw "Utiliser soit -RepairFrench, soit -CheckFrench."
}

if ($RepairFrench -or $CheckFrench) {
  $publishedEntries = Get-ChildItem -LiteralPath $destination -File -Filter "2026-??-??.md" | Sort-Object Name
  $pastParticipleLexicon = Get-FrenchPastParticipleLexicon @($entries + $publishedEntries)
  $changedEntries = [System.Collections.Generic.List[string]]::new()
  foreach ($publishedEntry in $publishedEntries) {
    $current = Get-Content -LiteralPath $publishedEntry.FullName -Raw -Encoding UTF8
    $restored = Restore-FrenchDiacritics $current $diacriticLexicon $pastParticipleLexicon
    if ($restored -ceq $current) { continue }
    $changedEntries.Add($publishedEntry.Name)
    if ($RepairFrench) {
      [System.IO.File]::WriteAllText($publishedEntry.FullName, $restored, [System.Text.UTF8Encoding]::new($false))
    }
  }
  if ($CheckFrench -and $changedEntries.Count -gt 0) {
    throw "Accents français à restaurer dans $($changedEntries.Count) billet(s) : $($changedEntries -join ', ')."
  }
  $action = if ($RepairFrench) { 'réparés' } else { 'contrôlés' }
  Write-Output "Accents français : $($publishedEntries.Count) billets $action, $($changedEntries.Count) fichier(s) modifié(s)."
  return
}

foreach ($entry in $entries) {
  $raw = Get-Content -LiteralPath $entry.FullName -Raw -Encoding UTF8
  $tomlBlock = [regex]::Match($raw, '(?ms)^\+\+\+\r?\n(.*?)^\+\+\+\r?\n')
  if ($tomlBlock.Success) {
    $sourceFrontMatter = $tomlBlock.Groups[1].Value
    $title = Get-TomlValue $sourceFrontMatter 'title'
    $description = Get-TomlValue $sourceFrontMatter 'description'
    $dateMatch = [regex]::Match($sourceFrontMatter, '(?m)^date\s*=\s*(\d{4}-\d{2}-\d{2})\s*$')
    $tagsMatch = [regex]::Match($sourceFrontMatter, '(?m)^tags\s*=\s*\[(.*)\]\s*$')
    $bodyStart = $tomlBlock.Index + $tomlBlock.Length
  } else {
    $yamlBlock = [regex]::Match($raw, '(?ms)^---\r?\n(.*?)^---\r?\n')
    if (-not $yamlBlock.Success) { throw "Front matter introuvable dans $($entry.Name)." }
    $sourceFrontMatter = $yamlBlock.Groups[1].Value
    $titleMatch = [regex]::Match($sourceFrontMatter, '(?m)^title:\s*["'']?(.*?)["'']?\s*$')
    $descriptionMatch = [regex]::Match($sourceFrontMatter, '(?m)^description:\s*["'']?(.*?)["'']?\s*$')
    $dateMatch = [regex]::Match($sourceFrontMatter, '(?m)^date:\s*(\d{4}-\d{2}-\d{2})\s*$')
    $tagsMatch = [regex]::Match($sourceFrontMatter, '(?m)^tags:\s*\[(.*)\]\s*$')
    $title = if ($titleMatch.Success) { $titleMatch.Groups[1].Value } else { $null }
    $description = if ($descriptionMatch.Success) { $descriptionMatch.Groups[1].Value } else { $null }
    $bodyStart = $yamlBlock.Index + $yamlBlock.Length
  }

  if (-not $title -or -not $description -or -not $dateMatch.Success) {
    throw "Métadonnées de publication incomplètes dans $($entry.Name)."
  }

  $tags = @()
  if ($tagsMatch.Success) {
    $tags = $tagsMatch.Groups[1].Value -split ',' | ForEach-Object { $_.Trim().Trim('"').Trim("'") } | Where-Object { $_ }
  }

  $title = Protect-PublicInfrastructureDetails (Restore-FrenchDiacritics $title $diacriticLexicon $pastParticipleLexicon)
  $description = Protect-PublicInfrastructureDetails (Restore-FrenchDiacritics $description $diacriticLexicon $pastParticipleLexicon)
  $tags = @($tags | ForEach-Object { Restore-FrenchDiacritics $_ $diacriticLexicon $pastParticipleLexicon })
  $body = Restore-FrenchDiacritics (Convert-PublicBody $raw.Substring($bodyStart)) $diacriticLexicon $pastParticipleLexicon
  $body = Move-CumulativeTimeToEnd $body
  $draft = if ($Publish) { 'false' } else { 'true' }
  $tagYaml = ($tags | ForEach-Object { ConvertTo-YamlString $_ }) -join ', '
  $frontMatter = @(
    '---'
    "title: $(ConvertTo-YamlString $title)"
    "date: $($dateMatch.Groups[1].Value)"
    "description: $(ConvertTo-YamlString $description)"
    'layout: "procrastinateur-single"'
    'type: "journal-procrastinateur"'
    "draft: $draft"
    "source_path: $(ConvertTo-YamlString ("docs/blog/" + $entry.Name))"
    "tags: [$tagYaml]"
    '---'
    ''
  ) -join "`n"

  $target = Join-Path $destination $entry.Name
  [System.IO.File]::WriteAllText($target, $frontMatter + $body, [System.Text.UTF8Encoding]::new($false))
}

Write-Output "Import terminé : $($entries.Count) billets vers $destination (draft=$(-not $Publish))."

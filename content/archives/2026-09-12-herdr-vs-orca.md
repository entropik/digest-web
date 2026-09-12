---
title: "Testé pour vous : Herdr, le multiplexeur d’agents en TUI — et pourquoi je reste sur Orca"
date: 2026-09-12
digest_date: "2026-09-12"
editorial_type: "focus"
images:
  - "/social/2026-09-12-herdr-vs-orca.png"
archive_image: "/social/focus-archives/2026-03-30.jpg"
link_urls:
  - "https://github.com/herdrdev/herdr"
  - "https://github.com/stablyai/orca"
description: "Herdr promet un tmux moderne et mouse-first dédié aux flottes d’agents dans le terminal. Après l’avoir installé, configuré et confronté à une équipe réelle (Kimi Code, Antigravity), retour d’expérience sans fard sur ses atouts, ses bugs d’accueil et la raison pour laquelle Orca reste indéboulonnable en production."
---

> **Contexte de banc d'essai :** Flotte d'agents hétérogènes (*Kimi Code, Antigravity, Claude Code, Codex*), environnement macOS Apple Silicon, machine de travail en production avec chantiers parallèles.

Sur mon poste, le développement ne ressemble plus depuis longtemps à une session solitaire dans un éditeur. C’est devenu un atelier bruyant où tournent simultanément plusieurs agents de code : Kimi Code sur une refonte d'API, Antigravity sur l'architecture et les arbitrages, Codex ou Claude en renfort sur des scripts d'appoint.

Dans cet écosystème, la gestion spatiale et cognitive des agents est devenue le nerf de la guerre. Alors quand la communauté s'est mise à bruisser autour de **[Herdr](https://github.com/herdrdev/herdr)**, présenté comme *« le multiplexeur d’agents qui vit dans votre terminal »*, ma curiosité d'artisan a pris le dessus. Un outil 100 % terminal, open source, pensé pour piloter ses IA sans quitter son shell ? Sur le papier, la promesse est séduisante.

Binaire installé via Homebrew, démon configuré, agents branchés. Voici le retour d'expérience complet — et pourquoi, malgré ses charmes indéniables, il ne détrônera pas [Orca](https://github.com/stablyai/orca) sur ma machine de production.

---

## Ce qu’est Herdr (et ce qu'il réussit très bien)

Herdr *(testé en version 0.9.0, sous licence Apache-2.0)* se positionne comme une alternative moderne à tmux, taillée sur mesure pour l’ère des agents autonomes.

Le concept de base est limpide : vous offrir un découpage de terminal en panneaux (*panes*), une barre latérale dédiée qui surveille l'activité de vos agents, et un serveur local persistant qui garantit que vos processus continuent de tourner même si vous fermez la fenêtre ou perdez votre session SSH.

### Les vrais points forts constatés :

* **Léger et immédiat à déployer :** Un simple `brew install herdr` et l'outil est là. Zéro runtime Electron obèse, zéro dépendance ésotérique. C'est du terminal pur, rapide et sobre.
* **Une hiérarchie mentale limpide :** Le modèle structurel `Session → Workspace → Tab → Pane` se prend en main en deux minutes. La persistance est irréprochable : détachez-vous, fermez le terminal, revenez trois heures plus tard, vos agents ont continué leur besogne sans sourciller.
* **Le confort du « mouse-native » :** Pour ceux qui ont développé une phobie clinique des combinaisons `Ctrl+b` de tmux, Herdr fait un bien fou : tout est cliquable d'emblée à la souris. On redimensionne les séparateurs, on change d'onglet et on navigue sans devoir réapprendre un piano de raccourcis.
* **L'excellente idée des intégrations par hooks :** Plutôt que de scraper bêtement le rendu d'écran pour deviner si l'agent a terminé ou s'il attend une réponse, Herdr injecte de vrais hooks dans les CLI (`herdr integration install kimi`). L'état remonté dans la sidebar (*working*, *blocked*, *done*) est donc déterministe et fiable. C'est propre, bien pensé et robuste.
* **Scriptabilité et doc méta :** Une API socket et un CLI complet permettent d'automatiser des scénarios d'ouverture. Mention spéciale à la documentation, qui intègre un guide rédigé pour les agents IA eux-mêmes lorsqu'on leur demande d'installer l'outil. Malin.

---

## L'épreuve du feu : les frictions vécues à l'allumage

Mais entre la vidéo de démonstration sur GitHub et la vraie vie d’un Mac de développement bien chargé, il y a toujours ce moment où la réalité vous rattrape à la clé de douze.

> **Le grand mystère du PATH de launchd :**  
> Sitôt le démon configuré en service d'arrière-plan macOS, premier écran de configuration des intégrations… et un festival de mentions *« Not found »* pour l’ensemble de mes outils CLI. Pourquoi ? Parce que le service lancé par `launchd` hérite d'un environnement système minimaliste (`/usr/bin:/bin`) et ignore superbement vos exports Homebrew (`/opt/homebrew/bin`) ou vos chemins locaux (`~/.local/bin`). Pour un utilisateur chevronné, cela se règle en patchant le service ; pour un débutant qui venait simplement tester un outil branché, l'expérience est franchement hostile.

* **Le bug de bienvenue qui calme :** Premier lancement du client TUI : interface propre, séparateurs nets… mais clavier totalement inopérant dans le panneau actif. Impossible de saisir une commande. Un redémarrage complet du client a réglé le problème, mais ce genre de bug d'accueil à la première minute de prise en main laisse toujours une petite sueur froide sur la maturité de la v0.9.
* **Le syndrome tmux refoulé :** Bien que « mouse-first », Herdr traîne derrière lui l'héritage modal des multiplexeurs classiques (*terminal / prefix / navigate*). Dès qu'on quitte la souris pour naviguer au clavier ou copier-coller un bloc de code sans casser la session, la gymnastique mentale réapparaît.

---

## En face : Orca, mon quotidien d’orchestration

Pour comprendre pourquoi la greffe n'a pas pris durablement, il faut regarder ce que fait mon *daily driver* : **Orca**.

Herdr résout un problème d'**affichage de terminal**. Orca résout un problème de **contexte de travail**.

Dans Orca, un agent n'est pas simplement un processus jeté dans un rectangle de 80 colonnes par 24 lignes. Chaque agent dispose :
* D’un **worktree Git hermétique** : Kimi et Antigravity peuvent modifier le même dépôt simultanément sans jamais s'écraser les fichiers ni se disputer l'index Git.
* D’un **suivi contextuel global** : branche dédiée, variables d’environnement isolées, terminaux associés.
* De mécanismes de **handoff natifs** : passer le relais d'un agent d'exploration à un agent de refactorisation en transférant les artefacts et les conclusions.
* D'outils intégrés : navigateur piloté embarqué, inspection visuelle des diffs avant validation, skills partagés et automatisations de tâches.

---

## Le face-à-face technique

| Dimension | **[Herdr](https://github.com/herdrdev/herdr)** | **[Orca](https://github.com/stablyai/orca)** |
| :--- | :--- | :--- |
| **Nature** | Multiplexeur TUI de terminal | Cockpit & plateforme d’orchestration (*App + CLI*) |
| **Isolation des agents** | Panneaux (*panes*) dans un shell partagé | **Worktrees Git dédiés** (*chaque agent a son clone/branche*) |
| **Suivi d'état** | ✅ Hooks CLI + sidebar (*working / blocked / done*) | ✅ Cartes de tâches, statuts, historique visuel |
| **Handoff inter-agents** | ❌ Manuel (*copier-coller ou fichier intermédiaire*) | ✅ **Natif** (*passage de relais structuré*) |
| **Automatisations** | Via scripts shell & socket API | ✅ Intégrées au workflow de projet |
| **Navigateur & visuels** | ❌ Aucun (*pur terminal*) | ✅ Navigateur embarqué & comparaison de diffs |
| **Maturité** | v0.9.0 (*prometteur, mais jeune*) | Éprouvé en production quotidienne |
| **Public cible** | Développeurs 100 % TUI, sessions légères | Équipes et power users multi-agents |
| **Modèle économique** | Gratuit & Open Source (*Apache-2.0*) | Open Source (*cœur MIT*) |

---

## Le duel d'arène : Fiche de combat Shōnen Databook ⚔️

Pour les nostalgiques des grilles de caractéristiques du *Weekly Shōnen Jump* et des fiches de tournoi d'arts martiaux, voici la lecture du combat au scanner de puissance :

| Statistique / Attribut | 🥷 **[Herdr](https://github.com/herdrdev/herdr)** (*Le Rōnin du TUI*) | 🛸 **[Orca](https://github.com/stablyai/orca)** (*Le Léviathan de la Flotte*) |
| :--- | :--- | :--- |
| **Archétype** | Le bretteur solitaire et agile qui vit caché dans la pénombre du shell. | L'amiral de cuirassé spatial commandant une armada d'androïdes de guerre. |
| **École de combat** | *Style des Quatre Panneaux Félins* : trancher l'écran à la vitesse de l'éclair sans jamais quitter le terminal. | *Technique Dimensionnelle du Worktree* : séparer l'espace-temps Git pour que personne ne se marche sur les pieds. |
| **Technique Secrète (*Ougi*)** | **« Hook Déterministe no Jutsu »** : frappe chirurgicale dans les entrailles du CLI pour connaître son statut sans deviner l'écran. | **« Téléportation Astrale du Handoff »** : transfère l'âme et les artefacts d'un agent vers un autre sans perdre un seul token. |
| **Arme de prédilection** | Une lame ultra-légère forgée en Rust, affûtée au clic de souris. | Un poste de pilotage multi-écrans avec navigateur Chromium embarqué et scanner de diffs. |
| **Vitesse d'invocation** | **Rang S** : `brew install herdr` et le combattant surgit en deux secondes chrono. | **Rang B** : Déploiement d'un vrai poste de commandement qui demande de la place sur le pont. |
| **Talon d'Achille (*Kryptonite*)** | **La Malédiction du launchd PATH** : s'évanouit mystérieusement si le démon macOS se réveille sans les binaires Homebrew. | **L'appétit du Titan** : exige un poste costaud pour faire tourner flottes, navigateurs et worktrees sans broncher. |
| **Cri de guerre dans l'arène** | *« Nani ?! Qui a osé bloquer la saisie de mon clavier au premier tour ?! »* | *« Tu croyais pouvoir modifier mon `main` en douce ? Prends ce worktree hermétique ! »* |
| **Power Level (Combat réel)** | **7 500** *(Idéal pour terrasser les démons du SSH en duel).* | **95 000** *(Capacité de destruction massive sur les gros chantiers de prod).* |
| **Décision des juges** | Jeune aspirant très prometteur, qualifié pour l'examen des Chūnin du terminal. | **Champion invaincu de la ligue Pro.** Garde sa ceinture en titre. |

---

## Le verdict : outil séduisant, mais pas le bon niveau d'abstraction

Herdr est un projet honnête, attachant et bien pensé. Si vous travaillez exclusivement en SSH sur un serveur distant, si vous refusez d'ouvrir autre chose qu'un terminal et si votre besoin se résume à : *« faire tourner deux ou trois agents dans des terminaux qui ne meurent pas quand je ferme mon Mac portable »*, Herdr est une excellente alternative aux vieux scripts tmux artisanaux. La hype autour de son lancement est méritée pour quiconque découvre la joie de paralléliser ses agents.

Mais dès que l'on pratique le multi-agents intensif en production sur de gros projets, **le multiplexeur de terminaux montre ses limites architecturales**.

L'enjeu n'est pas de voir quatre fenêtres clignoter en même temps : l'enjeu est d'**isoler le code**. Faire travailler deux agents dans le même répertoire sans worktrees Git, c'est l'assurance d'avoir des conflits de fichiers, des caches de build pollués et des commits croisés ingérables.

> **Conclusion de l'artisan :**  
> **Gagnant de cœur et d'atelier : Orca.** Herdr mérite qu'on garde un œil bienveillant sur son évolution au fil des versions, mais pour mon flux de travail quotidien, il n'y aura pas de migration.

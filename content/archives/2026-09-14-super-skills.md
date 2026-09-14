---
title: "Super skills, specs et harnais : qui disciplinera les agents de code ?"
date: 2026-09-14
digest_date: "2026-09-14"
editorial_type: "focus"
images:
  - "/social/2026-09-14-super-skills.png"
archive_image: "/social/focus-archives/2026-03-19.jpg"
link_urls:
  - "https://github.com/obra/superpowers"
  - "https://github.com/mattpocock/skills"
  - "https://github.com/backnotprop/pstack"
  - "https://github.com/github/spec-kit"
  - "https://github.com/ai-driven-dev/framework"
  - "https://marmelab.com/blog/2025/11/12/spec-driven-development-waterfall-strikes-back.html"
  - "https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html"
  - "https://mitchellh.com/writing/my-ai-adoption-journey"
  - "https://addyosmani.com/blog/agentic-engineering/"
  - "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents"
  - "https://www.anthropic.com/news/skills"
  - "https://blog.fsck.com/2026/03/09/superpowers-5"
description: "Skills composables, spec-driven development, harness engineering : en un an, toute une industrie des « super skills » promet de discipliner les agents de code. Panorama des camps (Superpowers, Matt Pocock, pstack, Spec Kit, ai-driven-dev), des critiques réelles et de ce qu'il faut vraiment adopter."
---

> **Note d'atelier :** ce dossier s'appuie sur une recherche documentaire complète menée le jour même, conservée dans `docs/research/2026-09-14-super-skills-agentic-engineering.md`. Tous les chiffres d'adoption cités proviennent de l'API GitHub au 14 septembre 2026, et chaque critique mentionnée renvoie à sa voix d'origine.

Il y a un an, on parlait encore de *prompt engineering* : l'art de bien formuler sa requête. Puis Anthropic a consacré le [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) en septembre 2025 — gérer tout l'état informationnel de l'agent, pas seulement le prompt. Début 2026, Addy Osmani publiait son manifeste de l'[agentic engineering](https://addyosmani.com/blog/agentic-engineering/), et une semaine plus tard Mitchell Hashimoto, cofondateur de HashiCorp, introduisait le terme [*harness engineering*](https://mitchellh.com/writing/my-ai-adoption-journey) : chaque erreur de l'agent doit être convertie en solution d'ingénierie permanente — AGENTS.md, outillage, déterminisme — plutôt qu'en nouveau prompt. OpenAI reprenait le mot six jours après.

Trois renommages en un an. Derrière ce jeu de chaises musicales lexical se cache un vrai mouvement de fond : **la discipline du développement assisté par IA est en train de s'industrialiser**, et tout une offre de « super skills » — bibliothèques de compétences, frameworks de gouvernance, méthodologies de spécification — promet de transformer nos agents turbulents en ouvriers disciplinés.

J'utilise moi-même ces artefacts au quotidien : ce site est piloté par un `AGENTS.md` éditorial et une boîte de skills maison. Alors quand la mode s'emballe, l'artisan sort son pied à coulisse. Panorama des camps, des promesses, des critiques — et de ce qui mérite vraiment d'entrer dans l'atelier.

---

## Le déclencheur : les Agent Skills deviennent un standard

Le point de bascule date d'octobre 2025. Anthropic annonce les [Agent Skills](https://www.anthropic.com/news/skills) — de simples dossiers d'instructions et de scripts que l'agent charge « à la demande » — puis en fait un standard ouvert deux mois plus tard. Le format est trivial : du Markdown, un manifeste, des scripts. C'est précisément cette trivialité qui a tout déclenché : n'importe quelle équipe pouvait désormais **versionner ses conventions comme du code** et les distribuer à ses agents.

Dans la foulée, l'écosystème s'est structuré en deux camps doctrinaux bien distincts.

---

## Le camp « process » : la discipline imposée par le pipeline

### Superpowers, le phénomène

Difficile de surestimer [obra/superpowers](https://github.com/obra/superpowers) : **286 389 étoiles** et 25 621 forks en onze mois d'existence, une place dans le marketplace officiel d'Anthropic, une diffusion sur plus de quinze harnais (Claude Code, Codex, Cursor, Gemini CLI, Kimi Code…), une recommandation de Simon Willison dès le lendemain de l'annonce.

Jesse Vincent — créateur de Request Tracker, ancien release manager de Perl 5 — n'a pas écrit une collection de trucs et astuces mais **une méthodologie complète** : brainstorming socratique avant toute ligne de code, worktrees Git, plan d'implémentation « suffisamment clair pour un junior sans jugement », *subagent-driven development*, TDD strict RED-GREEN-REFACTOR (le skill supprime le code écrit avant les tests), revue à deux étages. Le credo est affiché : *« Evidence over claims »* — l'agent n'a pas le droit de déclarer victoire sans preuve d'exécution.

**Ce qui plaît :** la discipline TDD réellement imposée, la vérification avant complétion, l'autonomie longue — Vincent raconte des sessions de plusieurs heures sans dérive, y compris en [parallèle massif](https://blog.fsck.com/2026/03/09/superpowers-5).

**Ce qui grince :** le fil Hacker News d'origine (435 points) regorge de réserves de fond. Les méga-instructions en capitales du type `<EXTREMELY_IMPORTANT>` posent un vrai problème de conflit de priorités avec celles de l'utilisateur ; la persuasion théâtrale est jugée datée (« les modèles suivent simplement les instructions ») ; et surtout, **personne n'a démontré comparativement l'apport réel** — avec skills contre sans skills, à modèle égal. Ajoutez le surcoût en tokens, une télémétrie activée par défaut (désactivable), et un pipeline TDD en sept phases que certains trouvent rigide.

### Spec Kit et le spec-driven development

L'autre bras du camp process, c'est la spécification. GitHub a lancé [spec-kit](https://github.com/github/spec-kit) en septembre 2025 — **136 576 étoiles** aujourd'hui, version 1.0.0 un an après le premier commit — avec un pipeline en quatre phases `/specify → /plan → /tasks → /implement` précédé d'une « constitution ». L'argument officiel est solide : un prompt vague force le modèle à deviner des milliers de requirements ; la spec rend l'intention exécutable et fait entrer les contraintes de sécurité et de design *from day one*. AWS a suivi avec Kiro et son mode spec (user stories au format EARS), Thoughtworks a classé la technique en « Assess » à son radar.

C'est ici que les critiques les plus sérieuses du paysage se concentrent :

- **Birgitta Böckeler** (Thoughtworks), dans [l'analyse de référence](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) publiée sur martinfowler.com, distingue trois ambitions — *spec-first* (spec jetable), *spec-anchored* (spec maintenue avec le code), *spec-as-source* (on n'édite que la spec, le code est régénéré) — et constate que tous les outils sont spec-first sans stratégie de maintenance assumée. Elle pointe la surcharge de revue des artefacts intermédiaires, le *false sense of control*, et parle de **Verschlimmbesserung** — cette « amélioration qui empire les choses » — quand Kiro génère 4 user stories et 16 critères d'acceptation pour un correctif mineur.
- **François Zaninotto** (Marmelab) assène le coup le plus net dans [« The Waterfall Strikes Back »](https://marmelab.com/blog/2025/11/12/spec-driven-development-waterfall-strikes-back.html) : afficher la date du jour a exigé 8 fichiers et ~1 300 lignes de spécification avec Spec Kit. Sa conclusion : le SDD est un *waterfall rebrandé*, optimisé pour sortir les développeurs de la boucle — alors que les agents, en découpant finement les problèmes, pourraient au contraire *supercharger l'agilité*.

La réponse des partisans — Marc Brooker d'AWS en tête — est que l'objection confond « écrire une spec avant de coder » et « geler une spec avant de coder ». Le débat n'est pas clos.

---

## Le camp « craft » : petits skills, artisan senior

### Matt Pocock, l'anti-framework

Face aux pipelines, [mattpocock/skills](https://github.com/mattpocock/skills) — **261 609 étoiles** en sept mois, chiffre qui donne le vertige — défend exactement la thèse inverse. Le créateur de Total TypeScript, devenu la voix d'[AI Hero](https://www.aihero.dev/ai-coding-dictionary), publie les skills de son propre répertoire `.agents` avec un positionnement explicite : les frameworks type GSD, BMAD ou Spec Kit « possèdent le processus », *« prennent votre contrôle et rendent les bugs de processus difficiles à résoudre »*.

Sa grille de lecture est limpide — quatre modes d'échec de l'agent, quatre remèdes : le désalignement → le *grilling* (son skill `/grill-me`, qui interviewe l'utilisateur avant de coder, est devenu viral en mars 2026) ; la verbosité → un langage partagé façon DDD (`CONTEXT.md`, ADR) ; le code qui ne marche pas → des boucles de feedback (`/tdd`, `/diagnosing-bugs`) ; la boue architecturale → les *deep modules* d'Ousterhout. Sa thèse de fond me parle directement : **les fondamentaux du génie logiciel comptent plus que jamais** — le métier de senior devient l'encadrement du contexte et des boucles de feedback, pas la frappe de code.

**La limite :** ses skills supposent un ingénieur déjà senior pour les piloter — le « for Real Engineers » du titre n'est pas une coquetterie. Et l'écosystème reste centré sur sa personne, sa newsletter (60 000 abonnés) et ses cohortes.

### pstack, le contre-pied radical

Troisième voix, la plus iconoclaste : **pstack**, le plugin officiel Cursor de [Lauren Tan](https://github.com/backnotprop/pstack) (@poteto, React core team, ex-Meta et Netflix). Vingt-et-un principes, vingt-deux playbooks, un routage multi-modèles par rôle, et un anti-slop assumé : *« throughput without quality is not a goal »*.

Mais ce qui rend pstack fascinant, c'est son **rejet frontal de toute la doctrine précédente** : *« why are there no planning skills? … personally, i don't believe in planning. the best spec is code »*. La rigueur ne vient pas des documents amont mais de la vérification runtime — son principe `prove-it-works` exige de vérifier sur l'artefact réel, jamais sur un proxy. Principes marquants au passage : `fix-root-causes`, `subtract-before-you-add`, `build-the-lever`.

**Les limites :** conçu pour Cursor et les conventions de son auteure, couplage à Graphite, portages communautaires qui perdent des primitives. Un signal d'adoption modeste (le dépôt parent cursor/plugins plafonne à 7 655 étoiles) mais une distribution native dans Cursor.

---

## Le cas français : ai-driven-dev/framework

Reste [ai-driven-dev/framework](https://github.com/ai-driven-dev/framework), le « marketplace framework » fondé par Alex Soyes : 8 plugins, 50 skills, un SDLC complet (`frame → plan → implement → validate → review → challenge → ship`), des promesses d'« enterprise-grade », une communauté francophone revendiquant 500+ développeurs formés et du « 100% AI-generated code » en production.

Je veux être honnête avec ce projet, qui a le mérite d'exister en français et de soigner sa documentation : avec **464 étoiles** au 14 septembre 2026 — trois ordres de grandeur sous Superpowers ou Pocock — son adoption reste embryonnaire. Et surtout, **aucune promesse de « code parfait » ne tient dans un format Markdown**. Les rules et les skills restent des instructions probabilistes, pas des garanties : c'est exactement le *false sense of control* que Böckeler dénonce chez les artefacts SDD. La seule chose qui garantit du code, ce sont les boucles de feedback exécutables — tests, CI, vérification runtime. Tout le reste est de l'intendance.

---

## Le tableau de chasse

Adoptions relevées en étoiles GitHub au 14 septembre 2026.

| Projet | Camp | Adoption | Promesse & talon d'Achille | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| [Superpowers](https://github.com/obra/superpowers) | Process | 286k ★ | Discipline TDD imposée, preuve avant succès — mais méga-prompts contradictoires, coût en tokens et pipeline rigide. | À adopter |
| [mattpocock/skills](https://github.com/mattpocock/skills) | Craft | 261k ★ | Skills petits, composables, langage partagé — mais suppose un senior aux commandes et un écosystème centré sur son créateur. | À adopter |
| [spec-kit](https://github.com/github/spec-kit) (GitHub) | Process | 136k ★ | L'intention rendue exécutable, specs versionnées — mais surcharge documentaire, « waterfall rebrandé », specs qui pourrissent. | Spec-first |
| [pstack](https://github.com/backnotprop/pstack) | Craft radical | 7,6k ★¹ | « The best spec is code », preuve par l'exécution — mais couplé à Cursor et aux conventions de son auteure. | À suivre |
| [ai-driven-dev/framework](https://github.com/ai-driven-dev/framework) | Process | 464 ★ | SDLC complet « enterprise-grade » en français — mais garanties probabilistes, adoption embryonnaire. | À suivre |

¹ Dépôt parent `cursor/plugins` — pstack est distribué nativement dans Cursor.

---

## Les frictions de terrain, toutes camps confondus

En croisant les retours de praticiens, quatre frictions reviennent partout :

1. **Le brownfield.** Introduire specs et pipelines sur du code existant est douloureux — deux des trois outils testés par Böckeler s'y cassent les dents, et Zaninotto confirme : les retours sont décroissants dès que l'application grossit.
2. **Les murs de Markdown à relire.** La charge cognitive se déplace du code vers la prose : 80 % du temps passé à lire au lieu de penser, dit Zaninotto. Et une spec non maintenue pourrit plus vite qu'un code non commenté.
3. **Le coût en tokens et en latence.** Chaque skill chargé, chaque spec régénérée, chaque phase intermédiaire se paie en contexte — la ressource la plus précieuse de l'agent.
4. **Le faux sentiment de contrôle.** L'artefact rassure ; seule la vérification exécutable protège. Le signal de gouvernance venu d'Amazon — contrôles resserrés sur le code IA après des incidents — montre que même les promoteurs du modèle remettent des garde-fous humains.

---

## Mon setup : des outils façonnés à la main

Après ce panorama, la question que vous me posez légitimement : et moi, dans tout ça ? Ma réponse tient en une phrase, et c'est peut-être la vraie conclusion de ce dossier : **construisez vos outils vous-même — avec des agents, mais construisez vos outils.** Comme les artisans façonnaient le manche de leur rabot à la forme de leur paume.

Concrètement, mon atelier repose sur trois couches, et seule la première est achetée sur étagère.

### 1. La matière première empruntée

Une trentaine de skills importées de [mattpocock/skills](https://github.com/mattpocock/skills) — `/grill-me`, `/tdd`, `/code-review`, `/to-spec`, `/wayfinder`, `/handoff`… Je les traite comme le métal brut du forgeron : excellent, mais à retremper à sa main. Sur keredit, l'éditeur web-to-print de notre imprimerie, ces emprunts sont même **épinglés par hash SHA-256** dans un `skills-lock.json` : la provenance est versionnée comme une dépendance, et la dérive amont se revoit comme une mise à jour, pas comme une fatalité.

### 2. La mémoire du métier, écrite une fois pour toutes

Chaque projet porte son `AGENTS.md` — pas un fichier d'instructions génériques, mais la **mémoire du métier**. Sur ce site : la doctrine patrimoniale des liens morts (une ressource ne meurt jamais, elle se documente), le registre des visuels d'archive, les règles de coexistence Digest/Focus. Sur keredit : un vrai contrat de délégation, avec trois portées d'autorisation graduées — la revue, la boucle de travail jusqu'à la PR verte, puis la fusion et le déploiement qui « exigent chacune une demande dédiée » — et cette règle rare que j'ai écrite après trop de dérives : *« Quand l'utilisateur exprime une fatigue, une inquiétude ou une régression sans demander explicitement une correction, ne pas commencer à coder. »* Aucun framework ne vous vendra ça : ce sont **mes cicatrices, transcrites**.

### 3. Les outils façonnés, là où le battement de cœur du projet est unique

C'est la couche qui compte, et c'est elle qu'aucun marketplace ne fournira :

- **Sur ce Digest** : une skill `curate-web-digest` qui transforme mes onglets de navigateur en entrées de catalogue normalisées (tracking parameters épurés, doublons détectés, classification proposée — décision éditoriale réservée) ; le workflow `focus:new` qui a fabriqué ce billet (sélection d'un visuel d'archive inédit, cartes sociales, registre, garde-fous anti-écrasement) ; les skills d'écriture `writing-beats`, `writing-fragments`, `writing-shape`, façonnées à ma plume plutôt qu'à la moyenne du corpus ; et toute une batterie de scripts de vérification qui bloquent un commit incohérent — ce sont eux, pas un framework, qui ont garanti la publication d'aujourd'hui.
- **Sur keredit**, la version la plus élaborée : un triptyque `capitaine` / `review-fix` / `contre-revue` qui orchestre des vagues de tickets — dispatch des chantiers dans des workspaces isolés, boucle de correction bornée à trois rounds, puis **audit adversarial par un agent frais à contexte vierge**, calibré sur les classes d'erreurs que les revues précédentes ont réellement laissé passer. Autour : des ADR qui décrètent que la documentation suit le code (l'index est régénéré et auto-committé par la CI, jamais maintenu à la main), un journal append-only, une `poubelle/` où l'archivage est un déplacement réversible et tracé plutôt qu'une suppression.

Et voici la boucle vertueuse, celle qui change tout par rapport à l'artisanat d'avant : **ces outils ont été construits avec les agents eux-mêmes.** La skill de contre-revue est née d'une frustration — le bot de revue externe relevait toujours les mêmes classes de défauts — formulée à un agent, qui a rédigé la procédure, que j'ai affûtée, qui a servi cent fois depuis. C'est exactement le *harness engineering* de Hashimoto, mais vécu depuis la forge : chaque friction devient un outil, chaque outil est versionné comme du code, et l'outil suivant se construit plus vite parce que l'atelier s'est enrichi.

**Le prix à payer, en toute honnêteté** : un outil façonné s'entretient. Mes skills vieillissent, certaines conventions doivent être ratissées quand le projet pivote, et le temps passé à forger n'est pas passé à produire. Mais c'est le même arbitrage que celui du menuisier qui affûte : l'atelier qui ne s'entretient pas finit par scier de travers.

---

## Le verdict de l'atelier

**À adopter dès maintenant :**
- **Le TDD imposé et la preuve avant complétion** (Superpowers, Pocock, pstack convergent tous sur ce point — c'est le seul consensus réel du paysage).
- **Le langage partagé versionné** : `AGENTS.md`, `CONTEXT.md`, ADR — le *harness* de Hashimoto. Chaque erreur de l'agent devient une règle permanente, jamais un nouveau prompt.
- **Les petits skills composables** à la Pocock plutôt que les pipelines monolithiques : on garde le contrôle du processus, on débogue ses conventions comme du code.

**À suivre de près :**
- **pstack**, pour son contre-courant intellectuel (la preuve par l'exécution) et son routage multi-modèles.
- **Le loop engineering** d'Osmani et les **evals de skills** — mesurer l'apport réel d'un skill, avec/sans, est la prochaine frontière de crédibilité de tout cet écosystème.
- **ai-driven-dev**, parce qu'une offre française structurée mérite un œil bienveillant — à mesurer sur son propre code, pas sur le marketing.

**À éviter :**
- Le dogme **spec-as-source** et les murs de Markdown sur les petites tâches : la spec-first légère et jetable, oui ; la bureaucratie régénérée, non.
- Toute promesse de « code parfait garanti » par un framework : les skills sont des instructions probabilistes, les garanties sont des tests qui s'exécutent.

> **Conclusion de l'artisan :** cette industrie des « super skills » n'invente rien — elle redécouvre, un par un, les fondamentaux du génie logiciel (TDD, revue, langage ubiquiste, boucles de feedback courtes) et les traduit en artefacts que les agents peuvent charger. C'est une excellente nouvelle : cela signifie que le senior n'est pas remplacé, il est devenu l'architecte du contexte. Alors oui, prenez les skills des autres comme matière première — mais façonnez les vôtres, à la forme de votre main et de votre métier, avec les agents comme compagnons de forge. Gardez vos skills petits, vos tests exécutables et votre jugement allumé — et méfiez-vous de quiconque vend la perfection en Markdown.

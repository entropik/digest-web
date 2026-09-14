# « Super skills » et frameworks de gouvernance des agents de code — état des lieux

Recherche documentaire du 2026-09-14. Sources primaires citées inline. Chaque section se termine par un verdict éditorial.

---

## 1. obra/superpowers (Jesse Vincent)

**Ce que c'est.** Une méthodologie complète de développement logiciel pour agents de code, construite sur des *skills* composables qui se déclenchent automatiquement : brainstorming socratique avant tout code, worktrees Git, plan d'implémentation « suffisamment clair pour un junior sans jugement », *subagent-driven development*, TDD strict RED-GREEN-REFACTOR (le skill « supprime le code écrit avant les tests »), revue de code à deux étages, workflow de fin de branche. Philosophie affichée : « Test-Driven Development — écrire les tests d'abord, toujours ; Systematic over ad-hoc ; Evidence over claims ». Source : [github.com/obra/superpowers](https://github.com/obra/superpowers).

**Qui est derrière.** Jesse Vincent (@obra) et l'équipe de Prime Radiant. Vincent a un long pedigree logiciel : créateur de Request Tracker, release manager de Perl 5, cofondateur de Keyboardio ([dablclub.com/research/who-is-who](https://www.dablclub.com/research/who-is-who)). Billet d'annonce : [« Superpowers: How I'm using coding agents in October 2025 »](https://blog.fsck.com/2025/10/09/superpowers/), 9 octobre 2025 — la même semaine où Anthropic lançait son système de plugins.

**Adoption.** Dépôt créé le 2025-10-09 ; **286 389 étoiles et 25 621 forks au 2026-09-14** (API GitHub, [api.github.com/repos/obra/superpowers](https://api.github.com/repos/obra/superpowers)). La croissance rapportée par des tiers : ~16k étoiles en janvier 2026 ([alixixi.com](https://www.alixixi.com/wz/338816.html)), ~42k en avril 2026 et acceptation dans le marketplace officiel d'Anthropic en janvier 2026 ([clskillshub.com](https://clskillshub.com/blog/superpowers-claude-code-plugin)). Diffusé aujourd'hui sur 15+ harnais : Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, Grok, Kimi Code, OpenCode, etc. ([README](https://github.com/obra/superpowers)). Simon Willison l'a recommandé dès le lendemain de l'annonce ([simonwillison.net/2025/Oct/10/superpowers](https://simonwillison.net/2025/Oct/10/superpowers/), via [sa page tag](https://simonwillison.net/tags/jesse-vincent/)). Le fil Hacker News d'origine a atteint 435 points et 231 commentaires ([news.ycombinator.com/item?id=45547344](https://news.ycombinator.com/item?id=45547344)).

**Comment ça s'est diffusé.** Anthropic a annoncé les *Agent Skills* le 16 octobre 2025 — dossiers d'instructions + scripts, composables, portables, chargés « à la demande » — puis en a fait un standard ouvert le 18 décembre 2025 ([anthropic.com/news/skills](https://www.anthropic.com/news/skills)). Superpowers a surfé sur ce format et est devenu la référence communautaire de l'écosystème.

**Pour.** Discipline TDD réellement imposée ; vérification avant déclaration de succès (« Evidence over claims ») ; autonomie longue (plusieurs heures sans dévier du plan) ; open source MIT ; évaluations des skills via un harnais d'evals (superpowers-evals).

**Contre / limites (voix réelles).** Sur le fil HN d'origine : les méga-instructions type `<EXTREMELY_IMPORTANT>` posent un problème de conflit de priorités (« how soon before those instructions would be in conflict with my actual priorities ? », utilisateur jmull) ; la persuasion par capitales et scénarios catastrophés est jugée datée (« models just follow instructions », tcdent) ; le manque de démonstration comparative avec/sans skills (Avicebron) ; la question de fond « en quoi un skill diffère-t-il d'exemples dans le prompt ? » (daemontus). Source : [fil HN](https://news.ycombinator.com/item?id=45547344). Matt Pocock critique frontalement les frameworks qui « possèdent le processus » (GSD, BMAD, Spec-Kit — catégorie à laquelle Superpowers est souvent rattachée) : « they take away your control and make bugs in the process hard to resolve » ([github.com/mattpocock/skills](https://github.com/mattpocock/skills)). D'autres le qualifient de pipeline TDD rigide en 7 phases ([particula.tech](https://particula.tech/blog/superpowers-vs-gstack-ai-coding-skill-packs)).

**Frictions rapportées.** Surcoût en tokens et en temps de lecture ; télémétrie optionnelle ajoutée par défaut (désactivable via `SUPERPOWERS_DISABLE_TELEMETRY`, [README](https://github.com/obra/superpowers)) ; demandes de phases de revue contradictoire avant exécution ([issue #1803](https://github.com/obra/superpowers/issues/1803)).

**Verdict : à adopter** comme socle de discipline (TDD, vérification), en le forçant à cohabiter avec ses propres conventions ; surveiller le coût en tokens et la rigidité du pipeline.

---

## 2. Matt Pocock (AI Hero)

**Ce que c'est.** Créateur de Total TypeScript, puis d'AI Hero ([aihero.dev](https://www.aihero.dev/)) : « the engineering process for working with coding agents, from an idea to shipped, reviewed code ». Son dépôt [mattpocock/skills](https://github.com/mattpocock/skills) — « Skills for Real Engineers. Straight from my .agents directory » — publie les skills qu'il utilise quotidiennement.

**Adoption.** Dépôt créé le 2026-02-03 ; **261 609 étoiles, 22 078 forks au 2026-09-14** (API GitHub). Newsletter ~60 000 abonnés ([README](https://github.com/mattpocock/skills)). Son skill `/grill-me` « est devenu viral » en mars 2026 ([aihero.dev/posts — « My 'Grill Me' Skill Went Viral »](https://www.aihero.dev/posts)). Skills dans le marketplace officiel de Claude Code ; installateur `npx skills add mattpocock/skills` pour Codex et autres agents.

**Philosophie (le "pour" de son camp).** Positionnement délibérément anti-framework : les approches GSD, BMAD et Spec-Kit « possèdent le processus », « prennent votre contrôle » et rendent les bugs de processus difficiles à résoudre ; ses skills sont « petits, faciles à adapter, composables ». Quatre modes d'échec des agents et leurs remèdes : (1) le désalignement → *grilling* (interview socratique) ; (2) la verbosité → langage partagé type DDD (`CONTEXT.md`, ADR, « ubiquitous language ») ; (3) le code qui ne marche pas → boucles de feedback, `/tdd`, `/diagnosing-bugs` ; (4) la boue architecturale → *deep modules* (Ousterhout), `/improve-codebase-architecture`. Source : [github.com/mattpocock/skills](https://github.com/mattpocock/skills). Catalogue complet des skills : [aihero.dev/posts](https://www.aihero.dev/posts) (`/to-spec`, `/to-tickets`, `/wayfinder`, `/handoff`, `/teach`…). Thèse récurrente : « Software engineering fundamentals matter more than ever » — le métier de senior devient l'encadrement du contexte et des boucles de feedback, pas la frappe de code.

**Contre / limites.** Ses skills supposent un ingénieur déjà senior pour les piloter (le positionnement « for Real Engineers » est explicite) ; écosystème centré sur sa personne et sa newsletter (modèle créateur) ; moins « clé en main » qu'un Superpowers.

**Verdict : à adopter** — c'est la voix la plus proche d'une pratique éditoriale de fond (alignement avant code, langage partagé, feedback loops). À suivre : ses cours/cohortes « AI Coding for Real Engineers » et le workshop [AI Engineer 2026](https://www.aihero.dev/ai-engineer-workshop-2026~dwnll).

---

## 3. pstack (Lauren Tan / @poteto)

**Identification confirmée.** pstack n'est pas une liste curée : c'est le plugin officiel de **Lauren Tan (@poteto)** — React core team, ingénieure chez Cursor (ex-Meta, Netflix) — publié dans le dépôt officiel [cursor/plugins](https://github.com/cursor/plugins) (dossier `pstack/`, ex. [skills/poteto-mode/SKILL.md](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/SKILL.md)). Miroir de référence : [backnotprop/pstack](https://github.com/backnotprop/pstack) ; portages communautaires : [michael-denyer/pstack-claude](https://github.com/michael-denyer/pstack-claude) (54 répertoires de skills, dont 31 workflows publics).

**Ce que c'est.** Un ensemble de skills + 21 « principes » + 22 playbooks orchestrés par `/poteto-mode`, avec routage multi-modèles par rôle (code précis → sol, mécanique rapide → grok, prose/jugement → fable). Anti-slop assumé : « throughput without quality is not a goal… pstack helps you write less, but higher quality code ». Promesse : « fearless parallelism » — paralléliser les agents parce que chacun produit du code vérifiable. Principes marquants : `prove-it-works` (vérifier sur l'artefact réel, jamais un proxy), `fix-root-causes`, `build-the-lever`, `subtract-before-you-add`. Source : [README backnotprop/pstack](https://github.com/backnotprop/pstack).

**Adoption.** Le dépôt parent cursor/plugins (créé 2026-01-23) compte 7 655 étoiles (API GitHub, 2026-09-14) — signal modeste mais le plugin est distribué nativement dans Cursor. Couverture par des tiers ([aispectrum.io](https://aispectrum.io/orchestrating-ai-agents-your-way), [skilldev.pro](https://skilldev.pro/en/skills/pstack-skill/)).

**Point doctrinal notable :** pstack est le **contre-pied assumé du spec-driven development** : « why are there no planning skills? … personally, i don't believe in planning. the best spec is code » ([README](https://github.com/backnotprop/pstack)). La rigueur vient de la vérification runtime, pas des documents amont.

**Contre / limites.** Conçu pour Cursor (attribution de modèles par sous-agent) ; les portages perdent des primitives ; couplage à Graphite et aux conventions de l'auteure ; style « poteto » très personnel (d'où le skill `/automate-me` pour générer son propre mode).

**Verdict : à suivre** de près (contre-courant intellectuel intéressant : la preuve par l'exécution plutôt que par la spec) ; à adopter surtout pour les utilisateurs de Cursor.

---

## 4. Spec-driven development (GitHub Spec Kit, AWS Kiro, Tessl)

**Ce que c'est.** Écrire une spec structurée *avant* le code ; la spec devient la source de vérité pour l'humain et l'IA. Analyse de référence : Birgitta Böckeler (Thoughtworks) sur martinfowler.com, qui distingue trois niveaux d'ambition — **spec-first** (spec écrite avant, puis jetée), **spec-anchored** (spec maintenue avec le code), **spec-as-source** (seule la spec est éditée, le code est régénéré) — et note que tous les outils sont spec-first, peu assument une stratégie de maintenance. Source : [martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) (oct. 2025).

**GitHub Spec Kit.** Annoncé le 2 septembre 2025 par Den Delimarsky ([github.blog — « Spec-driven development with AI »](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)) : quatre phases `/specify → /plan → /tasks → /implement` (plus `constitution` en amont), le rôle du développeur étant « to steer… to verify ». Dépôt [github/spec-kit](https://github.com/github/spec-kit) créé le 2025-08-21 ; **136 576 étoiles au 2026-09-14** (API GitHub) ; basé sur les travaux de John Lam ; version 1.0.0 un an après le premier commit, le mainteneur déclarant que la stabilité compte moins que l'adaptabilité « as agents make adapting to change dramatically cheaper » ([README](https://github.com/github/spec-kit)). Compatible 30+ agents.

**AWS Kiro.** IDE agentique lancé par AWS en juillet 2025, avec un « spec mode » Requirements → Design → Tasks, user stories au format « As a… » et critères d'acceptation GIVEN/WHEN/THEN (notation EARS). Source : [Böckeler, martinfowler.com](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) ; [Forbes via zenn.dev](https://zenn.dev/netetahito/articles/79e03d10277b7b).

**Pour.** GitHub : le vague du prompt force le modèle à « deviner des milliers de requirements » ; la spec rend l'intention exécutable ; les contraintes sécurité/design-system entrent dans la spec « from day one » ([github.blog](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)). Addy Osmani : [« How to Write a Good Spec for AI Agents »](https://umesh-malik.com/blog/spec-driven-development-ai-agents-addy-osmani) (O'Reilly Radar, fév. 2026). Thoughtworks a classé la technique en « Assess » au radar de nov. 2025 ([thoughtworks.com/radar/techniques/spec-driven-development](https://www.thoughtworks.com/radar/techniques/spec-driven-development), réf. via [CSDN](https://blog.csdn.net/dongnihao/article/details/161547166)).

**Contre / limites (voix réelles).**
- Böckeler : surcharge de revue des artefacts intermédiaires, « false sense of control », passage à l'échelle douteux selon la taille du problème — Kiro a généré 4 user stories et 16 critères d'acceptation pour un correctif mineur ; elle parle de *Verschlimmbesserung* (amélioration qui empire les choses). [martinfowler.com](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) ; [zenn.dev](https://zenn.dev/mita_hiro/articles/9fb57cd9a2288b?locale=en).
- François Zaninotto (Marmelab, 12 nov. 2025), **« Spec-Driven Development: The Waterfall Strikes Back »** : afficher la date courante a exigé 8 fichiers et ~1 300 lignes de spec avec Spec Kit ; SDD = « waterfall rebrandé » optimisé pour sortir les développeurs de la boucle. [marmelab.com/blog](https://marmelab.com/blog) ; résumé : [dev.to/remybuilds](https://dev.to/remybuilds/spec-driven-development-structure-beats-vibes-4oma), [allstacks.com](https://www.allstacks.com/blog/spec-driven-development-isnt-waterfall-why-the-ai-coding-bottleneck-changed-everything).
- Réponse pro-SDD : Marc Brooker (AWS, avril 2026) réfute l'assimilation au waterfall ([agentropic.ai](https://agentropic.ai/blog/spec-driven-development-explained/)) ; l'objection confond « écrire une spec avant de coder » et « geler une spec avant de coder » ([augmentcode.com](https://www.augmentcode.com/guides/spec-driven-development-vs-waterfall)).
- Position inverse radicale : pstack, « the best spec is code » ([backnotprop/pstack](https://github.com/backnotprop/pstack)).

**Frictions rapportées.** Brownfield difficile (deux des trois outils testés par Böckeler pénibles à introduire sur du code existant) ; murs de Markdown à relire ; specs qui pourrissent si non maintenues ; signal de gouvernance : Amazon aurait resserré les contrôles sur le code IA après des incidents ([aligneddev.net](https://www.aligneddev.net/blog/2026/speckit-necode-2026/)).

**Verdict : à suivre / adopter en mode spec-first** (spec avant code, jetable ou ancrée) ; se méfier du dogme spec-as-source et du sur-coût documentaire sur les petites tâches.

---

## 5. ai-driven-dev/framework

**Ce que c'est.** Un « marketplace framework » français : 8 plugins, 50 skills, 2 agents qui installent un SDLC complet dans l'outil d'IA — `/aidd-orchestrator:01-sdlc` : frame → plan → implement → validate → review → challenge → ship. Promesses : « Enterprise-grade SDLC », standardisation des équipes, réduction de la dette technique, « token-optimized », IDE-agnostic (Claude Code natif, Cursor, Copilot, Codex, OpenCode). Source : [github.com/ai-driven-dev/framework](https://github.com/ai-driven-dev/framework).

**Qui est derrière.** L'organisation [ai-driven-dev](https://github.com/ai-driven-dev), « Founded by Alex Soyes », communauté française revendiquant 3 ans de R&D et 500+ développeurs formés (EN/FR), « shipping production software with 100% AI-generated code » ; Discord francophone, roadmap publique hebdomadaire.

**Adoption.** Signal faible : **464 étoiles** au 2026-09-14 (dépôt créé le 2026-02-06, API GitHub) — trois ordres de grandeur sous Superpowers ou mattpocock/skills.

**Pour.** Approche SDLC complète pensée pour les équipes et les legacy systems ; documentation soignée ; hooks de télémétrie locale ; français, ce qui compte pour un lectorat francophone.

**Contre / limites.** Aucune promesse de « code parfait » ne tient dans un format markdown : les rules/skills restent des instructions probabilistes, pas des garanties — c'est exactement le « false sense of control » dénoncé par Böckeler à propos des artefacts SDD ([martinfowler.com](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)), et le scepticisme des commentateurs HN sur les « méga-prompts » ([fil HN](https://news.ycombinator.com/item?id=45547344)). Le marketing « 100% AI-generated code » en production est invérifiable de l'extérieur. Télémétrie versionnée dans Git (opt-out `AIDD_TELEMETRY=0`, [README](https://github.com/ai-driven-dev/framework)).

**Verdict : à suivre** (projet jeune, adoption embryonnaire) ; ne pas prendre les garanties de qualité pour argent comptant — mesurer sur son propre code.

---

## 6. Le renommage de la discipline : prompt → context → agentic → harness engineering

**Chronologie du vocabulaire.**
- **Vibe coding** : terme d'Andrej Karpathy, début 2025 — pilotage « au feeling », sans conserver le raisonnement ([curtispoe.org/paad](https://curtispoe.org/paad/)).
- **Context engineering** : popularisé mi-2025 (LangChain, « The Rise of Context Engineering », taxonomie write/select/compress/isolate — [langchain.com/blog/context-engineering-for-agents](https://www.langchain.com/blog/context-engineering-for-agents), réf. via [upsolve.ai](https://upsolve.ai/blog/agentic-context-engineering)) ; consacré par le post d'Anthropic **« Effective context engineering for AI agents »** (29 sept. 2025, [anthropic.com/engineering/effective-context-engineering-for-ai-agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)) : gérer tout l'état informationnel de l'agent, pas seulement le prompt.
- **Agentic engineering** : le contrepoint discipliné au vibe coding. Addy Osmani, [addyosmani.com/blog/agentic-engineering/](https://addyosmani.com/blog/agentic-engineering/) (4 fév. 2026) : « a disciplined approach to AI-assisted software development that emphasizes human oversight and engineering rigor ». Suite prolifique chez O'Reilly Radar : Agent Skills, Long-Running Agents, Loop Engineering (« get good at the loop that does the prompting for you »), The Intent Debt, Own the Outer Loop ([oreilly.com/people/adnan-osmani](https://www.oreilly.com/people/adnan-osmani/), [aibuilderclub.com](https://www.aibuilderclub.com/blog/loop-engineering-addy-osmani)).
- **Harness engineering** : terme introduit par **Mitchell Hashimoto** (cofondateur HashiCorp, Ghostty) dans [« My AI Adoption Journey »](https://mitchellh.com/writing/my-ai-adoption-journey) (5 fév. 2026) — étape 5 « Engineer the Harness » : chaque erreur de l'agent est convertie en solution d'ingénierie permanente (AGENTS.md, outils, déterminisme), pas en nouveau prompt. Confirmé comme première occurrence par la littérature ([arXiv 2607.25890](https://arxiv.org/html/2607.25890v1)). Suivi en quelques semaines par OpenAI, [« Harness engineering: leveraging Codex in an agent-first world »](https://openai.com/index/harness-engineering/) (11 fév. 2026), puis par la formule de LangChain **Agent = Model + Harness** (mars 2026, [arXiv 2607.25890](https://arxiv.org/html/2607.25890v1)) et l'analyse de Birgitta Böckeler [« Harness Engineering for Coding Agent Users »](https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html) sur martinfowler.com (guides, sensors, boucles de contrôle ; la vérification comportementale reste le point faible).

**Pour.** Le vocabulaire stabilise des pratiques réelles : le skill/AGENTS.md/harness est un artefact d'ingénierie versionnable, testable (evals), partageable en équipe.

**Contre / limites.** Effet mot-valise : « AI engineer means like 20 different things… it'll probably be called something else in a month » ([fluidlabs.com](https://fluidlabs.com/podcast/mike-piccolo-agent-orchestration-full-stack)). Le risque d'overfitting modèle×harnais (« co-training ») est documenté : un modèle général ne devrait pas se soucier du harnais, mais l'entraînement conjoint crée de la dépendance ([thekb.eu sur Osmani](https://www.thekb.eu/en/fiches/osmani-agent-harness-engineering-2026-04-19/)).

**Verdict : à adopter comme vocabulaire** (context engineering, harness) et à suivre (loop engineering, evals) — c'est le socle conceptuel qui unifie les threads 1 à 5.

---

## Synthèse

En un an, la discipline a changé de nom trois fois : prompt engineering (2024), context engineering (2025, consacré par Anthropic), puis agentic/harness engineering (2026, Osmani, Hashimoto, OpenAI, Fowler/Böckeler). Le point commun des « super skills » : transformer les conventions d'équipe en artefacts versionnés que l'agent charge à la demande. Deux camps doctrinaux structurent le débat. Le camp *process* — Superpowers (286k étoiles), Spec Kit (136k), Kiro — mise sur la spec et le pipeline TDD imposé ; le camp *craft* — Matt Pocock (261k étoiles), pstack de Lauren Tan — défend des skills petits et composables, voire rejette la planification (« the best spec is code »). Les critiques sont réelles et convergentes : surcharge documentaire et « waterfall rebrandé » (Zaninotto : 1 300 lignes de spec pour afficher la date), faux sentiment de contrôle et *Verschlimmbesserung* (Böckeler), méga-prompts contradictoires et persuasion théâtrale (HN), coût en tokens. Les frictions rapportées portent sur le brownfield, la revue de murs de Markdown, la pourriture des specs non maintenues et la télémétrie. Aucun framework ne « garantit » du code parfait : les skills restent des instructions probabilistes, seules les boucles de feedback exécutables (tests, CI, vérification runtime) donnent des garanties. À adopter : le TDD imposé, la vérification avant complétion, le langage partagé, AGENTS.md/harness versionné. À suivre : pstack, loop engineering, les evals de skills, ai-driven-dev (encore embryonnaire). À éviter : le dogme spec-as-source et les promesses marketing de perfection automatique.

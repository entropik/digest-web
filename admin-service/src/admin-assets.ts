const pageShell = (body: string, title = "Administration · Digest") => `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${title}</title>
  <link rel="icon" href="/favicon.svg">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="mask-icon" href="/safari-pinned-tab.svg">
  <meta name="theme-color" content="#ff5c35">
  <meta name="msapplication-TileColor" content="#ff5c35">
  <link rel="stylesheet" href="/admin/style.css">
</head>
<body>
  <main>${body}</main>
  <script src="/admin/app.js" defer></script>
</body>
</html>`;

export const loginPage = () =>
  pageShell(`
    <p class="kicker">Espace propriétaire</p>
    <h1>Administrer<br>le Digest.</h1>
    <p class="intro">Connecte-toi avec le compte GitHub autorisé pour organiser et publier les prochains liens.</p>
    <button class="primary" id="admin-login" type="button">Continuer avec GitHub</button>
    <p class="feedback" id="admin-feedback" role="status"></p>
  `);

export const forbiddenPage = () =>
  pageShell(
    `<p class="kicker">Accès refusé</p><h1>Ce compte n’est pas autorisé.</h1><p class="intro">Déconnecte-toi puis utilise le compte propriétaire du Digest.</p><button id="admin-logout" type="button">Se déconnecter</button>`,
    "Accès refusé · Digest",
  );

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

export const dashboardPage = (name: string) =>
  pageShell(`
    <header>
      <div>
        <p class="kicker">Espace propriétaire</p>
        <h1>Atelier<br>du Digest.</h1>
        <p class="intro">Bonjour ${escapeHtml(name)}. Capture, relis et publie une édition complète depuis cette file privée.</p>
      </div>
      <div class="header-actions">
        <a href="https://chromewebstore.google.com/detail/nlejcccmpbajpoaknlecegkpgdegiflf" target="_blank" rel="noreferrer">Installer l’extension</a>
        <a href="/">Voir le Digest</a>
        <button id="admin-logout" type="button">Se déconnecter</button>
        <span class="admin-version" aria-label="Version v1.18.0">v1.18.0</span>
      </div>
    </header>
    <nav class="admin-nav" aria-label="Administration">
      <button class="is-active" type="button" data-panel-button="drafts" aria-pressed="true">Brouillons <span id="draft-count">0</span></button>
      <button type="button" data-panel-button="publish" aria-pressed="false">Publier <span id="selected-count">0</span></button>
      <button type="button" data-panel-button="publications" aria-pressed="false">Publications</button>
      <button type="button" data-panel-button="links" aria-pressed="false">Liens publiés</button>
      <button type="button" data-panel-button="editions" aria-pressed="false">Éditions</button>
      <button type="button" data-panel-button="categories" aria-pressed="false">Catégories</button>
      <button type="button" data-panel-button="themes" aria-pressed="false">Thèmes</button>
      <button type="button" data-panel-button="linkedin" aria-pressed="false">LinkedIn</button>
      <button type="button" data-panel-button="hidden" aria-pressed="false">Retirés</button>
    </nav>
    <p class="feedback" id="admin-feedback" role="status" aria-live="polite"></p>

    <section class="admin-panel is-active" data-panel="drafts">
      <div class="section-heading">
        <div><p class="kicker">File privée</p><h2>Brouillons</h2></div>
        <div class="toolbar">
          <button id="select-all-drafts" type="button" aria-pressed="false">Tout sélectionner</button>
          <input id="draft-search" type="search" placeholder="Filtrer les brouillons">
          <select id="draft-filter"><option value="all">Tous</option><option value="complete">Complets</option><option value="incomplete">Incomplets</option></select>
        </div>
      </div>
      <div id="draft-list"><p class="loading">Chargement…</p></div>
    </section>

    <section class="admin-panel" data-panel="publish">
      <div class="section-heading"><div><p class="kicker">Prochaine édition</p><h2>Publier</h2></div></div>
      <form id="publication-form" class="edition-form">
        <div class="field-row">
          <label>Date<input id="publication-date" name="digestDate" type="date" required></label>
          <label>Titre<input id="publication-title" name="title" required maxlength="240"></label>
        </div>
        <label>Introduction<textarea name="introduction" rows="6" required>Une sélection de ressources choisies et documentées.</textarea></label>
        <label>Description SEO<textarea name="seoDescription" rows="3" required>Intelligence artificielle, développement, design, édition et création numérique.</textarea></label>
        <div class="selection-summary" id="publication-selection">Aucun lien sélectionné.</div>
        <div class="form-actions">
          <button class="primary" id="submit-publication" type="submit" disabled>Publier les liens</button>
        </div>
        <div class="submission-status is-hidden" id="publication-submit-status" role="status" aria-live="polite"></div>
      </form>
    </section>

    <section class="admin-panel" data-panel="publications">
      <div class="section-heading"><div><p class="kicker">Déploiement</p><h2>Publications</h2></div></div>
      <div id="publication-list"><p class="loading">Chargement…</p></div>
    </section>

    <section class="admin-panel" data-panel="links">
      <div class="section-heading">
        <div><p class="kicker">Catalogue public</p><h2>Corriger un lien</h2></div>
        <form id="link-search-form" class="toolbar"><input id="link-search" type="search" placeholder="Titre, URL, catégorie"><button type="submit">Rechercher</button></form>
      </div>
      <div id="published-links"><p class="empty">Recherche un lien pour modifier ses métadonnées.</p></div>
    </section>

    <section class="admin-panel" data-panel="editions">
      <div class="section-heading">
        <div><p class="kicker">Archives</p><h2>Corriger une édition</h2></div>
        <div class="toolbar"><select id="edition-select"><option value="">Choisir une date</option></select></div>
      </div>
      <form id="edition-form" class="edition-form is-hidden">
        <label>Titre<input name="title" required maxlength="240"></label>
        <label>Introduction<textarea name="introduction" rows="8" required></textarea></label>
        <label>Description SEO<textarea name="seoDescription" rows="3" required></textarea></label>
        <div class="form-actions"><button class="primary" type="submit">Enregistrer la correction</button></div>
      </form>
    </section>

    <section class="admin-panel" data-panel="linkedin">
      <div class="section-heading"><div><p class="kicker">Publication native</p><h2>LinkedIn</h2></div></div>
      <div class="linkedin-setup">
        <p class="intro">Les identifiants sont chiffrés dans la base privée. Le Client Secret n’est jamais renvoyé au navigateur.</p>
        <form id="linkedin-config-form" class="edition-form">
          <label>Client ID<input name="clientId" required autocomplete="off"></label>
          <label>Client Secret<input name="clientSecret" type="password" required minlength="12" autocomplete="new-password"></label>
          <div class="form-actions"><button class="primary" type="submit">Enregistrer les identifiants</button></div>
        </form>
        <p class="feedback" id="linkedin-status" role="status" aria-live="polite"></p>
        <div class="form-actions"><button id="linkedin-connect" type="button" class="is-hidden">Connecter mon compte LinkedIn</button></div>
      </div>
    </section>

    <section class="admin-panel" data-panel="categories">
      <div class="section-heading"><div><p class="kicker">Classement</p><h2>Grandes catégories</h2></div></div>
      <form id="category-create-form" class="category-create-form">
        <label>Nouvelle catégorie<input name="name" required maxlength="100" autocomplete="off" placeholder="Ex. Culture numérique"></label>
        <button class="primary" type="submit">Ajouter</button>
        <label class="wide">Description<textarea name="description" maxlength="500" rows="3" placeholder="Le périmètre éditorial de cette catégorie…"></textarea></label>
      </form>
      <p class="intro">Un renommage met à jour les liens publiés et les brouillons concernés. Une catégorie utilisée doit être renommée avant de pouvoir être supprimée.</p>
      <div id="category-list"><p class="loading">Chargement…</p></div>
    </section>

    <section class="admin-panel" data-panel="themes">
      <div class="section-heading">
        <div><h2>Thèmes actifs</h2><p class="intro">Un vocabulaire court pour qualifier les liens. Les anciens tags restent consultables dans les archives, sans encombrer la saisie.</p></div>
        <div class="theme-register-summary"><strong id="theme-count">0</strong><span>thèmes actifs</span></div>
      </div>
      <form id="theme-create-form" class="theme-create-form">
        <label>Nom<input name="name" required maxlength="80" autocomplete="off" placeholder="Ex. architecture"></label>
        <label>Description<input name="description" maxlength="500" placeholder="Périmètre éditorial du thème"></label>
        <label>Alias<input name="aliases" maxlength="500" placeholder="Variantes séparées par des virgules"></label>
        <button class="primary" type="submit">Ajouter le thème</button>
      </form>
      <div class="toolbar"><input id="theme-search" type="search" placeholder="Rechercher un thème ou un alias" aria-label="Rechercher un thème ou un alias"></div>
      <div id="theme-list"><p class="loading">Chargement…</p></div>
    </section>

    <section class="admin-panel" data-panel="hidden">
      <div class="section-heading"><div><p class="kicker">Mémoire éditoriale</p><h2>Liens retirés</h2></div></div>
      <div id="hidden-links"><p class="loading">Chargement…</p></div>
    </section>
  `);

export const adminCss = `
:root{color-scheme:light;--paper:#f5f3ee;--ink:#171717;--muted:#68645e;--line:#d7d2c9;--accent:#ff5a36;--accent-text:#b72e10;--ok:#237a4b;--warn:#9b6400;--error:#8f2d1d;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink)}
main{width:min(1180px,calc(100% - 2rem));margin:auto;padding:clamp(2rem,7vw,5rem) 0}
header{display:flex;align-items:flex-start;justify-content:space-between;gap:2rem;border-bottom:1px solid var(--line);padding-bottom:2rem}
.kicker{margin:0;color:var(--accent-text);font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
h1{max-width:850px;margin:.5rem 0 1.5rem;font-family:Arial,Helvetica,sans-serif;font-size:clamp(3.5rem,10vw,6rem);letter-spacing:-.04em;line-height:.82;text-wrap:balance}
h2{margin:.35rem 0;font-family:Arial,Helvetica,sans-serif;font-size:clamp(2.2rem,6vw,4.8rem);letter-spacing:-.04em;line-height:.9;text-wrap:balance}
.intro{max-width:680px;color:var(--muted);font-size:1rem;line-height:1.7;text-wrap:pretty}
button,a,input,select,textarea{font:inherit}
button,a{border:1px solid var(--line);border-radius:.25rem;background:transparent;color:inherit;cursor:pointer;font-weight:700;text-decoration:none}
button{padding:.8rem 1rem}
button:disabled{cursor:not-allowed;opacity:.45}
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--accent-text);outline-offset:2px}
.primary{border-color:var(--accent);background:var(--accent);color:#111}
.header-actions,.toolbar,.form-actions{display:flex;flex-wrap:wrap;gap:.6rem}
.header-actions a{padding:.8rem 1rem}
.admin-version{align-self:center;color:var(--muted);font-size:.78rem;font-weight:700;letter-spacing:.08em}
.feedback{min-height:1.5em;color:var(--accent-text)}
.admin-nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr));gap:1px;background:var(--line);border:1px solid var(--line)}
.admin-nav button{min-width:0;border:0;border-radius:0;background:var(--paper);white-space:normal}
.admin-nav button.is-active{background:var(--ink);color:var(--paper)}
.admin-nav span{color:var(--accent-text)}
.admin-panel{display:none;padding:2.5rem 0}
.admin-panel.is-active{display:block}
.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:2rem;margin-bottom:2rem}
.toolbar{align-items:center}
.toolbar input,.toolbar select{min-width:220px}
.draft-card,.admin-link,.publication-card,.published-card{border-top:1px solid var(--line);padding:1.35rem 0}
.category-create-form{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:.8rem;max-width:760px;margin-bottom:1rem}
.category-create-form label{display:grid;gap:.4rem;color:var(--muted);font-size:.78rem}
.category-create-form label.wide{grid-column:1/-1}
.category-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:1rem;border-top:1px solid var(--line);padding:1rem 0}
.category-row label{display:grid;gap:.35rem;color:var(--muted);font-size:.72rem}
.category-row-meta{margin:.35rem 0 0;color:var(--muted);font-size:.75rem}
.category-actions{display:flex;gap:.6rem}
.danger{color:var(--error)}
.theme-register-summary{display:grid;min-width:9rem;border:1px solid var(--line);text-align:right}
.theme-register-summary strong{padding:.7rem .8rem .15rem;font-family:Arial,Helvetica,sans-serif;font-size:2rem;line-height:1}
.theme-register-summary span{padding:.15rem .8rem .7rem;color:var(--muted);font-size:.7rem;text-transform:uppercase}
.theme-create-form{display:grid;grid-template-columns:.7fr 1.3fr 1fr auto;align-items:end;gap:.7rem;margin-bottom:1.4rem}
.theme-create-form label,.theme-row label{display:grid;gap:.35rem;color:var(--muted);font-size:.72rem}
.theme-row{display:grid;grid-template-columns:.65fr 1.2fr 1fr auto;align-items:end;gap:.7rem;border-top:1px solid var(--line);padding:1rem 0}
.theme-row.is-filtered{display:none}
.theme-actions{display:flex;gap:.4rem}
.theme-usage{margin:.4rem 0 0;color:var(--muted);font-size:.68rem}
.draft-card{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1rem}
.draft-card.is-filtered{display:none}
.draft-select{width:1.2rem;height:1.2rem;margin-top:.4rem}
.draft-grid,.published-grid{display:grid;grid-template-columns:2fr 1fr;gap:.8rem}
.draft-grid label,.published-grid label,.edition-form label{display:grid;gap:.4rem;color:var(--muted);font-size:.78rem}
.published-grid small{max-width:72ch;color:var(--muted);font-size:.7rem;line-height:1.45}
.published-grid label.reactivate-control{display:flex;grid-column:1/-1;align-items:start;gap:.65rem;padding:.8rem;border:1px solid var(--line);color:var(--ink);line-height:1.45}
.reactivate-control input{width:1.15rem;height:1.15rem;margin:.05rem 0 0}
.draft-grid label.wide,.published-grid label.wide{grid-column:1/-1}
.theme-field{display:grid;grid-column:1/-1;gap:.4rem;color:var(--muted);font-size:.78rem}
.theme-picker{position:relative;border:1px solid var(--line);background:#fff;padding:.55rem}
.theme-selection{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.45rem}
.theme-selection:empty{display:none}
.theme-token{display:inline-flex;align-items:center;gap:.45rem;min-height:2rem;border:1px solid var(--ink);padding:.3rem .5rem;background:var(--paper);color:var(--ink);font-size:.72rem}
.theme-token button{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;margin:-.45rem -.5rem -.45rem 0;border:0;padding:.35rem;color:var(--muted);font-size:.62rem;line-height:1;text-transform:uppercase}
.theme-picker input[type="search"]{border:0;padding:.4rem .25rem;outline:0}
.theme-picker input[type="search"]:focus-visible{outline:0}
.theme-picker:focus-within{outline:3px solid var(--accent-text);outline-offset:2px}
.theme-suggestions{position:absolute;z-index:4;top:calc(100% + .25rem);right:-1px;left:-1px;display:grid;max-height:16rem;overflow:auto;border:1px solid var(--ink);background:var(--paper)}
.theme-suggestions:empty{display:none}
.theme-option{display:grid;gap:.15rem;border:0;border-bottom:1px solid var(--line);border-radius:0;padding:.65rem;text-align:left}
.theme-option:last-child{border-bottom:0}
.theme-option:hover,.theme-option:focus-visible{background:var(--ink);color:var(--paper);outline:0}
.theme-option small{color:inherit;font-weight:400;opacity:.72}
.theme-help{margin:0;color:var(--muted);font-size:.68rem;line-height:1.45}
.sr-only{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
.draft-url,.admin-link p{overflow-wrap:anywhere;color:var(--muted);font-size:.8rem}
.card-actions{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-top:1rem}
.missing{color:var(--warn);font-size:.78rem}
.complete{color:var(--ok);font-size:.78rem}
.edition-form{display:grid;gap:1rem;max-width:900px}
.linkedin-setup{display:grid;gap:1rem;max-width:760px}
.field-row{display:grid;grid-template-columns:1fr 2fr;gap:1rem}
input,select,textarea{width:100%;border:1px solid var(--line);border-radius:.25rem;background:#fff;color:var(--ink);padding:.72rem}
::placeholder{color:#5f5b55;opacity:1}
.selection-summary{padding:1rem;border:1px solid var(--line);color:var(--muted)}
.submission-status{padding:1rem;border-top:1px solid var(--line)}
.publication-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1rem}
.publication-detail{grid-column:1/-1;max-width:760px}
.publication-copy{margin:.65rem 0 0;color:var(--muted);line-height:1.55}
.publication-error{color:var(--error)}
.publication-links{display:flex;flex-wrap:wrap;gap:.5rem;margin:.8rem 0 0}
.publication-links a,.publication-links button{padding:.45rem .65rem;font-size:.75rem}
.publication-progress{margin-top:.85rem}
.progress-track{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.35rem}
.progress-segment{position:relative;height:.4rem;overflow:hidden;border-radius:1rem;background:#ded9d0}
.progress-segment.is-complete{background:var(--ok)}
.progress-segment.is-active{background:#f0c8be}
.progress-segment.is-active::after{position:absolute;inset:0;width:45%;border-radius:inherit;background:var(--accent);content:"";animation:progress-scan 1.2s cubic-bezier(.22,1,.36,1) infinite}
.progress-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.35rem;margin-top:.45rem;color:var(--muted);font-size:.68rem}
.progress-step{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.progress-step.is-complete{color:var(--ok)}
.progress-step.is-current{color:var(--ink);font-weight:700}
.status{display:inline-block;padding:.25rem .5rem;border-radius:2rem;background:#e7e2d8;font-size:.72rem}
.status-live{background:#d6eddf;color:var(--ok)}
.status-failed{background:#f5d6cf;color:var(--error)}
.published-card h3,.admin-link h3,.publication-card h3{margin:.2rem 0;font-family:Arial,Helvetica,sans-serif;font-size:1.5rem}
.admin-link{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2rem}
.empty,.loading{padding:2rem 0;color:var(--muted)}
.is-hidden{display:none!important}
@keyframes progress-scan{from{transform:translateX(-110%)}to{transform:translateX(225%)}}
@media(max-width:760px){header,.section-heading,.publication-card,.admin-link,.category-row,.category-create-form,.theme-row,.theme-create-form{display:grid;grid-template-columns:1fr}.admin-nav{grid-template-columns:repeat(2,minmax(0,1fr))}.draft-grid,.published-grid,.field-row{grid-template-columns:1fr}.header-actions{margin-top:0}.toolbar input,.toolbar select{min-width:0}.theme-register-summary{width:100%;text-align:left}.progress-steps{font-size:.62rem}}
@media(prefers-reduced-motion:reduce){.progress-segment.is-active::after{width:100%;animation:none;opacity:.72}}
`;

export const adminJs = `
const feedback=document.querySelector("#admin-feedback");
const show=(message)=>{if(feedback)feedback.textContent=message||""};
const linkedinReturn=sessionStorage.getItem("digest-linkedin-return");
if(linkedinReturn&&document.querySelector("[data-panel]")){sessionStorage.removeItem("digest-linkedin-return");location.assign(linkedinReturn)}
const esc=(value)=>String(value??"").replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
const correctionErrorLabel=(code)=>({INVALID_URL:"Saisissez une URL complète.",UNSUPPORTED_SCHEME:"Utilisez une adresse HTTP ou HTTPS.",URL_CREDENTIALS:"Retirez les identifiants intégrés à l’URL.",PRIVATE_URL:"Cette adresse privée ou locale ne peut pas être publiée.",AUTHENTICATED_PAGE:"Une page d’administration ou de connexion ne peut pas être publiée.",SENSITIVE_QUERY:"Retirez les paramètres sensibles de l’URL.",DUPLICATE_LINK_URL:"Cette URL est déjà utilisée par un autre lien.",UNKNOWN_TAG:"Choisissez un thème existant dans les suggestions.",TOO_MANY_THEMES:"Choisissez au maximum trois thèmes."}[code]||code);
const api=async(path,options={})=>{
  const response=await fetch(path,{credentials:"same-origin",...options,headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})}});
  if(response.status===401||response.status===403){location.assign("/admin");throw new Error("AUTHENTICATION_REQUIRED")}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.error||"ADMIN_OPERATION_FAILED");error.details=data.details;error.status=response.status;throw error}
  return data;
};
document.querySelector("#admin-login")?.addEventListener("click",async(event)=>{
  const button=event.currentTarget;button.disabled=true;show("Connexion en cours…");
  try{const data=await api("/api/auth/sign-in/social",{method:"POST",body:JSON.stringify({provider:"github",callbackURL:"/admin"})});if(!data.url)throw new Error("Connexion impossible");location.assign(data.url)}
  catch(error){button.disabled=false;show(error.message||"Connexion impossible")}
});
document.querySelector("#admin-logout")?.addEventListener("click",async()=>{await api("/api/auth/sign-out",{method:"POST",body:"{}"});location.assign("/admin")});

const panels=[...document.querySelectorAll("[data-panel]")];
const panelButtons=[...document.querySelectorAll("[data-panel-button]")];
const openPanel=(name)=>{panels.forEach((panel)=>panel.classList.toggle("is-active",panel.dataset.panel===name));panelButtons.forEach((button)=>{const active=button.dataset.panelButton===name;button.classList.toggle("is-active",active);button.setAttribute("aria-pressed",String(active))})};
panelButtons.forEach((button)=>button.addEventListener("click",()=>openPanel(button.dataset.panelButton)));

let options={categories:[],tags:[],themes:[]};
let drafts=[];
const selected=new Set();
const categoryOptions=(value)=>'<option value=""></option>'+options.categories.map((category)=>'<option '+(category===value?'selected':'')+'>'+esc(category)+'</option>').join("");
const categoryErrorLabel=(error)=>{
  if(error.message==="CATEGORY_ALREADY_EXISTS")return "Cette catégorie existe déjà.";
  if(error.message==="CATEGORY_NOT_FOUND")return "Cette catégorie n’existe plus.";
  if(error.message==="INVALID_CATEGORY_NAME")return "Saisissez un nom de catégorie valide.";
  if(error.message==="CATEGORY_IN_USE")return "Catégorie utilisée par "+(error.details?.linkCount||0)+" lien(s) et "+(error.details?.draftCount||0)+" brouillon(s). Renommez-la d’abord.";
  return error.message;
};
const renderCategories=(categories)=>{
  const target=document.querySelector("#category-list");if(!target)return;
  if(!categories.length){target.innerHTML='<p class="empty">Aucune catégorie.</p>';return}
  target.innerHTML=categories.map((category)=>'<article class="category-row" data-category-name="'+esc(category.name)+'"><div><label>Nom<input name="categoryName" maxlength="100" required value="'+esc(category.name)+'"></label><label>Description<textarea name="categoryDescription" maxlength="500" rows="3" placeholder="Le périmètre éditorial de cette catégorie…">'+esc(category.description)+'</textarea></label><p class="category-row-meta">'+category.linkCount+' lien(s) publié(s) · '+category.draftCount+' brouillon(s)</p></div><div class="category-actions"><button type="button" data-rename-category>Enregistrer</button><button class="danger" type="button" data-delete-category '+(category.linkCount||category.draftCount?'disabled title="Catégorie utilisée"':'')+'>Supprimer</button></div></article>').join("");
};
const loadCategories=async()=>{const data=await api("/api/admin/categories");renderCategories(data.categories);return data.categories};
const renderThemes=(themes=options.themes)=>{const target=document.querySelector("#theme-list");if(!target)return;document.querySelector("#theme-count").textContent=String(themes.length);target.innerHTML=themes.map((theme)=>'<article class="theme-row" data-theme-row data-theme-name="'+esc(theme.name)+'" data-theme-search-text="'+esc((theme.name+" "+theme.aliases.join(" ")).toLocaleLowerCase("fr"))+'"><label>Nom<input name="themeName" maxlength="80" value="'+esc(theme.name)+'"></label><label>Description<input name="themeDescription" maxlength="500" value="'+esc(theme.description)+'"></label><label>Alias<input name="themeAliases" maxlength="500" value="'+esc(theme.aliases.join(", "))+'"><span class="theme-usage">'+(theme.linkCount??0)+' lien(s) actif(s)</span></label><div class="theme-actions"><button type="button" data-save-theme>Enregistrer</button><button class="danger" type="button" data-archive-theme>Archiver</button></div></article>').join("");filterThemes()};
const filterThemes=()=>{const query=(document.querySelector("#theme-search")?.value||"").trim().toLocaleLowerCase("fr");document.querySelectorAll('[data-theme-row]').forEach((row)=>row.classList.toggle("is-filtered",Boolean(query)&&!row.dataset.themeSearchText.includes(query)))};
document.querySelector("#theme-search")?.addEventListener("input",filterThemes);
const loadThemes=async()=>{const data=await api("/api/admin/themes");options.themes=data.themes;options.tags=data.themes.map((theme)=>theme.name);renderThemes(data.themes);return data.themes};
const refreshTaxonomy=async()=>{options=await api("/api/admin/curation/options");await Promise.all([loadCategories(),loadThemes(),loadDrafts()]);const published=document.querySelector("#published-links");if(published)published.innerHTML='<p class="empty">Recherche un lien pour modifier ses métadonnées.</p>'};
const refreshCategories=refreshTaxonomy;
const themeAliases=(value)=>value.split(",").map((alias)=>alias.trim()).filter(Boolean);
document.querySelector("#theme-create-form")?.addEventListener("submit",async(event)=>{event.preventDefault();const form=event.currentTarget,button=event.submitter;button.disabled=true;try{await api("/api/admin/themes",{method:"POST",body:JSON.stringify({name:form.elements.name.value,description:form.elements.description.value,aliases:themeAliases(form.elements.aliases.value),confirm:true})});form.reset();await refreshTaxonomy();show("Thème ajouté. Un nouveau déploiement est lancé.")}catch(error){show("Thème impossible à ajouter : "+error.message)}finally{button.disabled=false}});
document.querySelector("#theme-list")?.addEventListener("click",async(event)=>{const save=event.target.closest('[data-save-theme]'),archive=event.target.closest('[data-archive-theme]');if(!save&&!archive)return;const row=event.target.closest('[data-theme-name]'),current=row.dataset.themeName;event.target.disabled=true;try{if(archive){if(!confirm('Archiver le thème « '+current+' » ? Ses liens et son ancienne route seront conservés. Le thème sera retiré des brouillons en cours.'))return;const data=await api("/api/admin/themes/"+encodeURIComponent(current),{method:"DELETE",body:JSON.stringify({confirm:true})});await refreshTaxonomy();show("Thème archivé · "+data.preservedLinks+" lien(s) historique(s) conservé(s) · thème retiré de "+data.removedDrafts+" brouillon(s).") }else{const data=await api("/api/admin/themes/"+encodeURIComponent(current),{method:"PATCH",body:JSON.stringify({name:row.querySelector('[name="themeName"]').value,description:row.querySelector('[name="themeDescription"]').value,aliases:themeAliases(row.querySelector('[name="themeAliases"]').value),confirm:true})});await refreshTaxonomy();show((data.merged?"Thèmes fusionnés":"Thème enregistré")+" · "+data.migrated+" lien(s) et "+data.migratedDrafts+" brouillon(s) migré(s).")}}catch(error){show("Modification du thème impossible : "+error.message)}finally{event.target.disabled=false}});
document.querySelector("#category-create-form")?.addEventListener("submit",async(event)=>{event.preventDefault();const form=event.currentTarget,button=event.submitter;button.disabled=true;try{await api("/api/admin/categories",{method:"POST",body:JSON.stringify({name:form.elements.name.value,description:form.elements.description.value,confirm:true})});form.reset();await refreshCategories();show("Catégorie ajoutée. Un nouveau déploiement est lancé.")}catch(error){show(categoryErrorLabel(error))}finally{button.disabled=false}});
document.querySelector("#category-list")?.addEventListener("click",async(event)=>{const rename=event.target.closest("[data-rename-category]"),remove=event.target.closest("[data-delete-category]");if(!rename&&!remove)return;const row=event.target.closest("[data-category-name]"),current=row.dataset.categoryName;event.target.disabled=true;try{if(remove){if(!confirm('Supprimer la catégorie « '+current+' » ?'))return;await api("/api/admin/categories/"+encodeURIComponent(current),{method:"DELETE",body:JSON.stringify({confirm:true})});await refreshCategories();show("Catégorie supprimée. Un nouveau déploiement est lancé.")}else{const replacement=row.querySelector('[name="categoryName"]').value,description=row.querySelector('[name="categoryDescription"]').value;const data=await api("/api/admin/categories/"+encodeURIComponent(current),{method:"PATCH",body:JSON.stringify({name:replacement,description,confirm:true})});await refreshCategories();show(data.changed?(current===replacement?"Description de la catégorie enregistrée.":"Catégorie renommée. "+data.migrated.links+" lien(s) et "+data.migrated.drafts+" brouillon(s) mis à jour."):"Aucune modification à enregistrer.")}}catch(error){event.target.disabled=false;show(categoryErrorLabel(error))}});
const themeTokens=(tags)=>tags.map((tag)=>'<span class="theme-token">'+esc(tag)+'<button type="button" data-remove-theme="'+esc(tag)+'" aria-label="Retirer le thème '+esc(tag)+'">Retirer</button></span>').join("");
const themePickerMarkup=(tags,key)=>'<div class="theme-field"><label id="theme-label-'+esc(key)+'" for="theme-search-'+esc(key)+'">Thèmes <small>· facultatifs · 3 maximum</small></label><div class="theme-picker" data-theme-picker><div class="theme-selection">'+themeTokens(tags)+'</div><input id="theme-search-'+esc(key)+'" type="search" data-theme-search role="combobox" aria-labelledby="theme-label-'+esc(key)+'" aria-expanded="false" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="theme-options-'+esc(key)+'" autocomplete="off" placeholder="Ajouter un thème…"><div class="theme-suggestions" id="theme-options-'+esc(key)+'" role="listbox"></div><p class="sr-only" data-theme-status role="status" aria-live="polite"></p><input type="hidden" name="tags" value="'+esc(JSON.stringify(tags))+'"></div><p class="theme-help">Recherche uniquement dans le registre actif. Les anciens tags déjà publiés restent conservés.</p></div>';
const pickerTags=(picker)=>{try{return JSON.parse(picker.querySelector('[name="tags"]').value)}catch{return[]}};
const closeThemeSuggestions=(picker)=>{const search=picker.querySelector('[data-theme-search]');picker.dataset.activeThemeIndex="-1";search.setAttribute("aria-expanded","false");search.removeAttribute("aria-activedescendant");picker.querySelector('.theme-suggestions').innerHTML=""};
const setActiveThemeOption=(picker,index)=>{const search=picker.querySelector('[data-theme-search]'),items=[...picker.querySelectorAll('[data-add-theme]')];if(!items.length){search.removeAttribute("aria-activedescendant");picker.dataset.activeThemeIndex="-1";return}const active=(index+items.length)%items.length;picker.dataset.activeThemeIndex=String(active);items.forEach((item,itemIndex)=>item.setAttribute("aria-selected",String(itemIndex===active)));search.setAttribute("aria-activedescendant",items[active].id);items[active].scrollIntoView({block:"nearest"})};
const updateThemePicker=(picker,tags)=>{picker.querySelector('[name="tags"]').value=JSON.stringify(tags);picker.querySelector('.theme-selection').innerHTML=themeTokens(tags);const search=picker.querySelector('[data-theme-search]');search.value="";closeThemeSuggestions(picker);picker.querySelector('[data-theme-status]').textContent=tags.length?tags.length+" thème"+(tags.length>1?"s":"")+" sélectionné"+(tags.length>1?"s":"")+".":"Aucun thème sélectionné."};
const renderThemeSuggestions=(picker,query="")=>{const selected=pickerTags(picker),needle=query.trim().toLocaleLowerCase("fr"),target=picker.querySelector('.theme-suggestions'),search=picker.querySelector('[data-theme-search]'),status=picker.querySelector('[data-theme-status]');if(selected.length>=3){closeThemeSuggestions(picker);status.textContent="Maximum de trois thèmes atteint.";return}const matches=options.themes.filter((theme)=>!selected.includes(theme.name)&&(!needle||(theme.name+" "+theme.aliases.join(" ")).toLocaleLowerCase("fr").includes(needle))).slice(0,8);target.innerHTML=matches.map((theme,index)=>'<button id="'+target.id+'-option-'+index+'" class="theme-option" type="button" role="option" aria-selected="false" data-add-theme="'+esc(theme.name)+'"><strong>'+esc(theme.name)+'</strong>'+(theme.description?'<small>'+esc(theme.description)+'</small>':'')+'</button>').join("");search.setAttribute("aria-expanded",String(Boolean(matches.length)));status.textContent=matches.length?matches.length+" résultat"+(matches.length>1?"s":"")+" disponible"+(matches.length>1?"s":"")+".":"Aucun thème trouvé.";if(matches.length)setActiveThemeOption(picker,0);else search.removeAttribute("aria-activedescendant")};
document.addEventListener("input",(event)=>{if(event.target.matches('[data-theme-search]'))renderThemeSuggestions(event.target.closest('[data-theme-picker]'),event.target.value)});
document.addEventListener("focusin",(event)=>{if(event.target.matches('[data-theme-search]'))renderThemeSuggestions(event.target.closest('[data-theme-picker]'),event.target.value)});
document.addEventListener("keydown",(event)=>{if(!event.target.matches('[data-theme-search]'))return;const picker=event.target.closest('[data-theme-picker]'),items=[...picker.querySelectorAll('[data-add-theme]')];if(event.key==="Escape"){event.preventDefault();closeThemeSuggestions(picker);return}if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();if(!items.length){renderThemeSuggestions(picker,event.target.value);return}const current=Number(picker.dataset.activeThemeIndex||0);setActiveThemeOption(picker,current+(event.key==="ArrowDown"?1:-1));return}if(event.key==="Enter"){const active=items[Number(picker.dataset.activeThemeIndex||0)];if(active){event.preventDefault();active.click()}}});
document.addEventListener("click",(event)=>{const add=event.target.closest('[data-add-theme]'),remove=event.target.closest('[data-remove-theme]');if(add){const picker=add.closest('[data-theme-picker]');updateThemePicker(picker,[...pickerTags(picker),add.dataset.addTheme]);picker.querySelector('[data-theme-search]').focus();return}if(remove){const picker=remove.closest('[data-theme-picker]');updateThemePicker(picker,pickerTags(picker).filter((tag)=>tag!==remove.dataset.removeTheme));picker.querySelector('[data-theme-search]').focus();return}if(!event.target.closest('[data-theme-picker]'))document.querySelectorAll('[data-theme-picker]').forEach(closeThemeSuggestions)});
const missing=(draft)=>[!draft.title&&"titre",!draft.category&&"catégorie",!draft.description&&"résumé"].filter(Boolean);
const renderDrafts=()=>{
  const list=document.querySelector("#draft-list");if(!list)return;
  document.querySelector("#draft-count").textContent=String(drafts.length);
  if(!drafts.length){list.innerHTML='<p class="empty">Aucun brouillon. L’extension Chrome peut alimenter cette file.</p>';updateSelection();return}
  list.innerHTML=drafts.map((draft)=>{
    const gaps=missing(draft);
    return '<article class="draft-card" data-draft-id="'+esc(draft.id)+'" data-complete="'+(!gaps.length)+'">'+
      '<input class="draft-select" type="checkbox" aria-label="Sélectionner" '+(selected.has(draft.id)?'checked':'')+'>'+
      '<div><p class="draft-url">'+esc(draft.url)+'</p><div class="draft-grid">'+
      '<label>Titre<input name="title" value="'+esc(draft.title)+'"></label>'+
      '<label>Catégorie<select name="category">'+categoryOptions(draft.category)+'</select></label>'+
      '<label class="wide">Résumé<textarea name="description" rows="3">'+esc(draft.description)+'</textarea></label>'+
      themePickerMarkup(draft.tags,"draft-"+draft.id)+
      '<label class="wide">Note privée<textarea name="privateNote" rows="2">'+esc(draft.privateNote)+'</textarea></label></div>'+
      '<div class="card-actions"><span class="'+(gaps.length?'missing':'complete')+'">'+(gaps.length?'Manque : '+esc(gaps.join(", ")):'Prêt à publier')+'</span><div><button type="button" data-delete-draft>Supprimer</button> <button type="button" data-save-draft>Enregistrer</button></div></div></div></article>';
  }).join("");
  filterDrafts();updateSelection();
};
const loadDrafts=async()=>{const data=await api("/api/admin/curation/drafts");drafts=data.drafts;for(const id of [...selected])if(!drafts.some((draft)=>draft.id===id))selected.delete(id);renderDrafts()};
const draftBody=(card)=>({title:card.querySelector('[name="title"]').value,category:card.querySelector('[name="category"]').value,description:card.querySelector('[name="description"]').value,tags:pickerTags(card.querySelector('[data-theme-picker]')),privateNote:card.querySelector('[name="privateNote"]').value,confirm:true});
document.querySelector("#draft-list")?.addEventListener("click",async(event)=>{
  const card=event.target.closest("[data-draft-id]");if(!card)return;
  if(event.target.matches(".draft-select")){event.target.checked?selected.add(card.dataset.draftId):selected.delete(card.dataset.draftId);updateSelection();return}
  const save=event.target.closest("[data-save-draft]"),remove=event.target.closest("[data-delete-draft]");
  if(!save&&!remove)return;
  event.target.disabled=true;
  try{
    if(remove){await api("/api/admin/curation/drafts/"+encodeURIComponent(card.dataset.draftId),{method:"DELETE",body:JSON.stringify({confirm:true})});selected.delete(card.dataset.draftId);show("Brouillon supprimé.");await loadDrafts()}
    else{const data=await api("/api/admin/curation/drafts/"+encodeURIComponent(card.dataset.draftId),{method:"PATCH",body:JSON.stringify(draftBody(card))});drafts=drafts.map((draft)=>draft.id===data.draft.id?data.draft:draft);renderDrafts();show("Brouillon enregistré · "+data.draft.tags.length+" tag"+(data.draft.tags.length>1?"s":"")+".")}
  }catch(error){event.target.disabled=false;show("Erreur : "+error.message)}
});
const filterDrafts=()=>{
  const query=(document.querySelector("#draft-search")?.value||"").toLowerCase();
  const filter=document.querySelector("#draft-filter")?.value||"all";
  document.querySelectorAll("[data-draft-id]").forEach((card)=>{
    const matchesText=!query||card.textContent.toLowerCase().includes(query);
    const complete=card.dataset.complete==="true";
    const matchesState=filter==="all"||(filter==="complete"&&complete)||(filter==="incomplete"&&!complete);
    card.classList.toggle("is-filtered",!matchesText||!matchesState);
  });
};
document.querySelector("#draft-search")?.addEventListener("input",()=>{filterDrafts();updateSelection()});
document.querySelector("#draft-filter")?.addEventListener("change",()=>{filterDrafts();updateSelection()});
const visibleDraftCards=()=>[...document.querySelectorAll("[data-draft-id]:not(.is-filtered)")];
const updateSelection=()=>{
  document.querySelector("#selected-count").textContent=String(selected.size);
  const selectAll=document.querySelector("#select-all-drafts");
  const visibleIds=visibleDraftCards().map((card)=>card.dataset.draftId);
  const allSelected=visibleIds.length>0&&visibleIds.every((id)=>selected.has(id));
  if(selectAll){selectAll.disabled=!visibleIds.length;selectAll.setAttribute("aria-pressed",String(allSelected));selectAll.textContent=allSelected?"Tout désélectionner":"Tout sélectionner"}
  const summary=document.querySelector("#publication-selection");
  if(summary)summary.textContent=selected.size?selected.size+" lien"+(selected.size>1?"s":"")+" sélectionné"+(selected.size>1?"s":"")+".":"Aucun lien sélectionné.";
  const submit=document.querySelector("#submit-publication");
  if(submit){submit.disabled=!selected.size||submit.dataset.busy==="true";submit.textContent=selected.size===1?"Publier le lien":selected.size>1?"Publier les "+selected.size+" liens":"Publier les liens"}
};
document.querySelector("#select-all-drafts")?.addEventListener("click",()=>{
  const visibleIds=visibleDraftCards().map((card)=>card.dataset.draftId);
  const allSelected=visibleIds.length>0&&visibleIds.every((id)=>selected.has(id));
  if(allSelected)visibleIds.forEach((id)=>selected.delete(id));else visibleIds.forEach((id)=>selected.add(id));
  renderDrafts();
});

const activePublicationStates=new Set(["committing","validating","deploying"]);
const publicationStages={committing:1,validating:2,deploying:3,live:4};
const publicationStepLabels=["Préparation","Validation","Déploiement","En ligne"];
const publicationStateLabels={committing:"Préparation",validating:"Validation",deploying:"Déploiement",live:"En ligne",failed:"Échec"};
const publicationStateCopy={committing:"Préparation du Digest…",validating:"Validation et build GitHub en cours…",deploying:"Mise en ligne en cours…",live:"Le Digest est en ligne.",failed:"Publication interrompue."};
const publicationProgressMarkup=(item)=>{
  if(item.state==="failed")return '<div class="publication-detail" role="status"><p class="publication-copy publication-error">'+esc(publicationStateCopy.failed)+(item.errorCode?' · '+esc(item.errorCode):'')+'</p></div>';
  const stage=publicationStages[item.state]||1;
  const segments=publicationStepLabels.map((label,index)=>{
    const step=index+1;const state=step<stage||item.state==="live"?"is-complete":step===stage?"is-active":"";
    return '<span class="progress-segment '+state+'" aria-hidden="true"></span>';
  }).join("");
  const labels=publicationStepLabels.map((label,index)=>{
    const step=index+1;const state=step<stage||item.state==="live"?"is-complete":step===stage?"is-current":"";
    return '<span class="progress-step '+state+'">'+esc(label)+'</span>';
  }).join("");
  return '<div class="publication-detail"><div class="publication-progress" role="progressbar" aria-label="Progression de la publication" aria-valuemin="1" aria-valuemax="4" aria-valuenow="'+stage+'" aria-valuetext="'+esc(publicationStateCopy[item.state]||item.state)+'"><div class="progress-track">'+segments+'</div><div class="progress-steps" aria-hidden="true">'+labels+'</div></div><p class="publication-copy">'+esc(publicationStateCopy[item.state]||item.state)+'</p></div>';
};
const publicationLinksMarkup=(item)=>{
  const links=[];
  const workflowUrl=item.deployUrl||item.validateUrl;
  if(workflowUrl)links.push('<a href="'+esc(workflowUrl)+'" target="_blank" rel="noopener">GitHub Actions</a>');
  if(item.state==="live")links.push('<a href="/archives/'+encodeURIComponent(item.digestDate)+'/">Voir l’édition</a>');
  if(item.state==="failed")links.push('<button type="button" data-refresh-publication>Revérifier</button>');
  return links.length?'<p class="publication-links">'+links.join("")+'</p>':"";
};
const renderPublications=(items)=>{
  const list=document.querySelector("#publication-list");if(!list)return;
  if(!items.length){list.innerHTML='<p class="empty">Aucune publication initiée depuis cet atelier.</p>';return}
  const activeIndex=items.findIndex((item)=>activePublicationStates.has(item.state));
  const detailedIndex=activeIndex>=0?activeIndex:0;
  list.innerHTML=items.map((item,index)=>'<article class="publication-card" data-publication-id="'+esc(item.id)+'"><div><p class="kicker">'+esc(item.digestDate)+'</p><h3>'+esc(item.title)+'</h3><p class="draft-url">'+esc(item.commitSha||"Commit en préparation")+'</p>'+publicationLinksMarkup(item)+'</div><div><span class="status status-'+esc(item.state)+'">'+esc(publicationStateLabels[item.state]||item.state)+'</span></div>'+(index===detailedIndex?publicationProgressMarkup(item):'')+'</article>').join("");
};
const loadPublications=async()=>{const data=await api("/api/admin/curation/publications");renderPublications(data.publications);return data.publications};
document.querySelector("#publication-list")?.addEventListener("click",async(event)=>{
  const button=event.target.closest("[data-refresh-publication]");if(!button)return;
  const card=button.closest("[data-publication-id]"),id=card.dataset.publicationId;button.disabled=true;show("Vérification de l’édition publique…");
  try{const data=await api("/api/admin/curation/publications/"+encodeURIComponent(id));await loadPublications();announcePublicationState(data.publication);show(data.publication.state==="live"?"Édition confirmée en ligne.":"L’édition publique n’est pas encore confirmée.")}
  catch(error){show("Vérification impossible : "+error.message)}
  finally{if(button.isConnected)button.disabled=false}
});

let publicationPollTimer=null;
let publicationPollInFlight=false;
let activePublicationId=null;
let pendingPublicationRequestId=null;
const announcedPublicationStates=new Map();
const clearPublicationPolling=()=>{if(publicationPollTimer)clearTimeout(publicationPollTimer);publicationPollTimer=null;activePublicationId=null};
const schedulePublicationPoll=(id)=>{if(publicationPollTimer)clearTimeout(publicationPollTimer);publicationPollTimer=setTimeout(()=>pollPublication(id),15000)};
const announcePublicationState=(item)=>{
  const previous=announcedPublicationStates.get(item.id);
  announcedPublicationStates.set(item.id,item.state);
  if(previous!==item.state)show(publicationStateCopy[item.state]+(item.state==="failed"&&item.errorCode?" "+item.errorCode:""));
};
const pollPublication=async(id)=>{
  if(activePublicationId!==id||publicationPollInFlight)return;
  if(publicationPollTimer)clearTimeout(publicationPollTimer);publicationPollTimer=null;publicationPollInFlight=true;
  try{
    const data=await api("/api/admin/curation/publications/"+encodeURIComponent(id));
    await loadPublications();announcePublicationState(data.publication);
    if(activePublicationStates.has(data.publication.state))schedulePublicationPoll(id);else clearPublicationPolling();
  }catch(error){show("Suivi momentanément indisponible. Nouvelle tentative automatique…");if(activePublicationId===id)schedulePublicationPoll(id)}
  finally{publicationPollInFlight=false}
};
const startPublicationPolling=(id,immediate=true)=>{
  if(activePublicationId!==id){clearPublicationPolling();activePublicationId=id}
  if(immediate)pollPublication(id);else schedulePublicationPoll(id);
};
const resumePublicationPolling=(items)=>{
  const active=[...items].filter((item)=>activePublicationStates.has(item.state)).sort((left,right)=>String(right.createdAt||"").localeCompare(String(left.createdAt||"")))[0];
  if(active)startPublicationPolling(active.id);else clearPublicationPolling();
};
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&activePublicationId)pollPublication(activePublicationId)});

const setSubmissionStatus=(state,message)=>{
  const target=document.querySelector("#publication-submit-status");if(!target)return;
  target.classList.remove("is-hidden");target.innerHTML='<strong>'+esc(message)+'</strong>'+publicationProgressMarkup({state});
};
const clearSubmissionStatus=()=>{const target=document.querySelector("#publication-submit-status");if(target){target.classList.add("is-hidden");target.innerHTML=""}};
const publicationPayload=(requestId)=>{
  const form=new FormData(document.querySelector("#publication-form"));
  return {requestId,draftIds:[...selected],digestDate:String(form.get("digestDate")||""),title:String(form.get("title")||""),introduction:String(form.get("introduction")||""),seoDescription:String(form.get("seoDescription")||"")};
};
document.querySelector("#publication-form")?.addEventListener("submit",async(event)=>{
  event.preventDefault();if(!selected.size)return;
  const button=document.querySelector("#submit-publication");button.dataset.busy="true";updateSelection();
  pendingPublicationRequestId=pendingPublicationRequestId||crypto.randomUUID();
  setSubmissionStatus("committing","Contrôle et création du commit…");
  try{
    let publication;
    try{
      const payload=publicationPayload(pendingPublicationRequestId);payload.confirm=true;
      const data=await api("/api/admin/curation/publications",{method:"POST",body:JSON.stringify(payload)});
      publication=data.publication;
    }catch(error){if(error.status)pendingPublicationRequestId=null;setSubmissionStatus("failed","Publication impossible : "+error.message);show("Publication impossible : "+error.message);return}
    pendingPublicationRequestId=null;announcedPublicationStates.set(publication.id,publication.state);selected.clear();
    openPanel("publications");clearSubmissionStatus();show("Commit créé. Validation GitHub en cours…");startPublicationPolling(publication.id,false);
    try{await Promise.all([loadDrafts(),loadPublications()])}catch(error){show("Publication lancée. Actualisation momentanément indisponible ; le suivi continue automatiquement.")}
  }
  finally{button.dataset.busy="false";updateSelection()}
});

const renderPublishedLinks=(links)=>{
  const target=document.querySelector("#published-links");
  if(!links.length){target.innerHTML='<p class="empty">Aucun lien trouvé.</p>';return}
  target.innerHTML=links.map((link)=>'<article class="published-card" data-link-id="'+esc(link.id)+'"><h3 data-link-title>'+esc(link.title)+'</h3><p class="draft-url">Ajouté le '+esc(link.added)+' · identifiant conservé</p><div class="published-grid"><label class="wide">URL publique<input name="url" type="url" inputmode="url" autocomplete="url" required value="'+esc(link.url)+'" aria-describedby="url-help-'+esc(link.id)+'"><small id="url-help-'+esc(link.id)+'">L’adresse sera normalisée. L’identifiant et la date d’ajout ne changeront pas.</small></label><label>Titre<input name="title" value="'+esc(link.title)+'"></label><label>Catégorie<select name="category">'+categoryOptions(link.category)+'</select></label><label class="wide">Résumé<textarea name="description" rows="3">'+esc(link.description)+'</textarea></label>'+themePickerMarkup(link.tags,"link-"+link.id)+(link.status==="dead"?'<label class="reactivate-control"><input name="reactivate" type="checkbox" checked><span>Cette adresse correspond bien à la ressource. Retirer le statut « lien mort » et la marquer active.</span></label>':'')+'</div><div class="card-actions"><span data-link-status>'+esc(link.status||"")+'</span><button type="button" data-save-link>Enregistrer la correction</button></div></article>').join("");
};
document.querySelector("#link-search-form")?.addEventListener("submit",async(event)=>{event.preventDefault();show("Recherche…");try{const query=document.querySelector("#link-search").value;const data=await api("/api/admin/links?q="+encodeURIComponent(query)+"&limit=100");renderPublishedLinks(data.links);show(data.links.length+" résultat(s).")}catch(error){show(error.message)}});
document.querySelector("#published-links")?.addEventListener("click",async(event)=>{const button=event.target.closest("[data-save-link]");if(!button)return;const card=button.closest("[data-link-id]");const urlInput=card.querySelector('[name="url"]');if(!urlInput.checkValidity()){urlInput.reportValidity();return}button.disabled=true;try{const reactivateControl=card.querySelector('[name="reactivate"]');const body={url:urlInput.value,title:card.querySelector('[name="title"]').value,category:card.querySelector('[name="category"]').value,description:card.querySelector('[name="description"]').value,tags:pickerTags(card.querySelector('[data-theme-picker]')),reactivate:Boolean(reactivateControl?.checked),confirm:true};const data=await api("/api/admin/links/"+encodeURIComponent(card.dataset.linkId),{method:"PATCH",body:JSON.stringify(body)});urlInput.value=data.link.url;updateThemePicker(card.querySelector('[data-theme-picker]'),data.link.tags);card.querySelector("[data-link-title]").textContent=data.link.title;card.querySelector("[data-link-status]").textContent=data.link.status||"";if(data.reactivated)reactivateControl?.closest(".reactivate-control")?.remove();show(data.reactivated?"Lien corrigé et réactivé. Le statut « lien mort » a été retiré ; un nouveau déploiement est lancé.":data.changed?"Lien corrigé. Un nouveau déploiement est lancé.":"Aucune modification à enregistrer.")}catch(error){show("Correction impossible : "+correctionErrorLabel(error.message))}finally{button.disabled=false}});

const loadEditions=async()=>{const data=await api("/api/admin/editions");const select=document.querySelector("#edition-select");select.innerHTML='<option value="">Choisir une date</option>'+data.editions.map((date)=>'<option>'+esc(date)+'</option>').join("")};
document.querySelector("#edition-select")?.addEventListener("change",async(event)=>{const form=document.querySelector("#edition-form");if(!event.target.value){form.classList.add("is-hidden");return}try{const data=await api("/api/admin/editions?date="+encodeURIComponent(event.target.value));form.elements.title.value=data.edition.title;form.elements.introduction.value=data.edition.introduction;form.elements.seoDescription.value=data.edition.description;form.dataset.date=event.target.value;form.classList.remove("is-hidden")}catch(error){show(error.message)}});
document.querySelector("#edition-form")?.addEventListener("submit",async(event)=>{event.preventDefault();const button=event.submitter;button.disabled=true;const form=event.currentTarget;try{await api("/api/admin/editions/"+encodeURIComponent(form.dataset.date),{method:"PATCH",body:JSON.stringify({title:form.elements.title.value,introduction:form.elements.introduction.value,seoDescription:form.elements.seoDescription.value,confirm:true})});show("Édition corrigée. Un nouveau déploiement est lancé.")}catch(error){show(error.message)}finally{button.disabled=false}});

const loadHidden=async()=>{const list=document.querySelector("#hidden-links");try{const data=await api("/api/admin/links/hidden");if(!data.links.length){list.innerHTML='<p class="empty">Aucun lien n’est actuellement retiré.</p>';return}list.innerHTML=data.links.map((link)=>'<article class="admin-link" data-hidden-id="'+esc(link.id)+'"><div><h3>'+esc(link.title)+'</h3><p>'+esc(link.category)+' · '+esc(link.added)+'</p><p>'+esc(link.url)+'</p></div><button type="button" data-restore>Restaurer</button></article>').join("")}catch(error){list.innerHTML='<p class="empty">'+esc(error.message)+'</p>'}};
document.querySelector("#hidden-links")?.addEventListener("click",async(event)=>{const button=event.target.closest("[data-restore]");if(!button)return;const article=button.closest("[data-hidden-id]");button.disabled=true;try{await api("/api/admin/links/"+encodeURIComponent(article.dataset.hiddenId)+"/restore",{method:"POST",body:JSON.stringify({confirm:true})});article.remove();show("Lien restauré. Le déploiement est lancé.")}catch(error){button.disabled=false;show(error.message)}});

const loadLinkedIn=async()=>{
  const target=document.querySelector("#linkedin-status"),connect=document.querySelector("#linkedin-connect");if(!target)return;
  try{const status=await api("/api/admin/linkedin/status");connect.classList.toggle("is-hidden",!status.configured||status.connected);target.textContent=status.connected?"Compte connecté : "+status.memberName:status.configured?"Identifiants enregistrés. Connectez maintenant votre compte LinkedIn.":"Ajoutez le Client ID et le Client Secret de votre application LinkedIn."}
  catch(error){target.textContent="État LinkedIn indisponible : "+error.message}
};
document.querySelector("#linkedin-config-form")?.addEventListener("submit",async(event)=>{event.preventDefault();const form=event.currentTarget,button=event.submitter;button.disabled=true;try{await api("/api/admin/linkedin/configure",{method:"POST",body:JSON.stringify({clientId:form.elements.clientId.value,clientSecret:form.elements.clientSecret.value,confirm:true})});form.reset();show("Identifiants LinkedIn enregistrés et chiffrés.");await loadLinkedIn()}catch(error){show("Configuration LinkedIn impossible : "+error.message)}finally{button.disabled=false}});
document.querySelector("#linkedin-connect")?.addEventListener("click",()=>location.assign("/api/admin/linkedin/connect?returnTo=%2Fadmin"));

const initialize=async()=>{
  if(!document.querySelector("[data-panel]"))return;
  const today=new Date().toISOString().slice(0,10);document.querySelector("#publication-date").value=today;
  document.querySelector("#publication-title").value=new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric",timeZone:"Europe/Paris"}).format(new Date(today+"T12:00:00Z"));
  document.querySelector("#publication-date").addEventListener("change",(event)=>{document.querySelector("#publication-title").value=new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric",timeZone:"Europe/Paris"}).format(new Date(event.target.value+"T12:00:00Z"))});
  try{options=await api("/api/admin/curation/options");const publications=loadPublications().then((items)=>{resumePublicationPolling(items);return items});await Promise.all([loadDrafts(),publications,loadEditions(),loadCategories(),loadThemes(),loadHidden(),loadLinkedIn()]);if(new URLSearchParams(location.search).get("linkedin")==="connected"){openPanel("linkedin");show("Compte LinkedIn connecté.");history.replaceState(null,"","/admin")}}catch(error){show("Initialisation impossible : "+error.message)}
};
initialize();
`;

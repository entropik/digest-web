const pageShell = (body: string, title = "Administration · Digest") => `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${title}</title>
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
        <a href="/">Voir le Digest</a>
        <button id="admin-logout" type="button">Se déconnecter</button>
      </div>
    </header>
    <nav class="admin-nav" aria-label="Administration">
      <button class="is-active" type="button" data-panel-button="drafts">Brouillons <span id="draft-count">0</span></button>
      <button type="button" data-panel-button="publish">Composer <span id="selected-count">0</span></button>
      <button type="button" data-panel-button="publications">Publications</button>
      <button type="button" data-panel-button="links">Liens publiés</button>
      <button type="button" data-panel-button="editions">Éditions</button>
      <button type="button" data-panel-button="hidden">Retirés</button>
    </nav>
    <p class="feedback" id="admin-feedback" role="status" aria-live="polite"></p>

    <section class="admin-panel is-active" data-panel="drafts">
      <div class="section-heading">
        <div><p class="kicker">File privée</p><h2>Brouillons</h2></div>
        <div class="toolbar">
          <input id="draft-search" type="search" placeholder="Filtrer les brouillons">
          <select id="draft-filter"><option value="all">Tous</option><option value="complete">Complets</option><option value="incomplete">Incomplets</option></select>
        </div>
      </div>
      <div id="draft-list"><p class="loading">Chargement…</p></div>
    </section>

    <section class="admin-panel" data-panel="publish">
      <div class="section-heading"><div><p class="kicker">Prochaine édition</p><h2>Composer</h2></div></div>
      <form id="publication-form" class="edition-form">
        <div class="field-row">
          <label>Date<input id="publication-date" name="digestDate" type="date" required></label>
          <label>Titre<input id="publication-title" name="title" required maxlength="240"></label>
        </div>
        <label>Introduction<textarea name="introduction" rows="6" required>Une sélection de ressources choisies et documentées.</textarea></label>
        <label>Description SEO<textarea name="seoDescription" rows="3" required>Intelligence artificielle, développement, design, édition et création numérique.</textarea></label>
        <div class="selection-summary" id="publication-selection">Aucun lien sélectionné.</div>
        <div class="form-actions">
          <button type="button" id="preview-publication">Vérifier le lot</button>
          <button class="primary" type="submit">Publier ce Digest</button>
        </div>
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

    <section class="admin-panel" data-panel="hidden">
      <div class="section-heading"><div><p class="kicker">Mémoire éditoriale</p><h2>Liens retirés</h2></div></div>
      <div id="hidden-links"><p class="loading">Chargement…</p></div>
    </section>
  `);

export const adminCss = `
:root{color-scheme:light;--paper:#f5f3ee;--ink:#171717;--muted:#77736d;--line:#d7d2c9;--accent:#ff5a36;--ok:#237a4b;--warn:#9b6400;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink)}main{width:min(1180px,calc(100% - 2rem));margin:auto;padding:clamp(2rem,7vw,5rem) 0}header{display:flex;align-items:flex-start;justify-content:space-between;gap:2rem;border-bottom:1px solid var(--line);padding-bottom:2rem}.kicker{margin:0;color:var(--accent);font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase}h1{max-width:850px;margin:.5rem 0 1.5rem;font-family:Arial,Helvetica,sans-serif;font-size:clamp(3.5rem,10vw,7rem);letter-spacing:-.075em;line-height:.8}h2{margin:.35rem 0;font-family:Arial,Helvetica,sans-serif;font-size:clamp(2.2rem,6vw,4.8rem);letter-spacing:-.06em;line-height:.9}.intro{max-width:680px;color:var(--muted);font-size:1rem;line-height:1.7}button,a,input,select,textarea{font:inherit}button,a{border:1px solid var(--line);border-radius:.25rem;background:transparent;color:inherit;cursor:pointer;font-weight:700;text-decoration:none}button{padding:.8rem 1rem}button:disabled{cursor:not-allowed;opacity:.45}.primary{border-color:var(--accent);background:var(--accent);color:#111}.header-actions,.toolbar,.form-actions{display:flex;flex-wrap:wrap;gap:.6rem}.header-actions a{padding:.8rem 1rem}.feedback{min-height:1.5em;color:var(--accent)}.admin-nav{display:flex;gap:.35rem;overflow:auto;padding:1rem 0;border-bottom:1px solid var(--line)}.admin-nav button{white-space:nowrap;border:0}.admin-nav button.is-active{background:var(--ink);color:var(--paper)}.admin-nav span{color:var(--accent)}.admin-panel{display:none;padding:2.5rem 0}.admin-panel.is-active{display:block}.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:2rem;margin-bottom:2rem}.toolbar{align-items:center}.toolbar input,.toolbar select{min-width:220px}.draft-card,.admin-link,.publication-card,.published-card{border-top:1px solid var(--line);padding:1.35rem 0}.draft-card{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1rem}.draft-card.is-filtered{display:none}.draft-select{width:1.2rem;height:1.2rem;margin-top:.4rem}.draft-grid,.published-grid{display:grid;grid-template-columns:2fr 1fr;gap:.8rem}.draft-grid label,.published-grid label,.edition-form label{display:grid;gap:.4rem;color:var(--muted);font-size:.78rem}.draft-grid label.wide,.published-grid label.wide{grid-column:1/-1}.draft-url,.admin-link p{overflow-wrap:anywhere;color:var(--muted);font-size:.8rem}.card-actions{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-top:1rem}.missing{color:var(--warn);font-size:.78rem}.complete{color:var(--ok);font-size:.78rem}.edition-form{display:grid;gap:1rem;max-width:900px}.field-row{display:grid;grid-template-columns:1fr 2fr;gap:1rem}input,select,textarea{width:100%;border:1px solid var(--line);border-radius:.25rem;background:#fff;color:var(--ink);padding:.72rem}.selection-summary{padding:1rem;border:1px solid var(--line);color:var(--muted)}.publication-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1rem}.status{display:inline-block;padding:.25rem .5rem;border-radius:2rem;background:#e7e2d8;font-size:.72rem}.status-live{background:#d6eddf;color:var(--ok)}.status-failed{background:#f5d6cf;color:#8f2d1d}.published-card h3,.admin-link h3,.publication-card h3{margin:.2rem 0;font-family:Arial,Helvetica,sans-serif;font-size:1.5rem}.admin-link{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2rem}.empty,.loading{padding:2rem 0;color:var(--muted)}.is-hidden{display:none!important}@media(max-width:760px){header,.section-heading,.publication-card,.admin-link{display:grid;grid-template-columns:1fr}.draft-grid,.published-grid,.field-row{grid-template-columns:1fr}.header-actions{margin-top:0}.toolbar input,.toolbar select{min-width:0}}
`;

export const adminJs = `
const feedback=document.querySelector("#admin-feedback");
const show=(message)=>{if(feedback)feedback.textContent=message||""};
const esc=(value)=>String(value??"").replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
const api=async(path,options={})=>{
  const response=await fetch(path,{credentials:"same-origin",...options,headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})}});
  if(response.status===401||response.status===403){location.assign("/admin");throw new Error("AUTHENTICATION_REQUIRED")}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.error||"ADMIN_OPERATION_FAILED");error.details=data.details;throw error}
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
const openPanel=(name)=>{panels.forEach((panel)=>panel.classList.toggle("is-active",panel.dataset.panel===name));panelButtons.forEach((button)=>button.classList.toggle("is-active",button.dataset.panelButton===name))};
panelButtons.forEach((button)=>button.addEventListener("click",()=>openPanel(button.dataset.panelButton)));

let options={categories:[],tags:[]};
let drafts=[];
const selected=new Set();
const categoryOptions=(value)=>'<option value=""></option>'+options.categories.map((category)=>'<option '+(category===value?'selected':'')+'>'+esc(category)+'</option>').join("");
const missing=(draft)=>[!draft.title&&"titre",!draft.category&&"catégorie",!draft.description&&"résumé",!draft.tags.length&&"tag"].filter(Boolean);
const renderDrafts=()=>{
  const list=document.querySelector("#draft-list");if(!list)return;
  document.querySelector("#draft-count").textContent=String(drafts.length);
  if(!drafts.length){list.innerHTML='<p class="empty">Aucun brouillon. L’extension Chrome peut alimenter cette file.</p>';return}
  list.innerHTML=drafts.map((draft)=>{
    const gaps=missing(draft);
    return '<article class="draft-card" data-draft-id="'+esc(draft.id)+'" data-complete="'+(!gaps.length)+'">'+
      '<input class="draft-select" type="checkbox" aria-label="Sélectionner" '+(selected.has(draft.id)?'checked':'')+'>'+
      '<div><p class="draft-url">'+esc(draft.url)+'</p><div class="draft-grid">'+
      '<label>Titre<input name="title" value="'+esc(draft.title)+'"></label>'+
      '<label>Catégorie<select name="category">'+categoryOptions(draft.category)+'</select></label>'+
      '<label class="wide">Résumé<textarea name="description" rows="3">'+esc(draft.description)+'</textarea></label>'+
      '<label class="wide">Tags existants, séparés par des virgules<input name="tags" value="'+esc(draft.tags.join(", "))+'" list="known-tags"></label>'+
      '<label class="wide">Note privée<textarea name="privateNote" rows="2">'+esc(draft.privateNote)+'</textarea></label></div>'+
      '<div class="card-actions"><span class="'+(gaps.length?'missing':'complete')+'">'+(gaps.length?'Manque : '+esc(gaps.join(", ")):'Prêt à publier')+'</span><div><button type="button" data-delete-draft>Supprimer</button> <button type="button" data-save-draft>Enregistrer</button></div></div></div></article>';
  }).join("")+'<datalist id="known-tags">'+options.tags.map((tag)=>'<option value="'+esc(tag)+'"></option>').join("")+'</datalist>';
  filterDrafts();updateSelection();
};
const loadDrafts=async()=>{const data=await api("/api/admin/curation/drafts");drafts=data.drafts;for(const id of [...selected])if(!drafts.some((draft)=>draft.id===id))selected.delete(id);renderDrafts()};
const draftBody=(card)=>({title:card.querySelector('[name="title"]').value,category:card.querySelector('[name="category"]').value,description:card.querySelector('[name="description"]').value,tags:card.querySelector('[name="tags"]').value.split(",").map((tag)=>tag.trim()).filter(Boolean),privateNote:card.querySelector('[name="privateNote"]').value,confirm:true});
document.querySelector("#draft-list")?.addEventListener("click",async(event)=>{
  const card=event.target.closest("[data-draft-id]");if(!card)return;
  if(event.target.matches(".draft-select")){event.target.checked?selected.add(card.dataset.draftId):selected.delete(card.dataset.draftId);updateSelection();return}
  const save=event.target.closest("[data-save-draft]"),remove=event.target.closest("[data-delete-draft]");
  if(!save&&!remove)return;
  event.target.disabled=true;
  try{
    if(remove){await api("/api/admin/curation/drafts/"+encodeURIComponent(card.dataset.draftId),{method:"DELETE",body:JSON.stringify({confirm:true})});selected.delete(card.dataset.draftId);show("Brouillon supprimé.")}
    else{await api("/api/admin/curation/drafts/"+encodeURIComponent(card.dataset.draftId),{method:"PATCH",body:JSON.stringify(draftBody(card))});show("Brouillon enregistré.")}
    await loadDrafts();
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
document.querySelector("#draft-search")?.addEventListener("input",filterDrafts);
document.querySelector("#draft-filter")?.addEventListener("change",filterDrafts);
const updateSelection=()=>{
  document.querySelector("#selected-count").textContent=String(selected.size);
  const summary=document.querySelector("#publication-selection");
  if(summary)summary.textContent=selected.size?selected.size+" lien"+(selected.size>1?"s":"")+" sélectionné"+(selected.size>1?"s":"")+".":"Aucun lien sélectionné.";
};

const publicationPayload=()=>{
  const form=new FormData(document.querySelector("#publication-form"));
  return {requestId:crypto.randomUUID(),draftIds:[...selected],digestDate:String(form.get("digestDate")||""),title:String(form.get("title")||""),introduction:String(form.get("introduction")||""),seoDescription:String(form.get("seoDescription")||"")};
};
document.querySelector("#preview-publication")?.addEventListener("click",async(event)=>{
  event.target.disabled=true;try{const data=await api("/api/admin/curation/publications/preview",{method:"POST",body:JSON.stringify(publicationPayload())});show("Lot valide : "+data.count+" liens, un commit, deux fichiers.")}catch(error){show("Lot invalide : "+error.message)}finally{event.target.disabled=false}
});
document.querySelector("#publication-form")?.addEventListener("submit",async(event)=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;
  try{const payload=publicationPayload();payload.confirm=true;const data=await api("/api/admin/curation/publications",{method:"POST",body:JSON.stringify(payload)});show("Commit créé. Validation GitHub Actions en cours.");selected.clear();await Promise.all([loadDrafts(),loadPublications()]);openPanel("publications");pollPublication(data.publication.id)}
  catch(error){show("Publication impossible : "+error.message)}finally{button.disabled=false}
});
const statusLabel={committing:"Commit en cours",validating:"Validation",deploying:"Déploiement",live:"En ligne",failed:"Échec"};
const renderPublications=(items)=>{
  const list=document.querySelector("#publication-list");if(!list)return;
  if(!items.length){list.innerHTML='<p class="empty">Aucune publication initiée depuis cet atelier.</p>';return}
  list.innerHTML=items.map((item)=>'<article class="publication-card"><div><p class="kicker">'+esc(item.digestDate)+'</p><h3>'+esc(item.title)+'</h3><p class="draft-url">'+esc(item.commitSha||"Commit en préparation")+'</p><p>'+(item.validateUrl?'<a href="'+esc(item.validateUrl)+'" target="_blank" rel="noopener">Validation</a> ':'')+(item.deployUrl?'<a href="'+esc(item.deployUrl)+'" target="_blank" rel="noopener">Déploiement</a>':'')+'</p></div><div><span class="status status-'+esc(item.state)+'">'+esc(statusLabel[item.state]||item.state)+'</span>'+(["validating","deploying"].includes(item.state)?'<br><button type="button" data-refresh-publication="'+esc(item.id)+'">Actualiser</button>':'')+'</div></article>').join("");
};
const loadPublications=async()=>{const data=await api("/api/admin/curation/publications");renderPublications(data.publications)};
const pollPublication=async(id)=>{try{const data=await api("/api/admin/curation/publications/"+encodeURIComponent(id));await loadPublications();if(["validating","deploying"].includes(data.publication.state))setTimeout(()=>pollPublication(id),15000);else show(data.publication.state==="live"?"Le Digest est en ligne.":"La publication a échoué : "+(data.publication.errorCode||"erreur inconnue"))}catch(error){show("Suivi indisponible : "+error.message)}};
document.querySelector("#publication-list")?.addEventListener("click",(event)=>{const button=event.target.closest("[data-refresh-publication]");if(button)pollPublication(button.dataset.refreshPublication)});

const renderPublishedLinks=(links)=>{
  const target=document.querySelector("#published-links");
  if(!links.length){target.innerHTML='<p class="empty">Aucun lien trouvé.</p>';return}
  target.innerHTML=links.map((link)=>'<article class="published-card" data-link-id="'+esc(link.id)+'"><h3>'+esc(link.title)+'</h3><p class="draft-url">'+esc(link.url)+' · '+esc(link.added)+'</p><div class="published-grid"><label>Titre<input name="title" value="'+esc(link.title)+'"></label><label>Catégorie<select name="category">'+categoryOptions(link.category)+'</select></label><label class="wide">Résumé<textarea name="description" rows="3">'+esc(link.description)+'</textarea></label><label class="wide">Tags existants<input name="tags" value="'+esc(link.tags.join(", "))+'"></label></div><div class="card-actions"><span>'+esc(link.status||"")+'</span><button type="button" data-save-link>Enregistrer la correction</button></div></article>').join("");
};
document.querySelector("#link-search-form")?.addEventListener("submit",async(event)=>{event.preventDefault();show("Recherche…");try{const query=document.querySelector("#link-search").value;const data=await api("/api/admin/links?q="+encodeURIComponent(query)+"&limit=100");renderPublishedLinks(data.links);show(data.links.length+" résultat(s).")}catch(error){show(error.message)}});
document.querySelector("#published-links")?.addEventListener("click",async(event)=>{const button=event.target.closest("[data-save-link]");if(!button)return;const card=button.closest("[data-link-id]");button.disabled=true;try{const body={title:card.querySelector('[name="title"]').value,category:card.querySelector('[name="category"]').value,description:card.querySelector('[name="description"]').value,tags:card.querySelector('[name="tags"]').value.split(",").map((tag)=>tag.trim()).filter(Boolean),confirm:true};await api("/api/admin/links/"+encodeURIComponent(card.dataset.linkId),{method:"PATCH",body:JSON.stringify(body)});show("Lien corrigé. Un nouveau déploiement est lancé.")}catch(error){show("Correction impossible : "+error.message)}finally{button.disabled=false}});

const loadEditions=async()=>{const data=await api("/api/admin/editions");const select=document.querySelector("#edition-select");select.innerHTML='<option value="">Choisir une date</option>'+data.editions.map((date)=>'<option>'+esc(date)+'</option>').join("")};
document.querySelector("#edition-select")?.addEventListener("change",async(event)=>{const form=document.querySelector("#edition-form");if(!event.target.value){form.classList.add("is-hidden");return}try{const data=await api("/api/admin/editions?date="+encodeURIComponent(event.target.value));form.elements.title.value=data.edition.title;form.elements.introduction.value=data.edition.introduction;form.elements.seoDescription.value=data.edition.description;form.dataset.date=event.target.value;form.classList.remove("is-hidden")}catch(error){show(error.message)}});
document.querySelector("#edition-form")?.addEventListener("submit",async(event)=>{event.preventDefault();const button=event.submitter;button.disabled=true;const form=event.currentTarget;try{await api("/api/admin/editions/"+encodeURIComponent(form.dataset.date),{method:"PATCH",body:JSON.stringify({title:form.elements.title.value,introduction:form.elements.introduction.value,seoDescription:form.elements.seoDescription.value,confirm:true})});show("Édition corrigée. Un nouveau déploiement est lancé.")}catch(error){show(error.message)}finally{button.disabled=false}});

const loadHidden=async()=>{const list=document.querySelector("#hidden-links");try{const data=await api("/api/admin/links/hidden");if(!data.links.length){list.innerHTML='<p class="empty">Aucun lien n’est actuellement retiré.</p>';return}list.innerHTML=data.links.map((link)=>'<article class="admin-link" data-hidden-id="'+esc(link.id)+'"><div><h3>'+esc(link.title)+'</h3><p>'+esc(link.category)+' · '+esc(link.added)+'</p><p>'+esc(link.url)+'</p></div><button type="button" data-restore>Restaurer</button></article>').join("")}catch(error){list.innerHTML='<p class="empty">'+esc(error.message)+'</p>'}};
document.querySelector("#hidden-links")?.addEventListener("click",async(event)=>{const button=event.target.closest("[data-restore]");if(!button)return;const article=button.closest("[data-hidden-id]");button.disabled=true;try{await api("/api/admin/links/"+encodeURIComponent(article.dataset.hiddenId)+"/restore",{method:"POST",body:JSON.stringify({confirm:true})});article.remove();show("Lien restauré. Le déploiement est lancé.")}catch(error){button.disabled=false;show(error.message)}});

const initialize=async()=>{
  if(!document.querySelector("[data-panel]"))return;
  const today=new Date().toISOString().slice(0,10);document.querySelector("#publication-date").value=today;
  document.querySelector("#publication-title").value=new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric",timeZone:"Europe/Paris"}).format(new Date(today+"T12:00:00Z"));
  document.querySelector("#publication-date").addEventListener("change",(event)=>{document.querySelector("#publication-title").value=new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric",timeZone:"Europe/Paris"}).format(new Date(event.target.value+"T12:00:00Z"))});
  try{options=await api("/api/admin/curation/options");await Promise.all([loadDrafts(),loadPublications(),loadEditions(),loadHidden()])}catch(error){show("Initialisation impossible : "+error.message)}
};
initialize();
`;

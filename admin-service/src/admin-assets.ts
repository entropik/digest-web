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
    <p class="intro">Connecte-toi avec le compte GitHub autorisé pour retirer ou restaurer des liens.</p>
    <button class="primary" id="admin-login" type="button">Continuer avec GitHub</button>
    <p class="feedback" id="admin-feedback" role="status"></p>
  `);

export const forbiddenPage = () =>
  pageShell(
    `<p class="kicker">Accès refusé</p><h1>Ce compte n’est pas autorisé.</h1><p class="intro">Déconnecte-toi puis utilise le compte propriétaire du Digest.</p><button id="admin-logout" type="button">Se déconnecter</button>`,
    "Accès refusé · Digest",
  );

export const dashboardPage = (name: string) =>
  pageShell(`
    <header>
      <div>
        <p class="kicker">Espace propriétaire</p>
        <h1>Liens retirés.</h1>
        <p class="intro">Bonjour ${escapeHtml(name)}. Chaque restauration déclenche automatiquement une nouvelle publication.</p>
      </div>
      <div class="header-actions">
        <a href="/">Voir le Digest</a>
        <button id="admin-logout" type="button">Se déconnecter</button>
      </div>
    </header>
    <p class="feedback" id="admin-feedback" role="status"></p>
    <section id="hidden-links" aria-live="polite">
      <p class="loading">Chargement des liens retirés…</p>
    </section>
  `);

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

export const adminCss = `
:root{color-scheme:light;--paper:#f5f3ee;--ink:#171717;--muted:#77736d;--line:#d7d2c9;--accent:#ff5a36;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink)}main{width:min(1060px,calc(100% - 2rem));margin:auto;padding:clamp(2rem,7vw,6rem) 0}header{display:flex;align-items:flex-start;justify-content:space-between;gap:2rem;border-bottom:1px solid var(--line);padding-bottom:2rem}.kicker{color:var(--accent);font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase}h1{max-width:850px;margin:.5rem 0 1.5rem;font-family:Arial,Helvetica,sans-serif;font-size:clamp(3.5rem,10vw,8rem);letter-spacing:-.075em;line-height:.8}.intro{max-width:680px;color:var(--muted);font-size:1rem;line-height:1.7}button,a{border:1px solid var(--line);border-radius:.25rem;background:transparent;color:inherit;cursor:pointer;font:inherit;font-weight:700;text-decoration:none}button{padding:.8rem 1rem}.primary{border-color:var(--accent);background:var(--accent);color:#111}.header-actions{display:flex;flex-wrap:wrap;gap:.6rem}.header-actions a{padding:.8rem 1rem}.feedback{min-height:1.5em;color:var(--accent)}.admin-link{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2rem;padding:1.4rem 0;border-bottom:1px solid var(--line)}.admin-link h2{margin:0 0 .45rem;font-family:Arial,Helvetica,sans-serif;font-size:clamp(1.5rem,4vw,2.4rem);letter-spacing:-.045em}.admin-link p{margin:.3rem 0;color:var(--muted);overflow-wrap:anywhere}.admin-link button{align-self:center}.empty,.loading{padding:3rem 0;color:var(--muted)}@media(max-width:700px){header,.admin-link{grid-template-columns:1fr;display:grid}.header-actions{margin-top:0}}
`;

export const adminJs = `
const feedback=document.querySelector("#admin-feedback");
const show=(message)=>{if(feedback)feedback.textContent=message};
document.querySelector("#admin-login")?.addEventListener("click",async(event)=>{
  const button=event.currentTarget;button.disabled=true;show("Connexion en cours…");
  try{
    const response=await fetch("/api/auth/sign-in/social",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider:"github",callbackURL:"/admin"})});
    const data=await response.json();
    if(!response.ok||!data.url)throw new Error(data.message||"Connexion impossible");
    location.assign(data.url);
  }catch(error){button.disabled=false;show(error.message||"Connexion impossible");}
});
document.querySelector("#admin-logout")?.addEventListener("click",async()=>{
  await fetch("/api/auth/sign-out",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}"});
  location.assign("/admin");
});
const list=document.querySelector("#hidden-links");
const escapeHtml=(value)=>String(value).replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
const load=async()=>{
  if(!list)return;
  try{
    const response=await fetch("/api/admin/links/hidden",{credentials:"same-origin",headers:{Accept:"application/json"}});
    if(response.status===401||response.status===403){location.assign("/admin");return;}
    if(!response.ok)throw new Error("Impossible de charger les liens retirés.");
    const data=await response.json();
    if(!data.links.length){list.innerHTML='<p class="empty">Aucun lien n’est actuellement retiré.</p>';return;}
    list.innerHTML=data.links.map((link)=>'<article class="admin-link" data-id="'+escapeHtml(link.id)+'"><div><h2>'+escapeHtml(link.title)+'</h2><p>'+escapeHtml(link.category)+' · '+escapeHtml(link.added)+'</p><p>'+escapeHtml(link.url)+'</p></div><button type="button" data-restore>Restaurer</button></article>').join("");
  }catch(error){list.innerHTML='<p class="empty">'+escapeHtml(error.message||"Une erreur est survenue.")+'</p>';}
};
list?.addEventListener("click",async(event)=>{
  const button=event.target.closest("[data-restore]");if(!button)return;
  const article=button.closest("[data-id]");if(!article)return;
  button.disabled=true;show("Restauration en cours…");
  try{
    const response=await fetch("/api/admin/links/"+encodeURIComponent(article.dataset.id)+"/restore",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirm:true})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Restauration impossible.");
    article.remove();show("Lien restauré. La publication sera mise à jour dans quelques minutes.");
    if(!list.children.length)list.innerHTML='<p class="empty">Aucun lien n’est actuellement retiré.</p>';
  }catch(error){button.disabled=false;show(error.message||"Restauration impossible.");}
});
load();
`;

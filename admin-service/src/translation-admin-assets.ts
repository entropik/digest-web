export const translationPanel = String.raw`<section class="admin-panel" data-panel="translations">
  <div class="section-heading"><div><h2>Traductions</h2><p class="intro">L’anglais avance, le français reste la source.</p></div>
    <button type="button" data-translation-action="refresh">Actualiser le quota</button></div>
  <p id="translation-feedback" role="status" aria-live="polite">Ouvrez cet onglet pour charger le suivi.</p>
  <dl class="translation-register">
    <div><dt>Couverture éditoriale</dt><dd id="translation-coverage">—</dd><small id="translation-volume">Inventaire en attente</small></div>
    <div><dt>Crédit consommé</dt><dd id="translation-used">—</dd><small id="translation-remaining">Developer · crédit non renouvelable</small></div>
    <div><dt>Rattrapage disponible</dt><dd id="translation-budget">—</dd><small>Plafond du compte : 700 000 caractères</small></div>
  </dl>
  <div class="translation-meters">
    <label>Texte traduit et à jour <progress id="translation-progress" max="100" value="0"></progress></label>
    <label>Crédit Developer consommé <progress id="translation-credit" max="1000000" value="0"></progress></label>
  </div>
  <p id="translation-counts"></p><p id="translation-publication"></p>
  <div class="form-actions translation-actions">
    <button class="primary" type="button" data-translation-action="start" disabled>Lancer le rattrapage jusqu’à 70 %</button>
    <button type="button" data-translation-action="pause">Suspendre</button>
    <button type="button" data-translation-action="resume">Reprendre</button>
    <button type="button" data-translation-action="retry">Réessayer les erreurs</button>
    <button type="button" data-translation-action="retry-uncertain">Examiner les requêtes incertaines</button>
  </div>
  <p class="translation-note" id="translation-estimate"></p>
  <div class="translation-history-heading"><h3>Progression dans le temps</h3>
    <label>Mois <input id="translation-month" type="month"></label><button id="translation-all-history" type="button">Toute la période</button></div>
  <div id="translation-history"><p class="empty">L’historique apparaîtra après le premier inventaire.</p></div>
  <h3>Lots</h3><div id="translation-batches"></div>
  <h3>Contenus</h3>
  <div class="translation-table-wrap"><table class="translation-table"><thead><tr><th>Contenu</th><th>Date</th><th>État</th><th>Champs</th></tr></thead><tbody id="translation-items"></tbody></table></div>
  <div class="form-actions"><button id="translation-prev" type="button">Précédents</button><button id="translation-next" type="button">Suivants</button></div>
</section>`;
export const translationCss = String.raw`
.translation-register{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:1.5rem 0 0;border:1px solid var(--line)}
.translation-register>div{padding:1.1rem;min-width:0}.translation-register>div+div{border-left:1px solid var(--line)}
.translation-register dt{font-size:.75rem;color:var(--muted)}.translation-register dd{margin:.55rem 0;font-size:1.6rem;font-variant-numeric:tabular-nums;font-weight:700}
.translation-register small,.translation-note{font-size:.75rem;line-height:1.6;color:var(--muted)}
.translation-meters{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;padding:1rem 0}.translation-meters label{display:grid;gap:.5rem;font-size:.78rem}
.translation-meters progress{display:block;appearance:none;width:100%;height:6px;border:0;background:var(--line);accent-color:var(--accent-text)}
.translation-meters progress::-webkit-progress-bar{background:var(--line)}.translation-meters progress::-webkit-progress-value{background:var(--accent-text)}
.translation-actions{margin-top:1.5rem}.translation-actions button{font-size:.75rem}
.translation-history-heading{display:flex;align-items:center;flex-wrap:wrap;gap:1rem;margin-top:2.5rem;border-top:1px solid var(--line);padding-top:1rem}
.translation-history-heading h3{margin-right:auto}.translation-history-heading label{font-size:.8rem}
.translation-chart{width:100%;height:180px;display:block;border-bottom:1px solid var(--line);color:var(--accent-text)}
.translation-chart text{font-size:11px;fill:var(--muted);font-family:inherit}
.translation-chart .axis{stroke:var(--line);stroke-width:1}.translation-chart polyline{fill:none;stroke:currentColor;stroke-width:2}
.translation-table{border-collapse:collapse;width:100%;font-size:.77rem;font-variant-numeric:tabular-nums;text-align:left}
.translation-table th,.translation-table td{padding:.8rem .5rem;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}
.translation-table th:first-child{width:55%}.translation-table a{border:0;text-decoration:underline;text-underline-offset:3px}
.translation-table small{display:block;color:var(--muted);margin-top:.35rem}.translation-table th{font-weight:700}
.translation-batch{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.5rem;padding:.7rem 0;border-bottom:1px solid var(--line);font-size:.75rem}
@media(max-width:680px){.translation-register{grid-template-columns:1fr}.translation-register>div+div{border-left:0;border-top:1px solid var(--line)}.translation-meters{grid-template-columns:1fr}.translation-register>div{padding:.8rem}.translation-register dd{font-size:1.4rem}.translation-table{font-size:.68rem}.translation-table th,.translation-table td{padding:.6rem .3rem}.translation-history-heading{gap:.5rem}.translation-history-heading h3{flex-basis:100%}}
`;
export const translationAdminJs = String.raw`
(() => {
  const panel = document.querySelector('[data-panel="translations"]');
  if (!panel) return;
  const $ = (id) => document.getElementById("translation-" + id);
  const number = (value) => value == null ? "—" : Number(value).toLocaleString("fr-FR");
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const errorLabel = (code) => ({
    DEEPL_NOT_CONFIGURED: "La clé DeepL doit être configurée sur le serveur.",
    QUOTA_UNAVAILABLE: "Le quota est indisponible. Les appels sont suspendus ; vous pouvez actualiser.",
    QUOTA_INVALID: "Le quota reçu est invalide. Les appels sont suspendus.",
    DEEPL_403: "La clé DeepL a été refusée. Vérifiez sa configuration.",
    DEEPL_456: "Le crédit DeepL est épuisé. Le français continue à être publié.",
    DEEPL_429: "DeepL demande de ralentir. Réessayez les erreurs plus tard.",
    BACKFILL_BUDGET_EXHAUSTED: "Le plafond de rattrapage est atteint ou le quota est inconnu.",
    MANIFEST_UNAVAILABLE: "L’inventaire public n’est pas encore disponible. Actualisez après son déploiement.",
    TRANSLATION_SYNC_FAILED: "Le suivi n’a pas pu être actualisé. Les résultats déjà enregistrés sont conservés.",
    REQUEST_OUTCOME_UNKNOWN: "Facturation incertaine : la requête attend votre décision.",
    TRANSLATION_STRUCTURE_CHANGED: "Structure du texte modifiée : résultat écarté.",
    TRANSLATION_LITERAL_CHANGED: "Adresse ou code modifié : résultat écarté.",
    TEXT_TOO_LARGE: "Ce texte dépasse la taille acceptée par DeepL.",
  }[code] || "Le suivi est momentanément indisponible.");
  const stateLabel = state => ({idle:"Aucune traduction à publier",exporting:"Préparation de la publication",deploying:"Déploiement en cours",live:"Traductions en ligne",error:"Publication à réessayer",running:"En cours",paused:"Suspendu",complete:"Terminé",ceiling_reached:"Plafond atteint",complete_with_errors:"Terminé avec erreurs",deploy_failed:"Déploiement échoué · réessayez les erreurs",retrying:"Nouvelle tentative de publication"}[state] || state);
  let status, offset = 0, loading = false;
  async function request(path, action) {
    const response = await fetch("/api/admin/translations/" + path, {
      credentials: "same-origin", headers: { Accept: "application/json", ...(action ? {"Content-Type":"application/json"} : {}) },
      ...(action ? { method:"POST", body:JSON.stringify({confirm:true,...action}) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }
  function render(data) {
    status = data;
    $("coverage").textContent = data.initialized ? number(data.coverage.percent) + " %" : "—";
    $("volume").textContent = number(data.coverage.translated) + " / " + number(data.coverage.total) + " caractères sources · " + number(data.coverage.total - data.coverage.translated) + " à traiter";
    $("used").textContent = number(data.quota.reportedUsed) + " / " + number(data.quota.limit);
    const actualRemaining = data.quota.reportedUsed == null || data.quota.limit == null ? null : Math.max(0,data.quota.limit-data.quota.reportedUsed);
    const reserved = Math.max(0,(data.quota.used || 0) - (data.quota.reportedUsed || 0));
    $("remaining").textContent = number(actualRemaining) + " disponibles au relevé · " + number(reserved) + " réservés depuis · sans renouvellement mensuel";
    $("budget").textContent = number(data.quota.remainingBackfill);
    $("progress").value = data.coverage.percent;
    $("credit").max = data.quota.limit || 1000000;
    $("credit").value = data.quota.used || 0;
    $("counts").textContent = number(data.counts.done) + " terminés · " + number(data.counts.partial) + " partiels · " + number(data.counts.pending) + " à traiter · " + number(data.counts.stale) + " à actualiser · " + number(data.counts.errors) + " en erreur";
    $("publication").textContent = stateLabel(data.publication.state) + " · " + number(data.publication.preparedCharacters) + " caractères préparés · " + number(data.publication.liveCharacters) + " en ligne";
    $("estimate").textContent = "Prochain rattrapage : au plus " + number(data.estimated) + " caractères. Nouveautés prioritaires, puis contenus les plus récents, tous types confondus.";
    const issue = !data.configured ? "DEEPL_NOT_CONFIGURED" : data.quota.error || data.lastError;
    $("feedback").textContent = issue ? errorLabel(issue) : (data.paused ? "Traitement suspendu." : data.backfill ? "Rattrapage actif jusqu’au plafond de 70 %." : "Nouveautés automatiques. Le rattrapage attend votre lancement.") +
      (data.quota.at ? " Quota relevé le " + new Date(data.quota.at).toLocaleString("fr-FR") + "." : "");
    panel.querySelector('[data-translation-action="start"]').disabled = !data.configured || !data.initialized || !data.quota.remainingBackfill || data.backfill;
    panel.querySelector('[data-translation-action="pause"]').disabled = data.paused;
    panel.querySelector('[data-translation-action="resume"]').disabled = !data.paused;
    panel.querySelector('[data-translation-action="retry-uncertain"]').disabled = !data.uncertain?.length;
    $("batches").innerHTML = data.batches.length ? data.batches.map(batch => '<div class="translation-batch"><span>' + escape(new Date(batch.started_at).toLocaleString("fr-FR")) + '</span><span>' + escape(stateLabel(batch.state)) + '</span><span>' + number(batch.translated) + ' caractères facturés</span></div>').join("") : '<p class="empty">Aucun lot lancé.</p>';
  }
  async function history() {
    const data = await request("history?month=" + encodeURIComponent($("month").value));
    if (!data.days.length) { $("history").innerHTML = '<p class="empty">Aucune activité pour cette période.</p>'; return; }
    const start = Date.parse(data.days[0].day), end = Date.parse(data.days.at(-1).day);
    const points = data.days.map(day => (40 + (Date.parse(day.day) - start) / Math.max(86400000, end-start) * 710).toFixed(1) + "," + (145 - day.percent * 1.2).toFixed(1)).join(" ");
    $("history").innerHTML = '<svg class="translation-chart" viewBox="0 0 800 180" role="img" aria-label="Couverture éditoriale en pourcentage"><line class="axis" x1="40" x2="760" y1="145" y2="145"/><line class="axis" x1="40" x2="760" y1="25" y2="25"/><text x="0" y="29">100 %</text><text x="10" y="149">0 %</text><polyline points="' + points + '"/>' + data.days.map((day,index) => '<circle cx="' + points.split(' ')[index].split(',')[0] + '" cy="' + points.split(' ')[index].split(',')[1] + '" r="3" fill="currentColor"/>').join('') + '<text x="40" y="172">' + escape(data.days[0].day) + '</text><text x="760" y="172" text-anchor="end">' + escape(data.days.at(-1).day) + '</text></svg>' +
      '<details><summary>Valeurs quotidiennes</summary><table class="translation-table"><thead><tr><th>Jour</th><th>Couverture</th><th>Caractères facturés</th></tr></thead><tbody>' + data.days.map(day => '<tr><td>' + escape(day.day) + '</td><td>' + number(day.percent) + ' %</td><td>' + number(day.chars) + '</td></tr>').join("") + '</tbody></table></details>';
  }
  async function items() {
    const data = await request("items?offset=" + offset);
    $("items").innerHTML = data.items.map(item => {
      const label = item.errors ? "Erreur" : item.stale ? "À actualiser" : item.done === item.fields ? "Terminé" : item.done ? "Partiel" : "À traiter";
      const route = /^\/(?!\/)/.test(item.route) ? item.route : "/";
      return '<tr><td><a href="' + escape("/en" + route) + '" target="_blank" rel="noopener noreferrer">' + escape(item.title) + '</a><small>' + escape(({page:"Billet",link:"Fiche",category:"Catégorie",tag:"Tag",visual:"Visuel"})[item.kind] || item.kind) + '</small></td><td>' + escape(item.date === "0001-01-01" ? "—" : item.date) + '</td><td>' + label + (item.error ? '<small>' + escape(errorLabel(item.error)) + '</small>' : '') + '</td><td>' + number(item.done) + ' / ' + number(item.fields) + '</td></tr>';
    }).join("") || '<tr><td colspan="4">Aucun contenu inventorié.</td></tr>';
    $("prev").disabled = offset === 0;
    $("next").disabled = data.items.length < 100;
  }
  async function refresh() {
    if (loading) return;
    loading = true;
    try { render(await request("status")); await Promise.all([history(),items()]); }
    catch (error) { $("feedback").textContent = errorLabel(error.message); }
    finally { loading = false; }
  }
  panel.addEventListener("click", async event => {
    const button = event.target.closest("[data-translation-action]");
    if (!button) return;
    let action = button.dataset.translationAction, body = {};
    if (action === "start" && !confirm("Lancer le rattrapage ? Au plus " + number(status?.estimated) + " caractères supplémentaires, dans la limite de 700 000 consommés sur le compte.")) return;
    if (action === "retry-uncertain") {
      const affected = (status?.uncertain || []).map(item => item.title + " · " + item.field + " · " + item.hash.slice(0,8)).join("\n");
      if (!confirm("Requêtes à facturation incertaine (50 premières au maximum) :\n\n" + affected + "\n\nLes rejouer peut consommer du crédit une seconde fois. Relancer les requêtes incertaines ?")) return;
      action = "retry"; body.includeUncertain = true;
    }
    button.disabled = true;
    try { render(await request(action, body)); await Promise.all([history(),items()]); }
    catch (error) { if (status) render(status); $("feedback").textContent = errorLabel(error.message); }
    finally { if (!["start","pause","resume","retry-uncertain"].includes(button.dataset.translationAction)) button.disabled = false; }
  });
  let timer;
  const schedule = () => {
    clearTimeout(timer);
    if (!panel.classList.contains("is-active") || document.hidden) return;
    timer = setTimeout(async () => { await refresh(); schedule(); }, 5000);
  };
  document.querySelector('[data-panel-button="translations"]').addEventListener("click", () => { void refresh(); schedule(); });
  document.querySelectorAll('[data-panel-button]:not([data-panel-button="translations"])').forEach(button => button.addEventListener("click", () => clearTimeout(timer)));
  document.addEventListener("visibilitychange", schedule);
  $("month").addEventListener("change", () => history().catch(error => $("feedback").textContent = errorLabel(error.message)));
  $("all-history").addEventListener("click", () => { $("month").value = ""; void refresh(); });
  $("prev").addEventListener("click", () => { offset = Math.max(0,offset-100); void refresh(); });
  $("next").addEventListener("click", () => { offset += 100; void refresh(); });

})();
`;

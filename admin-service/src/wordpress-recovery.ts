import type { DigestLink } from "./catalog.js";
import {
  buildWordpressImportPreview,
  parseWordpressExport,
  type WordpressOverride,
  type WordpressProbe,
} from "./wordpress-import.js";

export type WordpressRecoveryItem = {
  wordpress_id: string;
  title: string;
  origin_url: string;
  added: string;
  description: string;
  tags: string[];
  candidates: string[];
};

export type WordpressRecoveryReport = {
  missing_source: number;
  unique: WordpressRecoveryItem[];
  ambiguous: WordpressRecoveryItem[];
  unresolved: WordpressRecoveryItem[];
  excluded: Array<WordpressRecoveryItem & { reason: string }>;
};

export type WordpressValidationItem = WordpressRecoveryItem & {
  reason: string;
};

export type WordpressValidationReport = {
  items: WordpressValidationItem[];
  base_overrides: Record<string, WordpressOverride>;
};

const isWordpressDefaultPost = (item: WordpressRecoveryItem): boolean =>
  item.wordpress_id === "1" &&
  item.title.toLocaleLowerCase("fr").includes("bonjour tout le monde");

export const buildWordpressRecoveryReport = (input: {
  xml: string;
  currentLinks: DigestLink[];
  overrides?: Record<string, WordpressOverride>;
  probes?: WordpressProbe[];
}): WordpressRecoveryReport => {
  const preview = buildWordpressImportPreview(input);
  const missingIds = new Set(
    preview.review
      .filter((item) => item.reason === "missing_source")
      .map((item) => item.wordpress_id),
  );
  const items = parseWordpressExport(input.xml)
    .filter((post) => missingIds.has(post.wordpressId))
    .map(
      (post): WordpressRecoveryItem => ({
        wordpress_id: post.wordpressId,
        title: post.title,
        origin_url: post.originUrl,
        added: post.added,
        description: post.contentExcerpt || post.description,
        tags: post.tags.filter((tag) => tag !== "blog-ooblik"),
        candidates: post.fallbackSourceUrls,
      }),
    );
  const excluded = items
    .filter(isWordpressDefaultPost)
    .map((item) => ({ ...item, reason: "wordpress_default_post" }));
  const recoverable = items.filter((item) => !isWordpressDefaultPost(item));
  return {
    missing_source: items.length,
    unique: recoverable.filter((item) => item.candidates.length === 1),
    ambiguous: recoverable.filter((item) => item.candidates.length > 1),
    unresolved: recoverable.filter((item) => item.candidates.length === 0),
    excluded,
  };
};

export const archiveUnresolvedWordpressPosts = (
  report: WordpressRecoveryReport,
  overrides: Record<string, WordpressOverride> = {},
): Record<string, WordpressOverride> =>
  Object.fromEntries(
    [
      ...Object.entries(overrides),
      ...report.unresolved.map(
        (item): [string, WordpressOverride] => [
          item.wordpress_id,
          { source_url: item.origin_url },
        ],
      ),
    ].sort(([left], [right]) => Number(left) - Number(right)),
  );

export const buildWordpressValidationReport = (input: {
  xml: string;
  currentLinks: DigestLink[];
  overrides?: Record<string, WordpressOverride>;
  probes?: WordpressProbe[];
}): WordpressValidationReport => {
  const preview = buildWordpressImportPreview(input);
  const posts = new Map(
    parseWordpressExport(input.xml).map((post) => [post.wordpressId, post]),
  );
  return {
    items: preview.review.map((review): WordpressValidationItem => {
      const post = posts.get(review.wordpress_id);
      const detected = review.candidates?.filter(Boolean) ?? [];
      return {
        wordpress_id: review.wordpress_id,
        title: review.title,
        origin_url: review.origin_url,
        added: post?.added ?? "",
        description: post?.contentExcerpt || post?.description || "",
        tags: post?.tags.filter((tag) => tag !== "blog-ooblik") ?? [],
        candidates:
          detected.length > 0 ? detected : post?.fallbackSourceUrls ?? [],
        reason: review.reason,
      };
    }),
    base_overrides: input.overrides ?? {},
  };
};

export const archiveAllRemainingWordpressPosts = (input: {
  xml: string;
  currentLinks: DigestLink[];
  overrides?: Record<string, WordpressOverride>;
  probes?: WordpressProbe[];
}): Record<string, WordpressOverride> => {
  const preview = buildWordpressImportPreview(input);
  const posts = new Map(
    parseWordpressExport(input.xml).map((post) => [post.wordpressId, post]),
  );
  const remaining = [...preview.review, ...preview.duplicates];
  return Object.fromEntries(
    [
      ...Object.entries(input.overrides ?? {}),
      ...remaining.map((item): [string, WordpressOverride] => {
        const post = posts.get(item.wordpress_id);
        if (!post) throw new Error(`WORDPRESS_POST_NOT_FOUND:${item.wordpress_id}`);
        return [
          item.wordpress_id,
          isWordpressDefaultPost({
            wordpress_id: post.wordpressId,
            title: post.title,
            origin_url: post.originUrl,
            added: post.added,
            description: post.description,
            tags: post.tags,
            candidates: [],
          })
            ? { skip: true }
            : { source_url: post.originUrl },
        ];
      }),
    ].sort(([left], [right]) => Number(left) - Number(right)),
  );
};

const safeJson = (value: unknown): string =>
  JSON.stringify(value).replaceAll("<", "\\u003c");

export const renderWordpressRecoveryHtml = (
  report: WordpressRecoveryReport,
): string => `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Révision des billets sans source · Blog OOBLIK</title>
  <style>
    :root{color-scheme:light;--paper:#f5f2ec;--ink:#161616;--line:#cfcac1;--muted:#77736d;--accent:#ff5c35}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
    button,input{border-radius:0;font:inherit}a{color:inherit;text-underline-offset:.2em}.shell{width:min(1180px,calc(100% - 32px));margin:auto;padding:48px 0 80px}
    header{display:grid;grid-template-columns:minmax(0,2fr) minmax(260px,1fr);gap:40px;padding-bottom:28px;border-bottom:2px solid var(--ink)}
    h1{max-width:760px;margin:0;font:700 clamp(38px,7vw,88px)/.9 Arial,sans-serif;letter-spacing:-.06em}header p{margin:0;color:var(--muted)}
    .toolbar{position:sticky;z-index:3;top:0;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:0;margin-bottom:24px;background:var(--paper);border:1px solid var(--ink)}
    .toolbar input,.toolbar button{min-height:48px;padding:0 14px;border:0;border-right:1px solid var(--ink);background:transparent;color:inherit}.toolbar button:last-child{border-right:0}.toolbar button:hover{background:var(--ink);color:var(--paper)}
    .summary{display:flex;flex-wrap:wrap;gap:8px 24px;padding:18px 0;color:var(--muted);font-size:12px;text-transform:uppercase}.summary strong{color:var(--ink)}
    .list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid var(--ink);border-left:1px solid var(--ink)}
    article{display:grid;min-width:0;gap:16px;padding:20px;border-right:1px solid var(--ink);border-bottom:1px solid var(--ink)}article.is-done{background:#e9e5dc}article[hidden]{display:none}
    .meta,.links,.tags{display:flex;flex-wrap:wrap;gap:7px 14px;color:var(--muted);font-size:11px;text-transform:uppercase}.id{color:var(--accent)}
    h2{margin:0;font:700 25px/1.05 Arial,sans-serif;letter-spacing:-.035em}.description{margin:0;color:#4e4b47}.tags span{padding:3px 6px;border:1px solid var(--line)}
    .decision{display:grid;grid-template-columns:minmax(0,1fr) auto;margin-top:auto;border:1px solid var(--ink)}.decision input[type=url]{min-width:0;padding:11px;border:0;background:#fff}.decision label{display:flex;align-items:center;gap:7px;padding:0 11px;border-left:1px solid var(--ink);cursor:pointer}.decision input[type=checkbox]{accent-color:var(--accent)}
    .empty{grid-column:1/-1;padding:48px;border-right:1px solid var(--ink);border-bottom:1px solid var(--ink);text-align:center}
    @media(max-width:760px){header,.list{grid-template-columns:1fr}.toolbar{grid-template-columns:1fr 1fr}.toolbar input{grid-column:1/-1;border-bottom:1px solid var(--ink)}h1{font-size:48px}}
  </style>
</head>
<body>
  <main class="shell">
    <header><h1>Billets sans source.</h1><p>Révision locale des billets du Blog OOBLIK sans destination détectable. Ouvre le billet, Wayback ou la recherche, saisis une source publique certaine — ou marque le billet à ignorer — puis exporte les décisions.</p></header>
    <div class="summary"><span><strong>${report.unresolved.length}</strong> à examiner</span><span><strong>${report.unique.length}</strong> candidats uniques séparés</span><span><strong>${report.ambiguous.length}</strong> cas ambigus séparés</span><span id="progress">0 décision</span></div>
    <div class="toolbar"><input id="search" type="search" placeholder="Rechercher un titre, une date, un tag…"><button id="pending" type="button" aria-pressed="false">Seulement en attente</button><button id="export" type="button">Exporter overrides.json</button></div>
    <section class="list" id="list"></section>
  </main>
  <script type="application/json" id="data">${safeJson(report.unresolved)}</script>
  <script>
    const items=JSON.parse(document.querySelector('#data').textContent),key='ooblik-wordpress-recovery-v1';
    let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch{}
    const list=document.querySelector('#list'),search=document.querySelector('#search'),pending=document.querySelector('#pending'),progress=document.querySelector('#progress');
    const element=(name,className,text)=>{const node=document.createElement(name);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
    const persist=()=>{localStorage.setItem(key,JSON.stringify(saved));refresh()};
    const card=(item)=>{const article=element('article');article.dataset.id=item.wordpress_id;article.dataset.search=[item.title,item.added,...item.tags].join(' ').toLocaleLowerCase('fr');
      const meta=element('div','meta');meta.append(element('span','id','#'+item.wordpress_id),element('span','',item.added));article.append(meta,element('h2','',item.title));
      if(item.description)article.append(element('p','description',item.description));if(item.tags.length){const tags=element('div','tags');for(const tag of item.tags)tags.append(element('span','',tag));article.append(tags)}
      const links=element('div','links');for(const [label,url] of [['Ancien billet',item.origin_url],['Wayback','https://web.archive.org/web/*/'+item.origin_url],['Recherche exacte','https://www.google.com/search?q='+encodeURIComponent('\\"'+item.title+'\\"')]]){const a=element('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';links.append(a)}article.append(links);
      const decision=element('div','decision'),input=element('input');input.type='url';input.placeholder='https://destination-retrouvee.example/';input.value=saved[item.wordpress_id]?.source_url||'';input.setAttribute('aria-label','Source publique pour '+item.title);
      const label=element('label'),skip=element('input');skip.type='checkbox';skip.checked=Boolean(saved[item.wordpress_id]?.skip);label.append(skip,document.createTextNode('Ignorer'));
      const update=()=>{const source=input.value.trim();saved[item.wordpress_id]={...(source?{source_url:source}:{}),...(skip.checked?{skip:true}:{})};if(!source&&!skip.checked)delete saved[item.wordpress_id];persist()};input.addEventListener('change',update);skip.addEventListener('change',update);decision.append(input,label);article.append(decision);return article};
    for(const item of items)list.append(card(item));
    const refresh=()=>{const term=search.value.trim().toLocaleLowerCase('fr'),onlyPending=pending.getAttribute('aria-pressed')==='true';let visible=0,decisions=0;for(const article of list.children){const done=Boolean(saved[article.dataset.id]?.source_url||saved[article.dataset.id]?.skip);article.classList.toggle('is-done',done);article.hidden=!article.dataset.search.includes(term)||(onlyPending&&done);if(!article.hidden)visible++;if(done)decisions++}progress.textContent=decisions+' décision'+(decisions>1?'s':'')+' / '+items.length;if(!visible&&!list.querySelector('.empty'))list.append(element('p','empty','Aucun billet ne correspond à ce filtre.'));else if(visible)list.querySelector('.empty')?.remove()};
    search.addEventListener('input',refresh);pending.addEventListener('click',()=>{const next=pending.getAttribute('aria-pressed')!=='true';pending.setAttribute('aria-pressed',String(next));refresh()});
    document.querySelector('#export').addEventListener('click',()=>{const ordered=Object.fromEntries(items.filter(item=>saved[item.wordpress_id]).map(item=>[item.wordpress_id,saved[item.wordpress_id]]));const blob=new Blob([JSON.stringify(ordered,null,2)+'\\n'],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='overrides.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});refresh();
  </script>
</body>
</html>`;

export const renderWordpressValidationHtml = (
  report: WordpressValidationReport,
): string => `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Validation des destinations · Blog OOBLIK</title>
  <style>
    :root{color-scheme:light;--paper:#f5f2ec;--ink:#161616;--line:#cfcac1;--muted:#77736d;--accent:#ff5c35;--ok:#087f5b}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}button,input{border-radius:0;font:inherit}a{color:inherit;text-underline-offset:.2em}.shell{width:min(1180px,calc(100% - 32px));margin:auto;padding:48px 0 80px}
    header{display:grid;grid-template-columns:minmax(0,2fr) minmax(260px,1fr);gap:40px;padding-bottom:28px;border-bottom:2px solid var(--ink)}h1{max-width:780px;margin:0;font:700 clamp(38px,7vw,88px)/.9 Arial,sans-serif;letter-spacing:-.06em}header p{margin:0;color:var(--muted)}
    .summary{display:flex;flex-wrap:wrap;gap:8px 24px;padding:18px 0;color:var(--muted);font-size:12px;text-transform:uppercase}.summary strong{color:var(--ink)}
    .toolbar{position:sticky;z-index:3;top:0;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:0;margin-bottom:24px;background:var(--paper);border:1px solid var(--ink)}.toolbar input,.toolbar button{min-height:48px;padding:0 14px;border:0;border-right:1px solid var(--ink);background:transparent;color:inherit}.toolbar button:last-child{border-right:0}.toolbar button:hover{background:var(--ink);color:var(--paper)}
    .list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid var(--ink);border-left:1px solid var(--ink)}article{display:grid;min-width:0;gap:15px;padding:20px;border-right:1px solid var(--ink);border-bottom:1px solid var(--ink)}article.is-done{background:#e9e5dc}article[hidden]{display:none}.meta,.links,.tags{display:flex;flex-wrap:wrap;gap:7px 14px;color:var(--muted);font-size:11px;text-transform:uppercase}.id,.reason{color:var(--accent)}h2{margin:0;font:700 25px/1.05 Arial,sans-serif;letter-spacing:-.035em}.description{margin:0;color:#4e4b47}.tags span{padding:3px 6px;border:1px solid var(--line)}
    .candidates{display:grid;gap:0;border:1px solid var(--line)}.candidate{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:stretch;border-bottom:1px solid var(--line)}.candidate:last-child{border-bottom:0}.candidate a{min-width:0;overflow:hidden;padding:9px 10px;text-overflow:ellipsis;white-space:nowrap}.candidate button{padding:0 10px;border:0;border-left:1px solid var(--line);background:transparent}.candidate button:hover{background:var(--ink);color:var(--paper)}.no-candidate{margin:0;padding:10px;color:var(--muted)}
    .decision{display:grid;grid-template-columns:minmax(0,1fr) auto auto;margin-top:auto;border:1px solid var(--ink)}.decision input[type=url]{min-width:0;padding:11px;border:0;background:#fff}.decision button{padding:0 10px;border:0;border-left:1px solid var(--ink);background:transparent}.decision button:hover{background:var(--ink);color:var(--paper)}.decision label{display:flex;align-items:center;gap:7px;padding:0 11px;border-left:1px solid var(--ink);cursor:pointer}.decision input[type=checkbox]{accent-color:var(--accent)}.empty{grid-column:1/-1;padding:48px;border-right:1px solid var(--ink);border-bottom:1px solid var(--ink);text-align:center}
    @media(max-width:760px){header,.list{grid-template-columns:1fr}.toolbar{grid-template-columns:1fr 1fr}.toolbar input{grid-column:1/-1;border-bottom:1px solid var(--ink)}h1{font-size:48px}.decision{grid-template-columns:1fr 1fr}.decision input{grid-column:1/-1;border-bottom:1px solid var(--ink)}}
  </style>
</head>
<body><main class="shell">
  <header><h1>Destinations à valider.</h1><p>Contrôle éditorial des billets du Blog OOBLIK encore bloqués. Compare les pistes détectées, choisis une destination certaine, saisis-en une autre ou conserve le billet sous son adresse WordPress.</p></header>
  <div class="summary"><span><strong>${report.items.length}</strong> billets</span><span><strong>${report.items.filter((item) => item.candidates.length === 1).length}</strong> avec une piste</span><span><strong>${report.items.filter((item) => item.candidates.length > 1).length}</strong> avec plusieurs pistes</span><span><strong>${report.items.filter((item) => item.candidates.length === 0).length}</strong> sans piste</span><span id="progress">0 décision</span></div>
  <div class="toolbar"><input id="search" type="search" placeholder="Rechercher un titre, une date, un motif, un tag…"><button id="pending" type="button" aria-pressed="false">Seulement en attente</button><button id="export" type="button">Exporter overrides.json</button></div>
  <section class="list" id="list"></section>
</main>
<script type="application/json" id="data">${safeJson(report.items)}</script>
<script type="application/json" id="base">${safeJson(report.base_overrides)}</script>
<script>
  const items=JSON.parse(document.querySelector('#data').textContent),base=JSON.parse(document.querySelector('#base').textContent),key='ooblik-wordpress-validation-v1';let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch{}
  const list=document.querySelector('#list'),search=document.querySelector('#search'),pending=document.querySelector('#pending'),progress=document.querySelector('#progress');const element=(name,className,text)=>{const node=document.createElement(name);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
  const persist=()=>{localStorage.setItem(key,JSON.stringify(saved));refresh()};const setSource=(id,input,skip,url)=>{input.value=url;skip.checked=false;saved[id]={source_url:url};persist()};
  const card=(item)=>{const article=element('article');article.dataset.id=item.wordpress_id;article.dataset.search=[item.title,item.added,item.reason,...item.tags,...item.candidates].join(' ').toLocaleLowerCase('fr');const meta=element('div','meta');meta.append(element('span','id','#'+item.wordpress_id),element('span','',item.added),element('span','reason',item.reason.replaceAll('_',' ')));article.append(meta,element('h2','',item.title));if(item.description)article.append(element('p','description',item.description));if(item.tags.length){const tags=element('div','tags');for(const tag of item.tags)tags.append(element('span','',tag));article.append(tags)}
    const candidates=element('div','candidates');if(item.candidates.length){for(const url of item.candidates){const row=element('div','candidate'),a=element('a','',url),choose=element('button','', 'Choisir');a.href=url;a.target='_blank';a.rel='noopener noreferrer';row.append(a,choose);candidates.append(row);choose.addEventListener('click',()=>setSource(item.wordpress_id,input,skip,url))}}else candidates.append(element('p','no-candidate','Aucune destination détectée.'));article.append(candidates);
    const links=element('div','links');for(const [label,url] of [['Ancien billet',item.origin_url],['Wayback','https://web.archive.org/web/*/'+item.origin_url],['Recherche exacte','https://www.google.com/search?q='+encodeURIComponent('"'+item.title+'"')]]){const a=element('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';links.append(a)}article.append(links);
    const decision=element('div','decision'),input=element('input');input.type='url';input.placeholder='https://destination-publique.example/';input.value=saved[item.wordpress_id]?.source_url||'';input.setAttribute('aria-label','Destination pour '+item.title);const archive=element('button','', 'Archiver tel quel'),label=element('label'),skip=element('input');skip.type='checkbox';skip.checked=Boolean(saved[item.wordpress_id]?.skip);label.append(skip,document.createTextNode('Ignorer'));const update=()=>{const source=input.value.trim();saved[item.wordpress_id]={...(source?{source_url:source}:{}),...(skip.checked?{skip:true}:{})};if(!source&&!skip.checked)delete saved[item.wordpress_id];persist()};input.addEventListener('change',update);skip.addEventListener('change',update);archive.addEventListener('click',()=>setSource(item.wordpress_id,input,skip,item.origin_url));decision.append(input,archive,label);article.append(decision);return article};for(const item of items)list.append(card(item));
  const refresh=()=>{const term=search.value.trim().toLocaleLowerCase('fr'),onlyPending=pending.getAttribute('aria-pressed')==='true';let visible=0,decisions=0;for(const article of list.children){const done=Boolean(saved[article.dataset.id]?.source_url||saved[article.dataset.id]?.skip);article.classList.toggle('is-done',done);article.hidden=!article.dataset.search.includes(term)||(onlyPending&&done);if(!article.hidden)visible++;if(done)decisions++}progress.textContent=decisions+' décision'+(decisions>1?'s':'')+' / '+items.length;if(!visible&&!list.querySelector('.empty'))list.append(element('p','empty','Aucun billet ne correspond à ce filtre.'));else if(visible)list.querySelector('.empty')?.remove()};search.addEventListener('input',refresh);pending.addEventListener('click',()=>{const next=pending.getAttribute('aria-pressed')!=='true';pending.setAttribute('aria-pressed',String(next));refresh()});
  document.querySelector('#export').addEventListener('click',()=>{const decisions=Object.fromEntries(items.filter(item=>saved[item.wordpress_id]).map(item=>[item.wordpress_id,saved[item.wordpress_id]])),merged={...base,...decisions};const ordered=Object.fromEntries(Object.entries(merged).sort(([a],[b])=>Number(a)-Number(b)));const blob=new Blob([JSON.stringify(ordered,null,2)+'\\n'],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='overrides.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});refresh();
</script></body></html>`;

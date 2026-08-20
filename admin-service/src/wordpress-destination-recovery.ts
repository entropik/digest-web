import type { DigestLink } from "./catalog.js";
import {
  BLOG_ARCHIVE_STREAM,
  parseWordpressExport,
  type WordpressOverride,
  type WordpressPostCandidate,
} from "./wordpress-import.js";
import { canonicalizePublicUrl, UnsafeUrlError } from "./urls.js";

const EXCLUDED_HOSTS = new Set([
  "blog.ooblik.com",
  "ooblik.com",
  "www.ooblik.com",
]);
const SEARCH_HOSTS = new Set([
  "bing.com",
  "duckduckgo.com",
  "google.com",
  "search.brave.com",
  "www.bing.com",
  "www.google.com",
]);
const STOP_WORDS = new Set([
  "avec",
  "blog",
  "chez",
  "dans",
  "depuis",
  "digest",
  "elle",
  "entre",
  "leurs",
  "mais",
  "ooblik",
  "photographe",
  "photographie",
  "pour",
  "source",
  "sous",
  "tout",
  "tous",
  "une",
  "vers",
  "with",
]);

export type BraveWebResult = {
  title?: string;
  url?: string;
  description?: string;
};

export type WordpressDestinationTarget = {
  wordpress_id: string;
  title: string;
  origin_url: string;
  added: string;
  description: string;
  tags: string[];
};

export type WordpressDestinationCandidate = {
  title: string;
  url: string;
  description: string;
  host: string;
  score: number;
  confidence: "haute" | "moyenne" | "faible";
  existing_link_id?: string;
  existing_link_title?: string;
};

export type WordpressDestinationSearchItem = WordpressDestinationTarget & {
  query: string;
  searched_at: string;
  candidates: WordpressDestinationCandidate[];
};

export type WordpressDestinationSearchCache = Record<
  string,
  WordpressDestinationSearchItem
>;

export type WordpressDestinationSearchReport = {
  generated_at: string;
  target_count: number;
  searched_count: number;
  pending_count: number;
  high_confidence: number;
  medium_confidence: number;
  without_candidate: number;
  items: WordpressDestinationSearchItem[];
};

const normalized = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (value: string): string[] =>
  [...new Set(normalized(value).split(" "))].filter(
    (token) => token.length >= 4 && !STOP_WORDS.has(token),
  );

const canonicalOrEmpty = (value: string | undefined): string => {
  if (!value) return "";
  try {
    return canonicalizePublicUrl(value);
  } catch (error) {
    if (error instanceof UnsafeUrlError || error instanceof TypeError) return "";
    throw error;
  }
};

const canonicalIdentity = (value: string): string => {
  const url = canonicalOrEmpty(value);
  return url.endsWith("/") ? url.slice(0, -1) : url;
};

const cleanSearchTitle = (title: string): string =>
  title
    .replace(/\s*[|·]\s*-?\s*le blog\s*-?\s*ooblik.*$/i, "")
    .replace(/\s*[|·]\s*ooblik.*$/i, "")
    .replace(/^source\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

export const wordpressDestinationSearchQuery = (title: string): string => {
  const cleaned = cleanSearchTitle(title).replace(/[|–—]+/g, " ").replace(/\s+/g, " ");
  return `${cleaned} -site:blog.ooblik.com -site:ooblik.com`;
};

const targetFromPost = (
  post: WordpressPostCandidate,
): WordpressDestinationTarget => ({
  wordpress_id: post.wordpressId,
  title: post.title,
  origin_url: post.originUrl,
  added: post.added,
  description: post.contentExcerpt || post.description,
  tags: post.tags.filter((tag) => tag !== BLOG_ARCHIVE_STREAM),
});

export const buildWordpressDestinationTargets = (input: {
  xml: string;
  currentLinks: DigestLink[];
}): WordpressDestinationTarget[] => {
  const linksByOrigin = new Map(
    input.currentLinks
      .filter((link) => link.stream === BLOG_ARCHIVE_STREAM && link.origin_url)
      .map((link) => [canonicalIdentity(link.origin_url!), link]),
  );
  return parseWordpressExport(input.xml)
    .filter((post) => {
      const origin = canonicalIdentity(post.originUrl);
      const link = linksByOrigin.get(origin);
      return Boolean(link && canonicalIdentity(link.url) === origin);
    })
    .map(targetFromPost);
};

const scoreResult = (
  target: WordpressDestinationTarget,
  result: Required<BraveWebResult>,
  rank: number,
): number => {
  const wanted = tokens(target.title);
  const titleTokens = new Set(tokens(result.title));
  const allTokens = new Set(tokens(`${result.title} ${result.description} ${result.url}`));
  const titleHits = wanted.filter((token) => titleTokens.has(token)).length;
  const allHits = wanted.filter((token) => allTokens.has(token)).length;
  const divisor = Math.max(1, wanted.length);
  let score = Math.round((titleHits / divisor) * 55 + (allHits / divisor) * 25);
  const wantedTitle = normalized(cleanSearchTitle(target.title));
  const resultTitle = normalized(result.title);
  if (wantedTitle && (resultTitle.includes(wantedTitle) || wantedTitle.includes(resultTitle))) {
    score += 15;
  }
  score += Math.max(0, 5 - rank);
  return Math.min(100, score);
};

const hasStrongIdentityEvidence = (
  target: WordpressDestinationTarget,
  result: Pick<Required<BraveWebResult>, "title" | "url">,
): boolean => {
  const wanted = tokens(cleanSearchTitle(target.title)).filter((token) =>
    /[a-z]/.test(token),
  );
  const resultTokens = new Set(tokens(`${result.title} ${result.url}`));
  const coverage =
    wanted.filter((token) => resultTokens.has(token)).length /
    Math.max(1, wanted.length);
  const host = new URL(result.url).hostname
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]/g, "");
  const identityInHost = wanted.some(
    (token, index) =>
      index + 1 < wanted.length && host.includes(`${token}${wanted[index + 1]}`),
  );
  return (wanted.length >= 3 && coverage >= 0.8) || identityInHost;
};

const confidenceFor = (
  score: number,
  strongIdentity: boolean,
): WordpressDestinationCandidate["confidence"] =>
  score >= 78 && strongIdentity ? "haute" : score >= 48 ? "moyenne" : "faible";

export const rankWordpressDestinationCandidates = (input: {
  target: WordpressDestinationTarget;
  results: BraveWebResult[];
  currentLinks: DigestLink[];
}): WordpressDestinationCandidate[] => {
  const currentByUrl = new Map(
    input.currentLinks.map((link) => [canonicalIdentity(link.url), link]),
  );
  const seen = new Set<string>();
  return input.results
    .map((result, rank) => {
      const url = canonicalOrEmpty(result.url);
      if (!url) return null;
      const host = new URL(url).hostname.toLowerCase();
      if (EXCLUDED_HOSTS.has(host) || SEARCH_HOSTS.has(host)) return null;
      const identity = canonicalIdentity(url);
      if (seen.has(identity)) return null;
      seen.add(identity);
      const complete = {
        title: result.title?.trim() || host,
        url,
        description: result.description?.trim() || "",
      };
      const score = scoreResult(input.target, complete, rank);
      const existing = currentByUrl.get(identity);
      return {
        ...complete,
        host,
        score,
        confidence: confidenceFor(score, hasStrongIdentityEvidence(input.target, complete)),
        ...(existing
          ? {
              existing_link_id: existing.id,
              existing_link_title: existing.title,
            }
          : {}),
      } satisfies WordpressDestinationCandidate;
    })
    .filter((candidate): candidate is WordpressDestinationCandidate => Boolean(candidate))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
};

export const buildWordpressDestinationSearchReport = (input: {
  targets: WordpressDestinationTarget[];
  cache: WordpressDestinationSearchCache;
}): WordpressDestinationSearchReport => {
  const items = input.targets
    .map((target) => {
      const cached = input.cache[target.wordpress_id];
      if (!cached) return undefined;
      return {
        ...cached,
        candidates: cached.candidates.map((candidate) => ({
          ...candidate,
          confidence: confidenceFor(
            candidate.score,
            hasStrongIdentityEvidence(target, candidate),
          ),
        })),
      } satisfies WordpressDestinationSearchItem;
    })
    .filter((item): item is WordpressDestinationSearchItem => Boolean(item));
  return {
    generated_at: new Date().toISOString(),
    target_count: input.targets.length,
    searched_count: items.length,
    pending_count: input.targets.length - items.length,
    high_confidence: items.filter(
      (item) => item.candidates[0]?.confidence === "haute",
    ).length,
    medium_confidence: items.filter(
      (item) => item.candidates[0]?.confidence === "moyenne",
    ).length,
    without_candidate: items.filter((item) => item.candidates.length === 0).length,
    items,
  };
};

export const acceptHighConfidenceWordpressDestinations = (
  report: WordpressDestinationSearchReport,
  overrides: Record<string, WordpressOverride>,
): { overrides: Record<string, WordpressOverride>; accepted: number } => {
  const next = { ...overrides };
  let accepted = 0;
  for (const item of report.items) {
    const candidate = item.candidates[0];
    if (candidate?.confidence !== "haute" || candidate.existing_link_id) continue;
    const override = { ...(next[item.wordpress_id] ?? {}), source_url: candidate.url };
    delete override.skip;
    next[item.wordpress_id] = override;
    accepted++;
  }
  return {
    overrides: Object.fromEntries(
      Object.entries(next).sort(([left], [right]) => Number(left) - Number(right)),
    ),
    accepted,
  };
};

const safeJson = (value: unknown): string =>
  JSON.stringify(value).replaceAll("<", "\\u003c");

export const renderWordpressDestinationSearchHtml = (
  report: WordpressDestinationSearchReport,
  baseOverrides: Record<string, WordpressOverride>,
): string => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Destinations retrouvées · Blog OOBLIK</title>
<style>
:root{color-scheme:light;--paper:#f5f2ec;--ink:#161616;--line:#cfcac1;--muted:#77736d;--accent:#ff5c35;--ok:#087f5b}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}button,input{border-radius:0;font:inherit}a{color:inherit;text-underline-offset:.2em}.shell{width:min(1260px,calc(100% - 32px));margin:auto;padding:48px 0 80px}header{display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:40px;padding-bottom:28px;border-bottom:2px solid var(--ink)}h1{margin:0;font:700 clamp(42px,7vw,90px)/.88 Arial,sans-serif;letter-spacing:-.065em}header p{margin:0;color:var(--muted)}.summary{display:flex;flex-wrap:wrap;gap:8px 24px;padding:18px 0;color:var(--muted);font-size:12px;text-transform:uppercase}.summary strong{color:var(--ink)}.toolbar{position:sticky;z-index:3;top:0;display:grid;grid-template-columns:minmax(0,1fr) auto auto;margin-bottom:24px;background:var(--paper);border:1px solid var(--ink)}.toolbar input,.toolbar button{min-height:48px;padding:0 14px;border:0;border-right:1px solid var(--ink);background:transparent}.toolbar button:last-child{border-right:0}.toolbar button:hover{background:var(--ink);color:var(--paper)}.list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid var(--ink);border-left:1px solid var(--ink)}article{display:grid;min-width:0;gap:15px;padding:20px;border-right:1px solid var(--ink);border-bottom:1px solid var(--ink)}article.is-done{background:#e9e5dc}article[hidden]{display:none}.meta,.links,.tags{display:flex;flex-wrap:wrap;gap:7px 14px;color:var(--muted);font-size:11px;text-transform:uppercase}.id,.high{color:var(--accent)}h2{margin:0;font:700 25px/1.05 Arial,sans-serif;letter-spacing:-.035em}.description{margin:0;color:#4e4b47}.tags span{padding:3px 6px;border:1px solid var(--line)}.candidates{display:grid;border:1px solid var(--line)}.candidate{display:grid;grid-template-columns:minmax(0,1fr) auto;border-bottom:1px solid var(--line)}.candidate:last-child{border-bottom:0}.candidate-main{min-width:0;padding:10px}.candidate-title{display:block;font-weight:700}.candidate-url{display:block;overflow:hidden;color:var(--muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.candidate-meta{display:flex;gap:12px;margin-top:6px;color:var(--muted);font-size:10px;text-transform:uppercase}.candidate-meta .haute{color:var(--ok)}.candidate button{padding:0 12px;border:0;border-left:1px solid var(--line);background:transparent}.candidate button:hover{background:var(--ink);color:var(--paper)}.decision{display:grid;grid-template-columns:minmax(0,1fr) auto;margin-top:auto;border:1px solid var(--ink)}.decision input{min-width:0;padding:11px;border:0;background:#fff}.decision button{border:0;border-left:1px solid var(--ink);background:transparent;padding:0 11px}.decision button:hover{background:var(--ink);color:var(--paper)}.empty{grid-column:1/-1;padding:48px;border-right:1px solid var(--ink);border-bottom:1px solid var(--ink);text-align:center}@media(max-width:760px){header,.list{grid-template-columns:1fr}.toolbar{grid-template-columns:1fr 1fr}.toolbar input{grid-column:1/-1;border-bottom:1px solid var(--ink)}h1{font-size:48px}}
</style></head><body><main class="shell"><header><h1>Destinations retrouvées.</h1><p>Suggestions issues d’une recherche web automatisée. Aucun résultat n’est publié automatiquement : vérifie l’identité et le contenu, choisis une destination certaine ou conserve le billet sous son adresse d’archive.</p></header>
<div class="summary"><span><strong>${report.target_count}</strong> billets ciblés</span><span><strong>${report.searched_count}</strong> recherchés</span><span><strong>${report.pending_count}</strong> en attente</span><span><strong>${report.high_confidence}</strong> confiance haute</span><span><strong>${report.without_candidate}</strong> sans résultat</span><span id="progress">0 décision</span></div>
<div class="toolbar"><input id="search" type="search" placeholder="Rechercher un titre, un domaine, un tag…"><button id="pending" type="button" aria-pressed="false">Seulement en attente</button><button id="export" type="button">Exporter overrides.json</button></div><section class="list" id="list"></section></main>
<script type="application/json" id="data">${safeJson(report.items)}</script><script type="application/json" id="base">${safeJson(baseOverrides)}</script><script>
const items=JSON.parse(document.querySelector('#data').textContent),base=JSON.parse(document.querySelector('#base').textContent),key='ooblik-wordpress-destination-recovery-v1';let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch{}const list=document.querySelector('#list'),search=document.querySelector('#search'),pending=document.querySelector('#pending'),progress=document.querySelector('#progress'),element=(name,className,text)=>{const node=document.createElement(name);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node},persist=()=>{localStorage.setItem(key,JSON.stringify(saved));refresh()},setSource=(item,input,url)=>{input.value=url;saved[item.wordpress_id]={source_url:url};persist()};
const card=(item)=>{const article=element('article');article.dataset.id=item.wordpress_id;article.dataset.search=[item.title,item.added,...item.tags,...item.candidates.flatMap(candidate=>[candidate.title,candidate.url,candidate.description])].join(' ').toLocaleLowerCase('fr');const defaultSource=base[item.wordpress_id]?.source_url&&base[item.wordpress_id].source_url!==item.origin_url?base[item.wordpress_id].source_url:'';article.dataset.baseSource=defaultSource;const meta=element('div','meta');meta.append(element('span','id','#'+item.wordpress_id),element('span','',item.added));article.append(meta,element('h2','',item.title));if(item.description)article.append(element('p','description',item.description));if(item.tags.length){const tags=element('div','tags');for(const tag of item.tags)tags.append(element('span','',tag));article.append(tags)}const candidates=element('div','candidates');if(item.candidates.length){for(const candidate of item.candidates){const row=element('div','candidate'),main=element('div','candidate-main'),title=element('a','candidate-title',candidate.title),url=element('span','candidate-url',candidate.url),info=element('div','candidate-meta'),choose=element('button','', 'Choisir');title.href=candidate.url;title.target='_blank';title.rel='noopener noreferrer';info.append(element('span',candidate.confidence,candidate.score+' / 100 · '+candidate.confidence));if(candidate.existing_link_id)info.append(element('span','', 'déjà dans le Digest'));main.append(title,url,info);row.append(main,choose);candidates.append(row);choose.addEventListener('click',()=>setSource(item,input,candidate.url))}}else candidates.append(element('p','description','Aucun résultat public exploitable.'));article.append(candidates);const links=element('div','links');for(const [label,url] of [['Ancien billet',item.origin_url],['Wayback','https://web.archive.org/web/*/'+item.origin_url],['Recherche Brave','https://search.brave.com/search?q='+encodeURIComponent(item.query)]]){const a=element('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';links.append(a)}article.append(links);const decision=element('div','decision'),input=element('input');input.type='url';input.placeholder='https://destination-publique.example/';input.value=saved[item.wordpress_id]?.source_url||defaultSource;const archive=element('button','', 'Garder l’archive');input.addEventListener('change',()=>{const source=input.value.trim();if(source)saved[item.wordpress_id]={source_url:source};else delete saved[item.wordpress_id];persist()});archive.addEventListener('click',()=>setSource(item,input,item.origin_url));decision.append(input,archive);article.append(decision);return article};for(const item of items)list.append(card(item));
const refresh=()=>{const term=search.value.trim().toLocaleLowerCase('fr'),onlyPending=pending.getAttribute('aria-pressed')==='true';let visible=0,decisions=0;for(const article of list.children){const done=Boolean(saved[article.dataset.id]?.source_url||article.dataset.baseSource);article.classList.toggle('is-done',done);article.hidden=!article.dataset.search.includes(term)||(onlyPending&&done);if(!article.hidden)visible++;if(done)decisions++}progress.textContent=decisions+' décision'+(decisions>1?'s':'')+' / '+items.length;if(!visible&&!list.querySelector('.empty'))list.append(element('p','empty','Aucun billet ne correspond à ce filtre.'));else if(visible)list.querySelector('.empty')?.remove()};search.addEventListener('input',refresh);pending.addEventListener('click',()=>{const next=pending.getAttribute('aria-pressed')!=='true';pending.setAttribute('aria-pressed',String(next));refresh()});document.querySelector('#export').addEventListener('click',()=>{const merged={...base,...saved},ordered=Object.fromEntries(Object.entries(merged).sort(([a],[b])=>Number(a)-Number(b))),blob=new Blob([JSON.stringify(ordered,null,2)+'\\n'],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='overrides.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});refresh();
</script></body></html>`;

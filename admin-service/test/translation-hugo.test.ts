import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {mkdtemp,mkdir,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {sourceHash,snapshotRevision} from "../src/translation-types.js";

test("Hugo English adapter reuses current fields, falls back after edits and preserves equivalent routes",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"digest-english-"));
  try {
    for(const name of ["content","data","i18n","layouts/partials","static/js","static/social/en",".build-i18n"])await mkdir(path.join(directory,name),{recursive:true});
    for(const file of ["content/_content.en.gotmpl","i18n/en.json","i18n/fr.json","layouts/partials/english-content.html","layouts/partials/public-route-map.html","layouts/partials/about-liquid-script.html","layouts/partials/archive-og-image-alt.html","layouts/partials/translated-link.html","layouts/partials/translated-visual.html","layouts/partials/translated.html","layouts/partials/translation-field.html","static/js/about-liquid.js"]){
      await writeFile(path.join(directory,file),await readFile(new URL("../../"+file,import.meta.url)));
    }
    await writeFile(path.join(directory,"hugo.toml"),'baseURL="https://digest.ooblik.com/"\ndefaultContentLanguage="fr"\ndisableKinds=["RSS","sitemap","taxonomy","term"]\n[security]\nallowContent=["text/html","text/markdown"]\n[languages.fr]\nweight=1\n[languages.en]\nweight=2\n');
    await writeFile(path.join(directory,"content/page.md"),'---\ntitle: Bonjour\n---\nTexte français');
    await writeFile(path.join(directory,"content/current.md"),'---\ntitle: Courant\n---\nCorps français');
    await writeFile(path.join(directory,"content/a-propos.md"),'---\ntitle: À propos\n---\nTexte à survoler');
    await writeFile(path.join(directory,"layouts/single.html"),'<html lang="{{ site.Language.Lang }}"><h1>{{ .Title }}</h1><p>{{ .Params.translation_pending }}</p><p>{{ index .Params.images 0 }}|{{ .Params.visual }}|{{ .Params.translation_artwork_current }}</p>{{ $link := partial "translated-link.html" (dict "id" "fixture" "title" "Titre du lien") }}<p>link={{ $link.title }}|{{ $link.translation_pending | default false }}</p>{{ $visual := partial "translated-visual.html" (dict "image" "/poster.png" "title" "Affiche") }}<p>visual={{ $visual.title }}|{{ $visual.translationPending }}</p>{{ $pendingVisual := partial "translated-visual.html" (dict "image" "/pending.png" "title" "En attente") }}<p>pending-visual={{ $pendingVisual.title }}|{{ $pendingVisual.translationPending }}</p><meta name="fixture-og-alt" content="{{ partial "archive-og-image-alt.html" .Title }}">{{ .Content }}{{ partial "about-liquid-script.html" . }}</html>');
    await writeFile(path.join(directory,"layouts/home.html"),'Home');
    const body='<p>Bonjour <a href="/page/#detail">ici</a> <a href="https://example.com/">ailleurs</a></p><pre><code>x()</code></pre>';
    const fields={title:{source:"Titre changé",format:"text",hash:sourceHash("Titre changé","text")},description:{source:"Résumé",format:"text",hash:sourceHash("Résumé","text")},body:{source:body,format:"html",hash:sourceHash(body,"html")}};
    const date="2026-09-01",artwork={date,linkCount:0,editorialType:"digest"};
    const currentDate="2026-09-02",currentBody="<p>Corps français</p>",currentFields={title:{source:"Courant",format:"text",hash:sourceHash("Courant","text")},description:{source:"Prêt",format:"text",hash:sourceHash("Prêt","text")},body:{source:currentBody,format:"html",hash:sourceHash(currentBody,"html")}},currentArtwork={date:currentDate,linkCount:2,editorialType:"focus"};
    await writeFile(path.join(directory,".build-i18n/manifest.json"),JSON.stringify({version:1,items:[{id:"page:/page",kind:"page",title:"Titre changé",date,route:"/page/",fields,artwork,page:{path:"/page",kind:"page",type:"page",layout:"",params:{digest_date:date,images:["/social/"+date+".png"],visual:"/social/"+date+"-linkedin.png"},aliases:["/old-page/"]}},{id:"page:/current",kind:"page",title:"Courant",date:currentDate,route:"/current/",fields:currentFields,artwork:currentArtwork,page:{path:"/current",kind:"page",type:"page",layout:"",params:{digest_date:currentDate,images:["/social/"+currentDate+".png"],visual:"/social/"+currentDate+"-linkedin.png"}}},{id:"page:/a-propos",kind:"page",title:"About",date,route:"/a-propos/",fields:{},page:{path:"/a-propos",kind:"page",type:"page",layout:"",params:{}}}]}));
    await writeFile(path.join(directory,"data/translations_en.json"),JSON.stringify({version:1,entries:{"page:/page":{title:{hash:sourceHash("Ancien titre","text"),text:"Outdated title"},description:{hash:fields.description.hash,text:"Summary"},body:{hash:fields.body.hash,text:body.replace("Bonjour","Hello").replace("ici","here").replace("ailleurs","elsewhere")}},"page:/current":{title:{hash:currentFields.title.hash,text:"Current"},description:{hash:currentFields.description.hash,text:"Ready"},body:{hash:currentFields.body.hash,text:"<p>English body</p>"}},"link:fixture":{title:{hash:sourceHash("Titre du lien","text"),text:"Link title"}},"visual:/poster.png":{title:{hash:sourceHash("Affiche","text"),text:"Poster"}}},artwork:{[date]:{title:"Outdated title",description:"Summary",linkCount:0,editorialType:"digest"},[currentDate]:{title:"Current",description:"Ready",linkCount:2,editorialType:"focus"}}}));
    for(const suffix of [".png","-linkedin.png"])await writeFile(path.join(directory,"static/social/en/"+date+suffix),"stale English image");
    for(const suffix of [".png","-linkedin.png"])await writeFile(path.join(directory,"static/social/en/"+currentDate+suffix),"current English image");
    const build=spawnSync("hugo",["--source",directory,"--panicOnWarning"],{encoding:"utf8"});
    assert.equal(build.status,0,build.stdout+build.stderr);
    const html=await readFile(path.join(directory,"public/en/page/index.html"),"utf8");
    assert.match(html,/<h1>Titre changé<\/h1>/);assert.doesNotMatch(html,/Outdated/);assert.match(html,/<p>true<\/p>/);
    assert.match(html,/Hello/);assert.match(html,/href="\/en\/page\/#detail"/);assert.match(html,/href="https:\/\/example.com\/"/);assert.match(html,/<code>x\(\)<\/code>/);
    assert.match(html,/link=Link title\|false/);assert.match(html,/visual=Poster\|false/);assert.match(html,/pending-visual=En attente\|true/);assert.match(html,/content="Generative poster for Digest edition Titre changé"/);
    assert.match(html,/\/social\/2026-09-01\.png\|\/social\/2026-09-01-linkedin\.png\|false/);assert.doesNotMatch(html,/\/social\/en\//);
    const alias=await readFile(path.join(directory,"public/en/old-page/index.html"),"utf8");
    assert.match(alias,/https:\/\/digest.ooblik.com\/en\/page\//);
    const currentHtml=await readFile(path.join(directory,"public/en/current/index.html"),"utf8");
    assert.match(currentHtml,/<h1>Current<\/h1>/);assert.match(currentHtml,/\/social\/en\/2026-09-02\.png\|\/social\/en\/2026-09-02-linkedin\.png\|true/);assert.doesNotMatch(currentHtml,/\/social\/2026-09-02/);
    const frenchHtml=await readFile(path.join(directory,"public/page/index.html"),"utf8");
    assert.match(frenchHtml,/Texte français/);assert.match(frenchHtml,/visual=Affiche\|false/);assert.match(frenchHtml,/content="Affiche générative de l’édition Bonjour du Digest"/);
    for(const locale of ["", "en/"]) {
      assert.match(await readFile(path.join(directory,"public/"+locale+"a-propos/index.html"),"utf8"),/src="\/js\/about-liquid[^\"]*\.js"/);
      assert.doesNotMatch(await readFile(path.join(directory,"public/"+locale+"page/index.html"),"utf8"),/about-liquid/);
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});

test("public snapshot fingerprints only current fields and artwork actually present",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"digest-snapshot-"));
  try {
    for(const name of ["content","data","layouts/partials",".build-i18n","static/social/en"])await mkdir(path.join(directory,name),{recursive:true});
    for(const file of ["layouts/index.translationsnapshot.json","layouts/partials/translation-revision.html"])await writeFile(path.join(directory,file),await readFile(new URL("../../"+file,import.meta.url)));
    await writeFile(path.join(directory,"hugo.toml"),'baseURL="https://example.com/"\ndisableKinds=["RSS","sitemap","taxonomy","term"]\n[outputs]\nhome=["HTML","TranslationSnapshot"]\n[outputFormats.TranslationSnapshot]\nmediaType="application/json"\nbaseName="translation-snapshot"\nisPlainText=true\n');
    await writeFile(path.join(directory,"layouts/home.html"),'Home');
    const date="2026-09-01",id="page:/archives/"+date;
    const fields={title:{source:"Titre",format:"text",hash:sourceHash("Titre","text")},description:{source:"Résumé",format:"text",hash:sourceHash("Résumé","text")},body:{source:"Modifié",format:"html",hash:sourceHash("Modifié","html")}};
    const artwork={date,linkCount:2,editorialType:"focus"};
    await writeFile(path.join(directory,".build-i18n/manifest.json"),JSON.stringify({version:1,items:[{id,fields,artwork}]}));
    const entries={[id]:{title:{hash:fields.title.hash,text:"Title"},description:{hash:fields.description.hash,text:"<b>Images & words</b>\u2028\u2029 🔤",manual:true},body:{hash:sourceHash("Ancien","html"),text:"Stale"}}};
    const images={[date]:{title:entries[id]!.title.text,description:entries[id]!.description.text,linkCount:1,editorialType:"digest"}};
    for(const suffix of [".png","-linkedin.png"])await writeFile(path.join(directory,"static/social/en/"+date+suffix),"image fixture");
    for(const state of ["stale metadata","current","missing image"]) {
      if(state!=="stale metadata"){images[date]!.linkCount=2;images[date]!.editorialType="focus";}
      if(state==="missing image")await rm(path.join(directory,"static/social/en/"+date+"-linkedin.png"));
      await writeFile(path.join(directory,"data/translations_en.json"),JSON.stringify({version:1,revision:"unfiltered-revision",entries,artwork:images}));
      const build=spawnSync("hugo",["--source",directory,"--panicOnWarning"],{encoding:"utf8"});
      assert.equal(build.status,0,build.stdout+build.stderr);
      const live=JSON.parse(await readFile(path.join(directory,"public/translation-snapshot.json"),"utf8"));
      assert.equal(live.entries[id].body,undefined);
      assert.equal(Boolean(live.artwork[date]),state==="current");
      assert.equal(live.revision,snapshotRevision(live.entries,live.artwork));
      assert.notEqual(live.revision,"unfiltered-revision");
      assert.equal(live.sourceRevision,"unfiltered-revision");
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});

test("language switch preserves the active archive paginator page",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"digest-language-pager-"));
  try {
    for(const name of ["content/archives","layouts/_default","layouts/archives","layouts/partials"])await mkdir(path.join(directory,name),{recursive:true});
    await writeFile(path.join(directory,"layouts/partials/language-switch.html"),await readFile(new URL("../../layouts/partials/language-switch.html",import.meta.url)));
    await writeFile(path.join(directory,"hugo.toml"),'baseURL="https://digest.ooblik.com/"\ndefaultContentLanguage="fr"\ndisableKinds=["RSS","sitemap","taxonomy","term"]\n[languages.fr]\nweight=1\n[languages.en]\nweight=2\n');
    await writeFile(path.join(directory,"content/archives/_index.md"),'---\ntitle: Archives\n---');
    await writeFile(path.join(directory,"content/archives/_index.en.md"),'---\ntitle: Archives\n---');
    for(let index=1;index<=25;index++){
      const name=String(index).padStart(2,"0"),frontmatter=`---\ntitle: Edition ${name}\ndate: 2026-08-${name}\n---\n`;
      await writeFile(path.join(directory,`content/archives/${name}.md`),frontmatter);
      await writeFile(path.join(directory,`content/archives/${name}.en.md`),frontmatter);
    }
    await writeFile(path.join(directory,"layouts/_default/baseof.html"),'<html><body>{{ partial "language-switch.html" . }}{{ block "main" . }}{{ end }}</body></html>');
    await writeFile(path.join(directory,"layouts/_default/single.html"),'{{ define "main" }}Page{{ end }}');
    await writeFile(path.join(directory,"layouts/home.html"),'{{ define "main" }}Home{{ end }}');
    await writeFile(path.join(directory,"layouts/archives/list.html"),'{{ define "main" }}{{ $paginator := .Paginate .Pages.ByDate.Reverse 24 }}<p>{{ $paginator.PageNumber }}</p>{{ end }}');
    const build=spawnSync("hugo",["--source",directory,"--panicOnWarning"],{encoding:"utf8"});
    assert.equal(build.status,0,build.stdout+build.stderr);
    const french=await readFile(path.join(directory,"public/archives/page/2/index.html"),"utf8");
    assert.match(french,/href="\/archives\/page\/2\/"[^>]+aria-current="true"/);assert.match(french,/href="\/en\/archives\/page\/2\/"/);
    const english=await readFile(path.join(directory,"public/en/archives/page/2/index.html"),"utf8");
    assert.match(english,/href="\/archives\/page\/2\/"/);assert.match(english,/href="\/en\/archives\/page\/2\/"[^>]+aria-current="true"/);
  } finally {await rm(directory,{recursive:true,force:true});}
});

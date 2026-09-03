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
    for(const file of ["content/_content.en.gotmpl","i18n/en.json","i18n/fr.json","layouts/partials/english-content.html","layouts/partials/public-route-map.html","layouts/partials/about-liquid-script.html","layouts/partials/archive-og-image-alt.html","layouts/partials/translated-visual.html","layouts/partials/translated.html","layouts/partials/translation-field.html","static/js/about-liquid.js"]){
      await writeFile(path.join(directory,file),await readFile(new URL("../../"+file,import.meta.url)));
    }
    await writeFile(path.join(directory,"hugo.toml"),'baseURL="https://digest.ooblik.com/"\ndefaultContentLanguage="fr"\ndisableKinds=["RSS","sitemap","taxonomy","term"]\n[security]\nallowContent=["text/html","text/markdown"]\n[languages.fr]\nweight=1\n[languages.en]\nweight=2\n');
    await writeFile(path.join(directory,"content/page.md"),'---\ntitle: Bonjour\n---\nTexte français');
    await writeFile(path.join(directory,"content/a-propos.md"),'---\ntitle: À propos\n---\nTexte à survoler');
    await writeFile(path.join(directory,"layouts/single.html"),'<html lang="{{ site.Language.Lang }}"><h1>{{ .Title }}</h1><p>{{ .Params.translation_pending }}</p><p>{{ index .Params.images 0 }}|{{ .Params.visual }}|{{ .Params.translation_artwork_current }}</p>{{ $visual := partial "translated-visual.html" (dict "image" "/poster.png" "title" "Affiche") }}<p>visual-pending={{ $visual.translationPending }}</p><meta name="fixture-og-alt" content="{{ partial "archive-og-image-alt.html" .Title }}">{{ .Content }}{{ partial "about-liquid-script.html" . }}</html>');
    await writeFile(path.join(directory,"layouts/home.html"),'Home');
    const body='<p>Bonjour <a href="/page/#detail">ici</a> <a href="https://example.com/">ailleurs</a></p><pre><code>x()</code></pre>';
    const fields={title:{source:"Titre changé",format:"text",hash:sourceHash("Titre changé","text")},description:{source:"Résumé",format:"text",hash:sourceHash("Résumé","text")},body:{source:body,format:"html",hash:sourceHash(body,"html")}};
    const date="2026-09-01",artwork={date,linkCount:0,editorialType:"digest"};
    await writeFile(path.join(directory,".build-i18n/manifest.json"),JSON.stringify({version:1,items:[{id:"page:/page",kind:"page",title:"Titre changé",date,route:"/page/",fields,artwork,page:{path:"/page",kind:"page",type:"page",layout:"",params:{digest_date:date,images:["/social/"+date+".png"],visual:"/social/"+date+"-linkedin.png"},aliases:["/old-page/"]}},{id:"page:/a-propos",kind:"page",title:"About",date,route:"/a-propos/",fields:{},page:{path:"/a-propos",kind:"page",type:"page",layout:"",params:{}}}]}));
    await writeFile(path.join(directory,"data/translations_en.json"),JSON.stringify({version:1,entries:{"page:/page":{title:{hash:sourceHash("Ancien titre","text"),text:"Outdated title"},description:{hash:fields.description.hash,text:"Summary"},body:{hash:fields.body.hash,text:body.replace("Bonjour","Hello").replace("ici","here").replace("ailleurs","elsewhere")}}},artwork:{[date]:{title:"Outdated title",description:"Summary",linkCount:0,editorialType:"digest"}}}));
    for(const suffix of [".png","-linkedin.png"])await writeFile(path.join(directory,"static/social/en/"+date+suffix),"stale English image");
    const build=spawnSync("hugo",["--source",directory,"--panicOnWarning"],{encoding:"utf8"});
    assert.equal(build.status,0,build.stdout+build.stderr);
    const html=await readFile(path.join(directory,"public/en/page/index.html"),"utf8");
    assert.match(html,/<h1>Titre changé<\/h1>/);assert.doesNotMatch(html,/Outdated/);assert.match(html,/<p>true<\/p>/);
    assert.match(html,/Hello/);assert.match(html,/href="\/en\/page\/#detail"/);assert.match(html,/href="https:\/\/example.com\/"/);assert.match(html,/<code>x\(\)<\/code>/);
    assert.match(html,/visual-pending=true/);assert.match(html,/content="Generative poster for Digest edition Titre changé"/);
    assert.match(html,/\/social\/2026-09-01\.png\|\/social\/2026-09-01-linkedin\.png\|false/);assert.doesNotMatch(html,/\/social\/en\//);
    const alias=await readFile(path.join(directory,"public/en/old-page/index.html"),"utf8");
    assert.match(alias,/https:\/\/digest.ooblik.com\/en\/page\//);
    const frenchHtml=await readFile(path.join(directory,"public/page/index.html"),"utf8");
    assert.match(frenchHtml,/Texte français/);assert.match(frenchHtml,/visual-pending=false/);assert.match(frenchHtml,/content="Affiche générative de l’édition Bonjour du Digest"/);
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

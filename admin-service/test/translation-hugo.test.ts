import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {mkdtemp,mkdir,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {sourceHash} from "../src/translation-types.js";

test("Hugo English adapter reuses current fields, falls back after edits and preserves equivalent routes",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"digest-english-"));
  try {
    for(const name of ["content","data","layouts/partials",".build-i18n"])await mkdir(path.join(directory,name),{recursive:true});
    for(const file of ["content/_content.en.gotmpl","layouts/partials/english-content.html","layouts/partials/public-route-map.html"]){
      await writeFile(path.join(directory,file),await readFile(new URL("../../"+file,import.meta.url)));
    }
    await writeFile(path.join(directory,"hugo.toml"),'baseURL="https://digest.ooblik.com/"\ndefaultContentLanguage="fr"\ndisableKinds=["RSS","sitemap","taxonomy","term"]\n[security]\nallowContent=["text/html","text/markdown"]\n[languages.fr]\nweight=1\n[languages.en]\nweight=2\n');
    await writeFile(path.join(directory,"content/page.md"),'---\ntitle: Bonjour\n---\nTexte français');
    await writeFile(path.join(directory,"layouts/single.html"),'<html lang="{{ site.Language.Lang }}"><h1>{{ .Title }}</h1><p>{{ .Params.translation_pending }}</p>{{ .Content }}</html>');
    await writeFile(path.join(directory,"layouts/home.html"),'Home');
    const body='<p>Bonjour <a href="/page/#detail">ici</a> <a href="https://example.com/">ailleurs</a></p><pre><code>x()</code></pre>';
    const fields={title:{source:"Titre changé",format:"text",hash:sourceHash("Titre changé","text")},body:{source:body,format:"html",hash:sourceHash(body,"html")}};
    await writeFile(path.join(directory,".build-i18n/manifest.json"),JSON.stringify({version:1,items:[{id:"page:/page",kind:"page",title:"Titre changé",date:"2026-09-01",route:"/page/",fields,page:{path:"/page",kind:"page",type:"page",layout:"",params:{},aliases:["/old-page/"]}}]}));
    await writeFile(path.join(directory,"data/translations_en.json"),JSON.stringify({version:1,entries:{"page:/page":{title:{hash:sourceHash("Ancien titre","text"),text:"Outdated title"},body:{hash:fields.body.hash,text:body.replace("Bonjour","Hello").replace("ici","here").replace("ailleurs","elsewhere")}}}}));
    const build=spawnSync("hugo",["--source",directory,"--panicOnWarning"],{encoding:"utf8"});
    assert.equal(build.status,0,build.stdout+build.stderr);
    const html=await readFile(path.join(directory,"public/en/page/index.html"),"utf8");
    assert.match(html,/<h1>Titre changé<\/h1>/);assert.doesNotMatch(html,/Outdated/);assert.match(html,/<p>true<\/p>/);
    assert.match(html,/Hello/);assert.match(html,/href="\/en\/page\/#detail"/);assert.match(html,/href="https:\/\/example.com\/"/);assert.match(html,/<code>x\(\)<\/code>/);
    const alias=await readFile(path.join(directory,"public/en/old-page/index.html"),"utf8");
    assert.match(alias,/https:\/\/digest.ooblik.com\/en\/page\//);
    assert.match(await readFile(path.join(directory,"public/page/index.html"),"utf8"),/Texte français/);
  } finally {await rm(directory,{recursive:true,force:true});}
});

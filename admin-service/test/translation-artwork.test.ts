import assert from "node:assert/strict";
import test from "node:test";
import { prepareTranslationArtwork } from "../src/translation-artwork.js";
import { renderEdition } from "../src/editions.js";
import { sourceHash, type TranslationSnapshot } from "../src/translation-types.js";

test("artwork follows current link counts, editorial family and missing files without retranslating", async () => {
  const date="2026-09-01", id="page:/archives/"+date;
  const entries: TranslationSnapshot["entries"] = {[id]:{title:{hash:sourceHash("Titre","text"),text:"Title"},description:{hash:sourceHash("Résumé","text"),text:"Summary"}}};
  const previous: TranslationSnapshot={version:1,revision:"old",entries,artwork:{[date]:{title:"Title",description:"Summary",linkCount:1,editorialType:"digest"}}};
  for (const scenario of ["unchanged","membership","family","missing image"] as const) {
    let renders=0;
    const result=await prepareTranslationArtwork(entries,{
      previous,
      links:[{added:date},...(scenario==="membership"?[{added:date}]:[]),{added:date,visibility:"hidden"}],
      readEdition:async()=>renderEdition({digestDate:date,title:"Titre",description:"Résumé",introduction:"",...(scenario==="family"?{editorialType:"focus" as const}:{})}),
      exists:path=>!(scenario==="missing image"&&path.endsWith("-linkedin.png")),
      render:async input=>{renders++;return Buffer.from(JSON.stringify(input));},
      renderLinkedIn:async input=>{renders++;return Buffer.from(JSON.stringify(input));},
    });
    assert.equal(renders,scenario==="unchanged"?0:2,scenario);
    assert.equal(result.artwork[date]?.linkCount,scenario==="membership"?2:1);
    assert.equal(result.artwork[date]?.editorialType,scenario==="family"?"focus":"digest");
    for (const file of Object.values(result.files)) {
      const rendered=JSON.parse(file.toString());
      assert.equal(rendered.title,"Title"); assert.equal(rendered.locale,"en-GB");
      assert.equal(rendered.linkCount,result.artwork[date]?.linkCount);
      assert.equal(rendered.editorialType,result.artwork[date]?.editorialType);
    }
  }
});

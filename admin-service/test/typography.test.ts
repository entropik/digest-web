import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Window } from "happy-dom";

const source = await readFile(new URL("../../static/js/typography.js", import.meta.url), "utf8");
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

test("display typography binds French punctuation without altering markup or literals", async () => {
  const window = new Window();
  try {
    window.document.body.innerHTML = `
      <p id="reported">La confusion avec les « OS agentiques » disparaît si l’on sépare les couches :</p>
      <p id="inline"><strong>Agent</strong> : utile ! Vraiment ? Oui ; fini . Suite , fin …</p>
      <p id="literal">Version 1.24.4, fichier .env, langage .NET, URL https://example.org/a?x=1:y.</p>
      <a href="https://example.org/a?x=1:y" title="Titre : brut">Lien : description</a>
      <p id="already">Bien\u00a0: «\u202fbien\u202f»\u202f!</p>
      <pre>Code : brut .</pre><code>Code : brut .</code>
      <textarea>Texte : brut .</textarea><input value="Texte : brut .">
      <select><option>Choix : brut .</option></select>
      <div contenteditable="true"><span>Édition : brute .</span></div>
      <div data-typography="off"><span>Copie : brute .</span></div>
      <script type="application/json">{"text": "JSON : brut ."}</script>`;
    const preserved = [...window.document.querySelectorAll("pre,code,textarea,input,select,[contenteditable],[data-typography],script")]
      .map((element) => element.outerHTML);
    window.eval(source);
    assert.equal(window.document.querySelector("#reported")?.textContent,
      "La confusion avec les «\u00a0OS agentiques\u00a0» disparaît si l’on sépare les couches\u00a0:");
    assert.equal(window.document.querySelector("#inline")?.innerHTML,
      "<strong>Agent</strong>&nbsp;: utile&nbsp;! Vraiment&nbsp;? Oui&nbsp;; fini. Suite, fin…");
    assert.equal(window.document.querySelector("#literal")?.textContent,
      "Version 1.24.4, fichier .env, langage .NET, URL https://example.org/a?x=1:y.");
    assert.equal(window.document.querySelector("a")?.getAttribute("href"), "https://example.org/a?x=1:y");
    assert.equal(window.document.querySelector("a")?.title, "Titre : brut");
    assert.equal(window.document.querySelector("#already")?.textContent, "Bien\u00a0: «\u202fbien\u202f»\u202f!");
    assert.deepEqual([...window.document.querySelectorAll("pre,code,textarea,input,select,[contenteditable],[data-typography],script")]
      .map((element) => element.outerHTML), preserved);
    const initial = window.document.body.innerHTML;
    await flush();
    assert.equal(window.document.body.innerHTML, initial, "normalization is idempotent");
  } finally {
    await window.happyDOM.close();
  }
});

test("new cards, dialogs and in-place text updates receive the same typography", async () => {
  const window = new Window();
  try {
    window.eval(source);
    const card = window.document.createElement("article");
    card.innerHTML = '<h2>Projet : titre</h2><p>Résumé : suite .</p><code>Code : inchangé .</code>';
    window.document.body.append(card);
    await flush();
    assert.equal(card.querySelector("h2")?.textContent, "Projet\u00a0: titre");
    assert.equal(card.querySelector("p")?.textContent, "Résumé\u00a0: suite.");
    const text = card.querySelector("p")!.firstChild!;
    text.textContent = "Nouveau : texte !";
    await flush();
    assert.equal(text.textContent, "Nouveau\u00a0: texte\u00a0!");
    assert.equal(card.querySelector("code")?.textContent, "Code : inchangé .");
  } finally {
    await window.happyDOM.close();
  }
});

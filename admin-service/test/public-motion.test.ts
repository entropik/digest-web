import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Window, type HTMLElement } from "happy-dom";

const aboutSource = await readFile(new URL("../../static/js/about-liquid.js", import.meta.url), "utf8");
const tagsSource = await readFile(new URL("../../assets/js/tag-explorer.js", import.meta.url), "utf8");

function harness({ width = 834, reduced = false } = {}) {
  const window = new Window({ width, height: 900 });
  const media = new window.EventTarget();
  Object.assign(media, { matches: !reduced });
  window.matchMedia = ((query: string) => query.includes("no-preference")
    ? Object.assign(media, { matches: !reduced && (!query.includes("min-width") || width >= 900) })
    : { matches: reduced }) as typeof window.matchMedia;
  Object.defineProperty(window.document, "fonts", { value: { ready: Promise.resolve() } });
  type Frame = ReturnType<Window["requestAnimationFrame"]>;
  const frames = new Map<Frame, FrameRequestCallback>();
  window.requestAnimationFrame = (callback) => {
    const frame = {} as Frame;
    frames.set(frame, callback);
    return frame;
  };
  window.cancelAnimationFrame = (id) => { frames.delete(id); };
  const tick = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(16));
  };
  window.document.body.innerHTML = `<article class="post-single">
    <div class="post-meta">Marc</div><div class="post-content"><p>Un texte vivant.</p></div>
  </article>`;
  return { window, media, frames, tick };
}

test("about text responds to hover in a narrow desktop window", async () => {
  const { window, tick } = harness();
  try {
    window.eval(aboutSource);
    await Promise.resolve();
    const content = window.document.querySelector(".post-content")!;
    content.dispatchEvent(new window.PointerEvent("pointerenter", { clientX: 10, clientY: 10 }));
    tick();
    const word = content.querySelector<HTMLElement>(".liquid-word");
    assert.ok(word, "hover must not be disabled below 900px on a mouse-driven desktop");
    assert.match(word.style.transform, /translate3d\(/);
    assert.ok(content.classList.contains("is-liquid-active"));
  } finally {
    await window.happyDOM.close();
  }
});

test("about follows motion preference changes without reloading or duplicating words", async () => {
  const { window, media, tick, frames } = harness({ width: 1280, reduced: true });
  try {
    window.eval(aboutSource);
    assert.equal(window.document.querySelector(".liquid-word"), null);
    assert.ok(window.document.querySelector<HTMLElement>(".about-liquid-cue")?.hidden,
      "do not invite hovering when motion is disabled");
    Object.assign(media, { matches: true });
    media.dispatchEvent(new window.Event("change"));
    await Promise.resolve();
    const content = window.document.querySelector(".post-content")!;
    const count = content.querySelectorAll(".liquid-word").length;
    assert.ok(count > 0, "enable hover when the preference changes");
    content.dispatchEvent(new window.PointerEvent("pointerenter", { clientX: 10, clientY: 10 }));
    tick();
    Object.assign(media, { matches: false });
    media.dispatchEvent(new window.Event("change"));
    assert.equal(frames.size, 0, "stop pending motion when reduced motion is requested");
    assert.equal(content.querySelector<HTMLElement>(".liquid-word")!.style.transform, "");
    Object.assign(media, { matches: true });
    media.dispatchEvent(new window.Event("change"));
    assert.equal(content.querySelectorAll(".liquid-word").length, count);
  } finally {
    await window.happyDOM.close();
  }
});

test("tags resume autonomous movement after each cached-page restoration", async () => {
  const { window, tick, frames } = harness();
  try {
    window.document.body.innerHTML = `<section data-tag-explorer>
      <input data-tag-search><div data-tag-alphabet></div><p data-tag-status></p>
      <div data-tag-scene><a class="tag-cloud-item" data-tag="design" data-count="3">Design</a></div>
    </section>`;
    window.HTMLElement.prototype.getBoundingClientRect = function () {
      return this.hasAttribute("data-tag-scene")
        ? new window.DOMRect(0, 0, 600, 400)
        : new window.DOMRect(0, 0, 80, 25);
    };
    window.eval(tagsSource);
    await Promise.resolve();
    tick();
    const tag = window.document.querySelector<HTMLElement>(".tag-cloud-item")!;
    for (let visit = 0; visit < 2; visit += 1) {
      window.dispatchEvent(Object.assign(new window.Event("pagehide"), { persisted: true }));
      assert.equal(frames.size, 0, "pause motion while the page is cached");
      window.dispatchEvent(Object.assign(new window.Event("pageshow"), { persisted: true }));
      const before = tag.style.transform;
      tick();
      assert.notEqual(tag.style.transform, before, "tags must move again on browser Back");
      assert.equal(frames.size, 1, "restoration must not create duplicate animation loops");
    }
  } finally {
    await window.happyDOM.close();
  }
});

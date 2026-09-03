// Run against a dedicated Hugo server: node scripts/check-public-motion.mjs URL [screenshots-directory]
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.argv[2];
assert.ok(base, "Provide the URL of the dedicated Hugo preview server");
const screenshots = process.argv[3];
if (screenshots) await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch();
const transforms = (page, selector) => page.locator(selector).evaluateAll(
  (elements) => elements.map((element) => getComputedStyle(element).transform),
);
const changed = async (page, selector, expected) => {
  const before = await transforms(page, selector);
  await page.waitForTimeout(350);
  assert.equal(JSON.stringify(before) !== JSON.stringify(await transforms(page, selector)), expected);
};
const overflow = async (page) => {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
};

try {
  for (const width of [1280, 834, 390, 320]) {
    const mobile = width < 500;
    const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: mobile,
      hasTouch: mobile, reducedMotion: "no-preference" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("a-propos/", base).href);
    await page.evaluate(() => document.fonts.ready);
    await overflow(page);
    assert.equal(await page.locator(".about-liquid-cue").isVisible(), !mobile);
    if (!mobile) {
      const words = ".liquid-word";
      assert.ok(await page.locator(words).count() > 0);
      await page.locator(".post-content p").first().hover();
      await changed(page, words, true);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForTimeout(100);
      assert.equal(await page.locator(".about-liquid-cue").isVisible(), false);
      assert.ok((await transforms(page, words)).every((value) => value === "none"));
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.mouse.move(0, 0);
      await page.locator(".post-content p").first().hover();
      await changed(page, words, true);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(700);
    }
    if (screenshots) await page.screenshot({ path: join(screenshots, `about-${width}.png`) });

    await page.goto(new URL("tags/", base).href);
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    const tags = ".tag-cloud-item:not([hidden])";
    await page.waitForFunction(() => document.querySelector(".tag-cloud-item:not([hidden])")?.style.transform);
    await changed(page, tags, true);
    for (let visit = 0; visit < 2; visit += 1) {
      // Drive the persisted lifecycle even when Chromium declines to cache a page.
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
      await changed(page, tags, false);
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
      await changed(page, tags, true);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(100);
    await changed(page, tags, false);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await changed(page, tags, true);
    await page.locator("[data-tag-search]").fill("design");
    await page.waitForTimeout(200);
    assert.ok(await page.locator(tags).count() > 0);
    await overflow(page);
    if (screenshots) await page.screenshot({ path: join(screenshots, `tags-${width}.png`) });
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: hover, autonomous tags, page restoration, reduced motion, search, overflow`);
    await page.close();
  }
} finally {
  await browser.close();
}

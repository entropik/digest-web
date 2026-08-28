import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssPath = new URL(
  "../../assets/css/extended/digest.css",
  import.meta.url,
);

test("public link layouts cannot force horizontal scrolling", async () => {
  const css = await readFile(cssPath, "utf8");

  assert.match(
    css,
    /html,\s*body\s*\{[^}]*max-width:\s*100%;[^}]*overflow-x:\s*clip;/s,
  );
  assert.match(css, /\.archive-link\s*\{[^}]*min-width:\s*0;/s);
  assert.match(css, /\.archive-link\s*>\s*div\s*\{[^}]*min-width:\s*0;/s);
  assert.match(
    css,
    /\.archive-edition a\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*260px;/s,
  );
  assert.match(
    css,
    /\.digest-filter-name\s*\{[^}]*overflow-wrap:\s*normal;[^}]*word-break:\s*normal;[^}]*hyphens:\s*none;/s,
  );
  assert.match(
    css,
    /\.digest-calendar-day\.is-today\s*\{[^}]*background:\s*var\(--digest-accent\);[^}]*font-weight:\s*700;/s,
  );
  assert.match(
    css,
    /\.digest-calendar \.digest-calendar-day\s*\{[^}]*border-radius:\s*0;/s,
  );
  assert.doesNotMatch(css, /\.digest-hero\s*\{[^}]*border-bottom:/s);
  assert.match(
    css,
    /\.digest-query-tools\s*\{[^}]*gap:\s*0;[^}]*border:\s*1px solid var\(--digest-line\);[^}]*border-bottom:\s*2px solid var\(--digest-ink\);/s,
  );
  assert.match(
    css,
    /\.digest-date\s*\{[^}]*border-left:\s*1px solid var\(--digest-line\);/s,
  );
  assert.match(
    css,
    /@media \(max-width:\s*520px\)[\s\S]*?\.digest-date\s*\{[^}]*border-top:\s*1px solid var\(--digest-line\);[^}]*border-left:\s*0;/,
  );
  assert.match(
    css,
    /\.archive-link \.link-title\s*>\s*span\s*\{[^}]*overflow-wrap:\s*anywhere;/s,
  );
  assert.match(
    css,
    /@media \(max-width:\s*520px\)[\s\S]*?\.archive-url\s*\{[^}]*white-space:\s*normal;/,
  );
  assert.match(
    css,
    /\.archive-tags span,\s*\.archive-tags a\s*\{[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s,
  );
  assert.match(
    css,
    /\.tag-archive-header h1\s*\{[^}]*overflow-wrap:\s*anywhere;/s,
  );
});

test("Journal components keep one canonical rule plus intentional responsive overrides", async () => {
  const css = await readFile(cssPath, "utf8");
  const occurrences = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return css.match(new RegExp(`^\\s*${escaped}\\s*\\{`, "gm"))?.length ?? 0;
  };

  assert.equal(occurrences(".journal-grid"), 2);
  assert.equal(occurrences(".journal-header .archive-single-count"), 2);
  assert.equal(occurrences(".journal-chronology"), 2);
  assert.equal(occurrences(".journal-month"), 1);
  assert.equal(occurrences(".journal-month-header"), 2);
  assert.equal(occurrences(".journal-card"), 1);
  assert.equal(occurrences(".journal-card a"), 3);
  assert.equal(occurrences(".journal-post"), 1);
  assert.equal(occurrences(".journal-post-header"), 1);
  assert.equal(occurrences(".journal-post-visual figcaption"), 2);
  assert.equal(occurrences(".journal-post-content"), 1);
  assert.equal(occurrences(".journal-post-folio"), 1);
});

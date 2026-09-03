import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("Hugo renders one DIGEST prefix for current and historical archive titles", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "digest-archive-title-"));
  try {
    const partial = await readFile(new URL("../../layouts/partials/archive-title.html", import.meta.url), "utf8");
    await mkdir(path.join(directory, "layouts", "partials"), { recursive: true });
    await writeFile(path.join(directory, "hugo.toml"), 'baseURL = "https://example.org/"\ndisableKinds = ["taxonomy", "term", "RSS", "sitemap"]\n');
    await writeFile(path.join(directory, "layouts", "partials", "archive-title.html"), partial);
    const titles = ["28 août 2026", "DIGEST - 28 août 2026", "Digest - 28 août 2026", "Digest — 28 août 2026", "Images & <script>alert(1)</script>"];
    await writeFile(path.join(directory, "layouts", "home.html"), titles.map(title => `<h1>{{ partial "archive-title.html" ${JSON.stringify(title)} }}</h1>`).join("\n"));
    const build = spawnSync("hugo", ["--source", directory, "--panicOnWarning"], { encoding: "utf8" });
    assert.equal(build.status, 0, `${build.error ?? ""}\n${build.stdout}\n${build.stderr}`);
    const html = await readFile(path.join(directory, "public", "index.html"), "utf8");
    const headings = [...html.matchAll(/<h1>(.*?)<\/h1>/g)].map(match => match[1]);
    assert.equal(headings.length, titles.length);
    for (const heading of headings.slice(0, 4)) {
      assert.equal(heading, '<span class="archive-title-prefix">DIGEST - </span>28 août 2026');
    }
    assert.equal(headings[4], '<span class="archive-title-prefix">DIGEST - </span>Images &amp; &lt;script&gt;alert(1)&lt;/script&gt;');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

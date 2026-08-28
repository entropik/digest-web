import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stylesheetUrl = new URL(
  "../../assets/css/extended/digest.css",
  import.meta.url,
);
const scriptUrl = new URL("../../assets/js/digest.js", import.meta.url);

const luminance = (hex: string): number => {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  const [red = 0, green = 0, blue = 0] = channels;
  return (
    0.2126 * red +
    0.7152 * green +
    0.0722 * blue
  );
};

const contrast = (foreground: string, background: string): number => {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
};

const variable = (block: string, name: string): string => {
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(match, `Missing --${name}`);
  return match[1]!;
};

test("normal public text colors meet WCAG AA in light and dark themes", async () => {
  const css = await readFile(stylesheetUrl, "utf8");
  const light = css.match(/:root\s*\{([^}]+)\}/s)?.[1] ?? "";
  const dark = css.match(/\[data-theme="dark"\],[\s\S]*?\.dark\s*\{([^}]+)\}/)?.[1] ?? "";

  for (const palette of [light, dark]) {
    for (const foreground of [
      variable(palette, "digest-muted"),
      variable(palette, "digest-accent-text"),
    ]) {
      for (const background of [
        variable(palette, "digest-paper"),
        variable(palette, "digest-page-bg"),
      ]) {
        assert.ok(
          contrast(foreground, background) >= 4.5,
          `${foreground} on ${background} must reach 4.5:1`,
        );
      }
    }
  }

  assert.doesNotMatch(
    css,
    /(?:^|[;{])\s*color:\s*var\(--digest-accent\)/m,
  );
});

test("pagination honors the user's reduced-motion preference", async () => {
  const script = await readFile(scriptUrl, "utf8");

  assert.match(
    script,
    /matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/,
  );
  assert.match(script, /\? "auto"\s*:\s*"smooth"/);
  assert.match(script, /window\.scrollTo\(\{ top, behavior \}\)/);
});

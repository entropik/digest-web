import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

export type SocialImageFamily = "collision" | "screens" | "broken-grid";

export type SocialImageInput = {
  digestDate: string;
  title: string;
  description: string;
  linkCount: number;
};

const WIDTH = 1200;
const HEIGHT = 627;
export const MAX_SOCIAL_IMAGE_BYTES = 500_000;
const RED = "#E10600";
const BLACK = "#0A0A0A";
const PAPER = "#F4F2ED";
const ACCENTS = ["#00AEEF", "#FFD500", "#EC008C", "#1646D8"] as const;

type Atmosphere = {
  accidents: string;
  noise: string;
  waves: string;
};

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const seedFrom = (value: string): number =>
  createHash("sha256").update(value).digest().readUInt32BE(0);

const mulberry32 = (seed: number) => () => {
  let value = (seed += 0x6d2b79f5);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
};

const choose = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)]!;

const integer = (min: number, max: number, random: () => number): number =>
  Math.floor(random() * (max - min + 1)) + min;

const formattedDate = (digestDate: string): string => {
  const [year, month, day] = digestDate.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(date)
    .toLocaleUpperCase("fr-FR");
};

const wrap = (value: string, limit: number, maxLines: number): string[] => {
  const words = value.trim().toLocaleUpperCase("fr-FR").split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= limit || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/[.,;:]?$/, "")}…`;
  }
  return lines;
};

const textLines = (
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  attributes: string,
): string =>
  lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" ${attributes}>${escapeXml(line)}</text>`,
    )
    .join("");

const noiseOverlay = (random: () => number): string => {
  const specks = Array.from({ length: 180 }, () => {
    const x = integer(0, WIDTH, random);
    const y = integer(0, HEIGHT, random);
    const radius = integer(1, 4, random);
    const opacity = (0.04 + random() * 0.12).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${random() > 0.35 ? BLACK : PAPER}" opacity="${opacity}"/>`;
  }).join("");
  return `<g aria-hidden="true">${specks}</g>`;
};

const wavePath = (y: number, amplitude: number, period: number): string => {
  let path = `M-${period} ${y}`;
  for (let x = -period; x <= WIDTH + period; x += period) {
    path += ` Q${x + period / 4} ${y - amplitude} ${x + period / 2} ${y}`;
    path += ` Q${x + (period * 3) / 4} ${y + amplitude} ${x + period} ${y}`;
  }
  return path;
};

const waveOverlay = (accent: string, random: () => number): string => {
  const y = integer(110, 540, random);
  const amplitude = integer(18, 70, random);
  const period = integer(130, 280, random);
  const rotation = integer(-8, 8, random);
  return `<g aria-hidden="true" transform="rotate(${rotation} 600 313)">
    <path d="${wavePath(y, amplitude, period)}" fill="none" stroke="${PAPER}" stroke-width="${integer(18, 44, random)}" opacity=".82"/>
    <path d="${wavePath(y + integer(28, 58, random), amplitude, period)}" fill="none" stroke="${accent}" stroke-width="${integer(8, 24, random)}" opacity=".94"/>
  </g>`;
};

const textureForColor = (color: string, accent: string): string => {
  if (color === BLACK) return "url(#texture-black)";
  if (color === RED) return "url(#texture-red)";
  if (color === accent) return "url(#texture-accent)";
  return "url(#texture-primary)";
};

const accidentOverlay = (accent: string, random: () => number): string => {
  const colors = [BLACK, RED, accent] as const;
  const count = integer(1, 2, random);
  const accidents = Array.from({ length: count }, (_, index) => {
    const x = integer(-360, 980, random);
    const y = integer(-320, 500, random);
    const width = integer(480, 1100, random);
    const height = integer(320, 820, random);
    const rotation = integer(-24, 24, random);
    const color = choose(colors, random);
    const opacity = (0.58 + random() * 0.28).toFixed(2);
    const transform = `rotate(${rotation} ${x + width / 2} ${y + height / 2})`;
    const mode = integer(0, 4, random);

    if (mode === 0) {
      return `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" fill="url(#dots)" transform="${transform}" opacity="${opacity}"/>`;
    }
    if (mode === 1) {
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#lines)" transform="${transform}" opacity="${opacity}"/>`;
    }
    if (mode === 2) {
      const strokeWidth = integer(28, 96, random);
      return `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${Math.max(80, width / 2 - strokeWidth)}" ry="${Math.max(60, height / 2 - strokeWidth)}" fill="none" stroke="${textureForColor(color, accent)}" stroke-width="${strokeWidth}" transform="${transform}" opacity="${opacity}"/>`;
    }
    if (mode === 3) {
      const gap = integer(16, 44, random);
      const bars = Array.from({ length: integer(3, 6, random) }, (_, barIndex) =>
        `<rect x="${x + barIndex * gap}" y="${y}" width="${integer(12, 44, random)}" height="${height}" fill="${textureForColor(barIndex % 2 ? color : BLACK, accent)}"/>`,
      ).join("");
      return `<g transform="${transform}" opacity="${opacity}">${bars}</g>`;
    }
    return `<path d="M${x} ${y + height}L${x + width * 0.22} ${y}H${x + width * 0.58}L${x + width} ${y + height * 0.72}V${y + height}Z" fill="${textureForColor(color, accent)}" transform="${transform}" opacity="${opacity}"/>`;
  }).join("");

  return `<g aria-hidden="true" data-layer="accidents">${accidents}</g>`;
};

const inkTexture = (id: string, base: string, speck: string): string => `
    <pattern id="${id}" width="43" height="37" patternUnits="userSpaceOnUse">
      <rect width="43" height="37" fill="${base}"/>
      <g fill="${speck}" opacity=".3">
        <circle cx="3" cy="6" r="1.4"/><circle cx="17" cy="3" r=".8"/>
        <circle cx="31" cy="9" r="1.8"/><circle cx="10" cy="20" r="1"/>
        <circle cx="25" cy="27" r="1.3"/><circle cx="40" cy="22" r=".7"/>
        <circle cx="5" cy="34" r=".9"/><circle cx="37" cy="35" r="1.5"/>
      </g>
      <path d="M0 14L43 10M0 31L43 27" stroke="${speck}" stroke-width=".7" opacity=".14"/>
    </pattern>`;

const definitions = (
  accent: string,
  primaryInk: string,
  dotRadius: number,
  lineGap: number,
  background: readonly [string, string, string],
  gradientAngle: number,
): string => `
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${gradientAngle} .5 .5)">
      <stop offset="0" stop-color="${background[0]}"/>
      <stop offset=".56" stop-color="${background[1]}"/>
      <stop offset="1" stop-color="${background[2]}"/>
    </linearGradient>
    <pattern id="dots" width="${dotRadius * 3}" height="${dotRadius * 3}" patternUnits="userSpaceOnUse">
      <circle cx="${dotRadius}" cy="${dotRadius}" r="${dotRadius}" fill="${BLACK}"/>
    </pattern>
    <pattern id="lines" width="${lineGap}" height="${lineGap}" patternUnits="userSpaceOnUse">
      <path d="M0 1H${lineGap}" stroke="${BLACK}" stroke-width="2"/>
    </pattern>
    <pattern id="accent-lines" width="${lineGap}" height="${lineGap}" patternUnits="userSpaceOnUse">
      <path d="M0 1H${lineGap}" stroke="${accent}" stroke-width="3"/>
    </pattern>
    ${inkTexture("texture-red", RED, BLACK)}
    ${inkTexture("texture-black", BLACK, PAPER)}
    ${inkTexture("texture-accent", accent, BLACK)}
    ${inkTexture("texture-primary", primaryInk, primaryInk === BLACK ? PAPER : BLACK)}
    <clipPath id="canvas"><rect width="${WIDTH}" height="${HEIGHT}"/></clipPath>
  </defs>`;

const commonMetadata = (
  input: SocialImageInput,
  options: {
    fill: string;
    brandFill?: string;
    topicX?: number;
    topicY?: number;
    topicLimit?: number;
    dateX?: number;
    dateY?: number;
    countX?: number;
    countY?: number;
  },
): string => {
  const lines = wrap(
    input.description || input.title,
    options.topicLimit ?? 38,
    3,
  );
  const topicX = options.topicX ?? 48;
  const topicY = options.topicY ?? 486;
  const dateX = options.dateX ?? topicX;
  const dateY = options.dateY ?? 593;
  const countX = options.countX ?? 1150;
  const countY = options.countY ?? dateY;
  return `
    <text x="48" y="42" class="label" fill="${options.brandFill ?? options.fill}">OOBLIK DIGEST</text>
    ${textLines(lines, topicX, topicY, 31, `class="topic" fill="${options.fill}"`)}
    <text x="${dateX}" y="${dateY}" class="label" fill="${options.fill}">${escapeXml(formattedDate(input.digestDate))}</text>
    <text x="${countX}" y="${countY}" text-anchor="end" class="label" fill="${options.fill}">${input.linkCount} LIENS</text>`;
};

const collision = (
  input: SocialImageInput,
  primaryInk: string,
  random: () => number,
  atmosphere: Atmosphere,
): string => {
  const rotation = integer(-8, 8, random);
  const day = input.digestDate.slice(-2).replace(/^0/, "");
  const digestFill = ["#00AEEF", "#FFD500"].includes(primaryInk)
    ? BLACK
    : PAPER;
  return `
    <rect width="1200" height="627" fill="url(#background)"/>
    ${atmosphere.waves}
    ${atmosphere.accidents}
    ${atmosphere.noise}
    <rect x="340" y="-40" width="210" height="300" fill="url(#texture-black)"/>
    <circle cx="930" cy="70" r="225" fill="none" stroke="url(#texture-primary)" stroke-width="170"/>
    <rect x="0" y="458" width="1200" height="169" fill="${BLACK}"/>
    <text x="-34" y="332" class="giant" fill="${RED}" transform="rotate(${rotation} 200 250)">${day}</text>
    <text x="105" y="355" class="display" fill="${BLACK}">OOBLIK</text>
    <text x="575" y="355" class="display" fill="${digestFill}">DIGEST</text>
    <g transform="translate(1090 70) rotate(90)">
      <text x="0" y="0" class="repeat" fill="${PAPER}">${day} ${day} ${day} ${day}</text>
    </g>
    ${commonMetadata(input, { fill: PAPER })}`;
};

const screens = (
  input: SocialImageInput,
  accent: string,
  primaryInk: string,
  random: () => number,
  atmosphere: Atmosphere,
): string => {
  const arcX = integer(650, 850, random);
  const titleX = integer(-40, 50, random);
  const titleY = integer(350, 430, random);
  const dotsX = integer(340, 560, random);
  const accentX = integer(880, 1020, random);
  const tilt = integer(-3, 3, random);
  const patternAtTop = random() > 0.5;
  return `
    <rect width="1200" height="627" fill="url(#background)"/>
    ${atmosphere.waves}
    ${atmosphere.accidents}
    ${atmosphere.noise}
    <text x="${Math.max(14, titleX)}" y="174" class="display" fill="${BLACK}">OOBLIK</text>
    <text x="${titleX}" y="${titleY}" class="mega" fill="${RED}" transform="rotate(${tilt} 360 330)">DIGEST</text>
    ${patternAtTop ? `<rect x="${dotsX}" y="0" width="320" height="300" fill="url(#dots)"/>` : ""}
    <rect x="${accentX}" y="${integer(140, 250, random)}" width="230" height="214" fill="url(#texture-accent)"/>
    <circle cx="${arcX}" cy="650" r="315" fill="url(#texture-primary)"/>
    ${patternAtTop ? "" : `<circle cx="${arcX}" cy="650" r="210" fill="url(#dots)"/>`}
    <rect x="0" y="405" width="412" height="222" fill="${BLACK}"/>
    <rect x="150" y="438" width="280" height="18" fill="url(#accent-lines)"/>
    ${commonMetadata(input, {
      fill: PAPER,
      brandFill: BLACK,
      topicX: 32,
      topicY: 472,
      topicLimit: 29,
      dateX: 32,
      dateY: 594,
      countX: 380,
      countY: 594,
    })}`;
};

const brokenGrid = (
  input: SocialImageInput,
  accent: string,
  primaryInk: string,
  random: () => number,
  atmosphere: Atmosphere,
): string => {
  const offset = integer(-45, 65, random);
  const titleX = integer(-95, 35, random);
  const titleY = integer(330, 475, random);
  const tilt = integer(-4, 4, random);
  const dotsX = integer(650, 930, random);
  const linesX = integer(900, 1080, random);
  const verticals = [270, 650, 1010]
    .map((x, index) => `<path d="M${x + (index === 2 ? offset : 0)} -20V650"/>`)
    .join("");
  const horizontals = [145, 410]
    .map((y, index) => `<path d="M-30 ${y + (index === 1 ? offset : 0)}H1230"/>`)
    .join("");
  return `
    <rect width="1200" height="627" fill="url(#background)"/>
    ${atmosphere.waves}
    ${atmosphere.accidents}
    ${atmosphere.noise}
    <g fill="none" stroke="${BLACK}" stroke-width="5">${verticals}${horizontals}</g>
    <rect x="0" y="365" width="400" height="262" fill="${BLACK}"/>
    ${random() > 0.5
      ? `<rect x="${dotsX}" y="0" width="260" height="300" fill="url(#dots)"/>`
      : `<rect x="${linesX - 110}" y="0" width="300" height="340" fill="url(#accent-lines)"/>`}
    <text x="${titleX}" y="${titleY}" class="mega" fill="${RED}" transform="rotate(${tilt} 520 330)">DIGEST</text>
    <text x="12" y="105" class="display-small" fill="${BLACK}">OOBLIK</text>
    <circle cx="1020" cy="610" r="210" fill="url(#texture-primary)"/>
    <rect x="290" y="390" width="205" height="22" fill="url(#texture-accent)"/>
    ${commonMetadata(input, {
      fill: PAPER,
      brandFill: BLACK,
      topicX: 22,
      topicY: 478,
      topicLimit: 29,
      dateX: 22,
      dateY: 594,
      countX: 370,
      countY: 594,
    })}`;
};

export const socialImageSvg = (
  input: SocialImageInput,
): { svg: string; family: SocialImageFamily; accent: string } => {
  const seed = seedFrom(`${input.digestDate}:${input.title}:${input.description}`);
  const random = mulberry32(seed);
  const family = choose<SocialImageFamily>(
    ["collision", "screens", "broken-grid"],
    random,
  );
  const accent = choose(ACCENTS, random);
  const primaryInk = choose([RED, accent, accent, accent], random);
  const backgrounds = [
    [accent, accent, BLACK],
    [BLACK, accent, BLACK],
    [accent, BLACK, accent],
    [accent, RED, BLACK],
    [BLACK, accent, RED],
    [RED, BLACK, accent],
    [RED, accent, BLACK],
    [BLACK, accent, accent],
  ] as const;
  const background = choose(backgrounds, random);
  const atmosphere = {
    accidents: accidentOverlay(accent, random),
    noise: noiseOverlay(random),
    waves: random() > 0.65 ? waveOverlay(accent, random) : "",
  };
  const content =
    family === "collision"
      ? collision(input, primaryInk, random, atmosphere)
      : family === "screens"
        ? screens(input, accent, primaryInk, random, atmosphere)
        : brokenGrid(input, accent, primaryInk, random, atmosphere);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    ${definitions(
      accent,
      primaryInk,
      integer(2, 5, random),
      integer(8, 16, random),
      background,
      integer(-55, 55, random),
    )}
    <style>
      text { font-family: "Bricolage Grotesque"; font-kerning: normal; }
      .display { font-size: 116px; font-weight: 800; letter-spacing: -4px; }
      .display-small { font-size: 92px; font-weight: 800; letter-spacing: -3px; }
      .mega { font-size: 238px; font-weight: 800; letter-spacing: -10px; }
      .giant { font-size: 470px; font-weight: 800; letter-spacing: -18px; }
      .repeat { font-size: 112px; font-weight: 800; letter-spacing: -4px; }
      .topic { font-size: 25px; font-weight: 750; letter-spacing: -.5px; }
      .label { font-size: 22px; font-weight: 750; letter-spacing: .5px; }
    </style>
    <g clip-path="url(#canvas)">${content}</g>
  </svg>`;
  return { svg, family, accent };
};

export const generateSocialImage = (input: SocialImageInput): Buffer => {
  const { svg } = socialImageSvg(input);
  const fontPath = resolve(
    process.cwd(),
    "../static/fonts/bricolage-grotesque-variable.ttf",
  );
  return Buffer.from(
    new Resvg(svg, {
      fitTo: { mode: "width", value: WIDTH },
      font: {
        fontFiles: [fontPath],
        loadSystemFonts: false,
        defaultFontFamily: "Bricolage Grotesque",
      },
    })
      .render()
      .asPng(),
  );
};

export const optimizeSocialImage = async (image: Buffer): Promise<Buffer> => {
  const optimized = await sharp(image)
    .png({
      palette: true,
      colours: 256,
      compressionLevel: 9,
      effort: 10,
      dither: 0.6,
    })
    .toBuffer();
  if (optimized.length > MAX_SOCIAL_IMAGE_BYTES) {
    throw new Error(
      `Optimized social image exceeds ${MAX_SOCIAL_IMAGE_BYTES} bytes`,
    );
  }
  return optimized;
};

export const generateOptimizedSocialImage = async (
  input: SocialImageInput,
): Promise<Buffer> => optimizeSocialImage(generateSocialImage(input));

import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import {
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { chromium, type Page, type Route } from "playwright";
import sharp from "sharp";
import type { DigestLink } from "./catalog.js";
import { canonicalizePublicUrl, isPrivateHost } from "./urls.js";

const WIDTH = 1200;
const HEIGHT = 627;
const CAPTURE_WIDTH = 1440;
const CAPTURE_HEIGHT = 752;
const CORAL = "#FF5C35";
const BLACK = "#0A0A0A";
const PAPER = "#F4F2ED";
const FILE_PATTERN = /^[0-9a-f-]{36}-[0-9a-f]{16}\.png$/;

const renderBrandSvg = (svg: string): Buffer => {
  const fontDirectory = resolve(process.cwd(), "../static/fonts");
  return Buffer.from(
    new Resvg(svg, {
      fitTo: { mode: "width", value: WIDTH },
      font: {
        fontFiles: [
          join(fontDirectory, "bricolage-grotesque-variable.ttf"),
        ],
        loadSystemFonts: false,
        defaultFontFamily: "Bricolage Grotesque",
      },
    }).render().asPng(),
  );
};

export type LinkSocialImageSource = "screenshot" | "fallback";

export type LinkSocialImageResult = {
  imageUrl: string;
  source: LinkSocialImageSource;
  generatedAt: string;
};

type Screenshotter = (url: string) => Promise<Buffer>;

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const wrapTitle = (value: string, limit = 42, maxLines = 2): string[] => {
  const words = value.trim().split(/\s+/);
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

const titleText = (title: string): string =>
  wrapTitle(title)
    .map(
      (line, index) =>
        `<text x="48" y="${518 + index * 44}" fill="${PAPER}" font-family="Bricolage Grotesque" font-size="38" font-weight="800">${escapeXml(line)}</text>`,
    )
    .join("");

const editorialOverlay = (title: string, host: string): Buffer =>
  renderBrandSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="${WIDTH}" height="14" fill="${CORAL}"/>
    <rect x="0" y="438" width="${WIDTH}" height="189" fill="${BLACK}" fill-opacity=".92"/>
    <rect x="956" y="14" width="244" height="86" fill="${CORAL}"/>
    <text x="1168" y="68" text-anchor="end" fill="${BLACK}" font-family="Bricolage Grotesque" font-size="22" font-weight="800">OOBLIK DIGEST</text>
    ${titleText(title)}
    <text x="48" y="604" fill="${CORAL}" font-family="Bricolage Grotesque" font-size="18" font-weight="700">${escapeXml(host.toLocaleUpperCase("fr-FR"))}</text>
  </svg>`);

const fallbackImage = async (title: string, host: string): Promise<Buffer> => {
  const lines = wrapTitle(title, 28, 3);
  const text = lines
    .map(
      (line, index) =>
        `<text x="54" y="${238 + index * 72}" fill="${PAPER}" font-family="Bricolage Grotesque" font-size="62" font-weight="800">${escapeXml(line.toLocaleUpperCase("fr-FR"))}</text>`,
    )
    .join("");
  const svg = renderBrandSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${BLACK}"/>
    <circle cx="1030" cy="130" r="210" fill="none" stroke="${CORAL}" stroke-width="72"/>
    <rect x="780" y="414" width="420" height="213" fill="${CORAL}"/>
    <text x="54" y="64" fill="${CORAL}" font-family="Bricolage Grotesque" font-size="22" font-weight="700">OOBLIK DIGEST / LIEN</text>
    ${text}
    <rect x="54" y="566" width="650" height="2" fill="${PAPER}"/>
    <text x="54" y="606" fill="${PAPER}" font-family="Bricolage Grotesque" font-size="18" font-weight="700">${escapeXml(host.toLocaleUpperCase("fr-FR"))}</text>
  </svg>`);
  return sharp(svg).png({ palette: true, colours: 64, compressionLevel: 9 }).toBuffer();
};

const assertPublicDestination = async (rawUrl: string): Promise<URL> => {
  const url = new URL(canonicalizePublicUrl(rawUrl));
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateHost(address))) {
    throw new Error("UNSAFE_SCREENSHOT_DESTINATION");
  }
  return url;
};

const routeSafely = (
  approvedHosts: Map<string, Promise<void>>,
  route: Route,
): Promise<void> => {
  const request = route.request();
  const rawUrl = request.url();
  if (/^(?:data|blob|about):/.test(rawUrl)) return route.continue();
  if (!["http:", "https:"].includes(new URL(rawUrl).protocol)) return route.abort();
  if (["media", "websocket", "eventsource"].includes(request.resourceType())) {
    return route.abort();
  }
  const host = new URL(rawUrl).hostname.toLowerCase();
  let approval = approvedHosts.get(host);
  if (!approval) {
    approval = assertPublicDestination(rawUrl).then(() => undefined);
    approvedHosts.set(host, approval);
  }
  return approval.then(() => route.continue(), () => route.abort());
};

const preparePage = async (page: Page, url: string): Promise<void> => {
  const approvedHosts = new Map<string, Promise<void>>();
  await page.route("**/*", (route) => routeSafely(approvedHosts, route));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}",
  }).catch(() => undefined);
  await page.waitForTimeout(2_000);
};

export const capturePublicPage = async (
  rawUrl: string,
  executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim(),
): Promise<Buffer> => {
  const url = await assertPublicDestination(rawUrl);
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    const context = await browser.newContext({
      viewport: { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
      deviceScaleFactor: 1,
      colorScheme: "light",
      locale: "fr-FR",
      reducedMotion: "reduce",
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36 OOBLIK-Digest-Capture/1.0",
    });
    const page = await context.newPage();
    await preparePage(page, url.toString());
    return await page.screenshot({
      type: "png",
      fullPage: false,
      animations: "disabled",
    });
  } finally {
    await browser.close();
  }
};

const stylizeScreenshot = async (
  screenshot: Buffer,
  title: string,
  host: string,
): Promise<Buffer> =>
  sharp(screenshot)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "north" })
    .grayscale()
    .normalize()
    .linear(1.06, -6)
    .composite([{ input: editorialOverlay(title, host) }])
    .png({ palette: true, colours: 256, compressionLevel: 9, effort: 10 })
    .toBuffer();

const imageName = (link: Pick<DigestLink, "id" | "url">): string => {
  const hash = createHash("sha256").update(link.url).digest("hex").slice(0, 16);
  return `${link.id}-${hash}.png`;
};

export class LinkSocialImageService {
  private readonly pending = new Map<string, Promise<LinkSocialImageResult>>();

  constructor(
    private readonly directory: string,
    private readonly screenshotter: Screenshotter = capturePublicPage,
  ) {}

  async imageFor(
    link: Pick<DigestLink, "id" | "title" | "url">,
    refresh = false,
  ): Promise<LinkSocialImageResult> {
    const name = imageName(link);
    const path = join(this.directory, name);
    const metadataPath = `${path}.json`;
    if (!refresh) {
      try {
        const [info, metadata] = await Promise.all([
          stat(path),
          readFile(metadataPath, "utf8"),
        ]);
        const parsed = JSON.parse(metadata) as { source?: LinkSocialImageSource };
        return {
          imageUrl: `/api/linkedin-images/${name}?v=${Math.trunc(info.mtimeMs)}`,
          source: parsed.source === "fallback" ? "fallback" : "screenshot",
          generatedAt: info.mtime.toISOString(),
        };
      } catch {
        // Une capture absente ou incomplète est régénérée.
      }
    }
    const existing = this.pending.get(name);
    if (existing) return existing;
    const generation = this.generate(link, name, path, metadataPath);
    this.pending.set(name, generation);
    try {
      return await generation;
    } finally {
      this.pending.delete(name);
    }
  }

  async read(name: string): Promise<Buffer | null> {
    if (!FILE_PATTERN.test(name)) return null;
    try {
      return await readFile(join(this.directory, name));
    } catch {
      return null;
    }
  }

  private async generate(
    link: Pick<DigestLink, "id" | "title" | "url">,
    name: string,
    path: string,
    metadataPath: string,
  ): Promise<LinkSocialImageResult> {
    await mkdir(this.directory, { recursive: true });
    const publicUrl = new URL(canonicalizePublicUrl(link.url));
    let source: LinkSocialImageSource = "screenshot";
    let image: Buffer;
    try {
      const screenshot = await this.screenshotter(publicUrl.toString());
      image = await stylizeScreenshot(screenshot, link.title, publicUrl.hostname);
    } catch (error) {
      source = "fallback";
      console.warn("LinkedIn link screenshot unavailable; using branded fallback", {
        error: error instanceof Error ? error.message : "UNKNOWN",
      });
      image = await fallbackImage(link.title, publicUrl.hostname);
    }
    const temporaryPath = `${path}.${process.pid}.tmp`;
    await writeFile(temporaryPath, image, { mode: 0o640 });
    await rename(temporaryPath, path);
    await writeFile(metadataPath, JSON.stringify({ source }), { mode: 0o640 });
    const info = await stat(path);
    return {
      imageUrl: `/api/linkedin-images/${name}?v=${Math.trunc(info.mtimeMs)}`,
      source,
      generatedAt: info.mtime.toISOString(),
    };
  }
}

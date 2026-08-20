import { XMLParser } from "fast-xml-parser";
import { parse as parseHtml } from "node-html-parser";
import sharp from "sharp";

import type { DigestLink } from "./catalog.js";
import { sortCatalog, stableLinkId } from "./publication.js";
import { canonicalizePublicUrl, UnsafeUrlError } from "./urls.js";

export const BLOG_ARCHIVE_CATEGORY = "Archives du blog OOBLIK";
export const BLOG_ARCHIVE_STREAM = "blog-ooblik";
const MAX_DESCRIPTION_LENGTH = 300;

type XmlNode = Record<string, unknown>;

export type WordpressOverride = {
  source_url?: string;
  image_url?: string;
  skip?: boolean;
};

export type WordpressProbe = {
  url?: string;
  status?: number;
  final_url?: string;
  cross_host_redirect?: boolean;
  definitive_dead?: boolean;
  error?: string;
};

export type WordpressPostCandidate = {
  wordpressId: string;
  slug: string;
  title: string;
  originUrl: string;
  added: string;
  description: string;
  tags: string[];
  sourceUrls: string[];
  imageUrl: string;
  imageAlt: string;
};

export type WordpressReviewItem = {
  wordpress_id: string;
  title: string;
  origin_url: string;
  reason: string;
  candidates?: string[];
};

export type WordpressReadyItem = {
  wordpress_id: string;
  image_url: string;
  image_alt: string;
  existing: boolean;
  link: DigestLink;
};

export type WordpressImportPreview = {
  ready: WordpressReadyItem[];
  review: WordpressReviewItem[];
  duplicates: WordpressReviewItem[];
  skipped: WordpressReviewItem[];
  catalog: DigestLink[];
};

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const asNode = (value: unknown): XmlNode | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as XmlNode)
    : null;

const nodeText = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  const node = asNode(value);
  return node ? nodeText(node["#text"] ?? "") : "";
};

const normalizeSpace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const plainText = (value: string): string =>
  normalizeSpace(parseHtml(value).textContent);

const truncate = (value: string, length = MAX_DESCRIPTION_LENGTH): string => {
  if (value.length <= length) return value;
  const clipped = value.slice(0, length - 1).replace(/\s+\S*$/, "").trimEnd();
  return `${clipped || value.slice(0, length - 1)}…`;
};

const unique = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase("fr");
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const normalizedHost = (value: string): string => {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

const postMeta = (item: XmlNode): Map<string, string> => {
  const values = new Map<string, string>();
  for (const rawMeta of asArray(item["wp:postmeta"])) {
    const meta = asNode(rawMeta);
    if (!meta) continue;
    const key = nodeText(meta["wp:meta_key"]).trim();
    if (key) values.set(key, nodeText(meta["wp:meta_value"]).trim());
  }
  return values;
};

const sourceLinks = (html: string, blogHost: string): string[] => {
  const root = parseHtml(html);
  const candidates: string[] = [];
  for (const anchor of root.querySelectorAll("a")) {
    let contextNode = anchor.parentNode;
    while (
      contextNode?.parentNode &&
      !["P", "DIV", "LI", "FIGCAPTION"].includes(contextNode.rawTagName.toUpperCase())
    ) {
      contextNode = contextNode.parentNode;
    }
    const context = normalizeSpace(contextNode?.textContent ?? "");
    if (!/^source\s*[:：]?/i.test(context)) continue;
    const href = anchor.getAttribute("href")?.trim() ?? "";
    if (!href) continue;
    try {
      const canonical = canonicalizePublicUrl(href);
      if (normalizedHost(canonical) !== blogHost) candidates.push(canonical);
    } catch (error) {
      if (!(error instanceof UnsafeUrlError)) throw error;
      candidates.push(href);
    }
  }
  return unique(candidates);
};

const firstContentImage = (html: string): { url: string; alt: string } => {
  const image = parseHtml(html).querySelector("img");
  return {
    url: image?.getAttribute("src")?.trim() ?? "",
    alt: normalizeSpace(image?.getAttribute("alt") ?? ""),
  };
};

export const parseWordpressExport = (xml: string): WordpressPostCandidate[] => {
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseTagValue: false,
    trimValues: false,
  }).parse(xml) as XmlNode;
  const rss = asNode(parsed.rss);
  const channel = asNode(rss?.channel);
  if (!channel) throw new Error("INVALID_WXR");

  const blogUrl = nodeText(channel.link).trim();
  const blogHost = normalizedHost(blogUrl);
  if (!blogHost) throw new Error("INVALID_WXR_SITE");
  const items = asArray(channel.item)
    .map(asNode)
    .filter((item): item is XmlNode => Boolean(item));

  const attachments = new Map<string, { url: string; alt: string }>();
  for (const item of items) {
    if (nodeText(item["wp:post_type"]).trim() !== "attachment") continue;
    const id = nodeText(item["wp:post_id"]).trim();
    const meta = postMeta(item);
    attachments.set(id, {
      url: nodeText(item["wp:attachment_url"]).trim(),
      alt: normalizeSpace(meta.get("_wp_attachment_image_alt") ?? ""),
    });
  }

  const posts: WordpressPostCandidate[] = [];
  for (const item of items) {
    if (
      nodeText(item["wp:post_type"]).trim() !== "post" ||
      nodeText(item["wp:status"]).trim() !== "publish"
    ) {
      continue;
    }
    const wordpressId = nodeText(item["wp:post_id"]).trim();
    const originUrl = nodeText(item.link).trim();
    const content = nodeText(item["content:encoded"]);
    const excerpt = plainText(nodeText(item["excerpt:encoded"]));
    const meta = postMeta(item);
    const featured = attachments.get(meta.get("_thumbnail_id") ?? "");
    const fallbackImage = firstContentImage(content);
    const categories = asArray(item.category)
      .map((category) => {
        const node = asNode(category);
        const domain = node ? nodeText(node["@_domain"]).trim() : "";
        return ["category", "post_tag"].includes(domain)
          ? normalizeSpace(nodeText(category))
          : "";
      })
      .filter(Boolean);
    posts.push({
      wordpressId,
      slug: nodeText(item["wp:post_name"]).trim() || `billet-${wordpressId}`,
      title: plainText(nodeText(item.title)),
      originUrl,
      added: nodeText(item["wp:post_date"]).trim().slice(0, 10),
      description: truncate(excerpt || "Référence archivée depuis le Blog OOBLIK."),
      tags: unique([...categories, "blog-ooblik"]).slice(0, 12),
      sourceUrls: sourceLinks(content, blogHost),
      imageUrl: featured?.url || fallbackImage.url,
      imageAlt: featured?.alt || fallbackImage.alt,
    });
  }
  return posts.sort((left, right) => right.added.localeCompare(left.added));
};

const validateOverrides = (
  overrides: Record<string, WordpressOverride>,
): Record<string, WordpressOverride> => {
  for (const [id, override] of Object.entries(overrides)) {
    if (!override || typeof override !== "object" || Array.isArray(override)) {
      throw new Error(`INVALID_OVERRIDE:${id}`);
    }
    const unknown = Object.keys(override).filter(
      (key) => !["source_url", "image_url", "skip"].includes(key),
    );
    if (
      unknown.length ||
      (override.skip !== undefined && typeof override.skip !== "boolean")
    ) {
      throw new Error(`INVALID_OVERRIDE:${id}`);
    }
  }
  return overrides;
};

const deadMetadata = (probe: WordpressProbe): Partial<DigestLink> => {
  if (!probe.definitive_dead) return {};
  const note = [404, 410].includes(probe.status ?? 0)
    ? `La destination renvoie aujourd’hui une erreur HTTP ${probe.status}. L’adresse publique d’origine est conservée pour mémoire.`
    : "Le domaine public d’origine ne répond plus au DNS. L’adresse est conservée pour mémoire.";
  return { status: "dead", status_note: note };
};

export const buildWordpressImportPreview = (input: {
  xml: string;
  currentLinks: DigestLink[];
  overrides?: Record<string, WordpressOverride>;
  probes?: WordpressProbe[];
}): WordpressImportPreview => {
  const overrides = validateOverrides(input.overrides ?? {});
  const probes = new Map(
    (input.probes ?? [])
      .filter((probe) => probe.url)
      .map((probe) => [probe.url!, probe]),
  );
  const currentByUrl = new Map(input.currentLinks.map((link) => [link.url, link]));
  const occupied = new Set(currentByUrl.keys());
  const ready: WordpressReadyItem[] = [];
  const review: WordpressReviewItem[] = [];
  const duplicates: WordpressReviewItem[] = [];
  const skipped: WordpressReviewItem[] = [];

  for (const post of parseWordpressExport(input.xml)) {
    const override = overrides[post.wordpressId];
    const base = {
      wordpress_id: post.wordpressId,
      title: post.title,
      origin_url: post.originUrl,
    };
    if (override?.skip) {
      skipped.push({ ...base, reason: "override_skip" });
      continue;
    }
    const rawSources = override?.source_url ? [override.source_url] : post.sourceUrls;
    if (rawSources.length !== 1) {
      review.push({
        ...base,
        reason: rawSources.length ? "ambiguous_source" : "missing_source",
        candidates: rawSources,
      });
      continue;
    }
    let url: string;
    try {
      url = canonicalizePublicUrl(rawSources[0]!);
    } catch (error) {
      if (!(error instanceof UnsafeUrlError)) throw error;
      review.push({
        ...base,
        reason: `unsafe_source:${error.code}`,
        candidates: rawSources,
      });
      continue;
    }
    const probe = probes.get(url);
    if (probe?.cross_host_redirect && !probe.definitive_dead) {
      review.push({
        ...base,
        reason: "cross_host_redirect",
        candidates: [url, probe.final_url ?? ""].filter(Boolean),
      });
      continue;
    }
    const existing = currentByUrl.get(url);
    if (
      existing?.origin_url === post.originUrl &&
      existing.stream === BLOG_ARCHIVE_STREAM &&
      existing.category === BLOG_ARCHIVE_CATEGORY
    ) {
      ready.push({
        wordpress_id: post.wordpressId,
        image_url: override?.image_url ?? post.imageUrl,
        image_alt: post.imageAlt,
        existing: true,
        link: { ...existing },
      });
      continue;
    }
    if (existing) {
      duplicates.push({
        ...base,
        reason: "duplicate_destination",
        candidates: [url],
      });
      continue;
    }
    occupied.add(url);
    const tags = probe?.definitive_dead
      ? unique([...post.tags, "lien-mort"]).slice(0, 12)
      : post.tags;
    ready.push({
      wordpress_id: post.wordpressId,
      image_url: override?.image_url ?? post.imageUrl,
      image_alt: post.imageAlt,
      existing: false,
      link: {
        id: stableLinkId(url),
        title: post.title,
        url,
        category: BLOG_ARCHIVE_CATEGORY,
        added: post.added,
        description: post.description,
        tags,
        origin_url: post.originUrl,
        stream: BLOG_ARCHIVE_STREAM,
        ...deadMetadata(probe ?? {}),
      },
    });
  }
  return {
    ready,
    review,
    duplicates,
    skipped,
    catalog: sortCatalog([
      ...input.currentLinks,
      ...ready.filter((item) => !item.existing).map((item) => item.link),
    ]),
  };
};

export const wordpressImagePath = (
  link: DigestLink,
  wordpressId: string,
): string => {
  const slug = link.origin_url
    ? decodeURIComponent(
        new URL(link.origin_url).pathname.split("/").filter(Boolean).at(-1) ?? "",
      )
    : "billet";
  const safeSlug = (slug || "billet")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "billet";
  return `/media/blog-ooblik/${link.added.slice(0, 4)}/${safeSlug}-${wordpressId}.webp`;
};

export const optimizeWordpressImage = async (input: Buffer): Promise<Buffer> => {
  const metadata = await sharp(input).metadata();
  const sourceWidth = metadata.autoOrient?.width ?? metadata.width;
  const sourceHeight = metadata.autoOrient?.height ?? metadata.height;
  if (!sourceWidth || !sourceHeight) throw new Error("IMAGE_DIMENSIONS_UNAVAILABLE");
  const targetWidth = Math.max(
    16,
    Math.floor(Math.min(960, sourceWidth, (sourceHeight * 16) / 9) / 16) * 16,
  );
  const targetHeight = (targetWidth * 9) / 16;
  return sharp(input)
    .rotate()
    .resize(targetWidth, targetHeight, {
      fit: "cover",
      position: "attention",
    })
    .webp({ quality: 78, effort: 6, smartSubsample: true, preset: "picture" })
    .toBuffer();
};

export const assertBlogMediaUrl = (rawUrl: string, blogHost: string): URL => {
  const url = new URL(rawUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    normalizedHost(url.toString()) !== blogHost
  ) {
    throw new Error("UNSAFE_IMAGE_HOST");
  }
  return url;
};

export const wordpressMediaRelativePath = (
  rawUrl: string,
  blogHost: string,
): string[] => {
  const url = assertBlogMediaUrl(rawUrl, blogHost);
  const marker = "/wp-content/uploads/";
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex < 0) throw new Error("IMAGE_OUTSIDE_UPLOADS");
  const encodedSegments = url.pathname.slice(markerIndex + marker.length).split("/");
  const segments = encodedSegments.map((segment) => decodeURIComponent(segment));
  if (
    !segments.length ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\"),
    )
  ) {
    throw new Error("UNSAFE_IMAGE_PATH");
  }
  return segments;
};

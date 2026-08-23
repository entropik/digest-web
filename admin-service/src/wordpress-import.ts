import { XMLParser } from "fast-xml-parser";
import { parse as parseHtml } from "node-html-parser";
import sharp from "sharp";

import type { DigestLink } from "./catalog.js";
import { sortCatalog, stableLinkId } from "./publication.js";
import { canonicalizePublicUrl, UnsafeUrlError } from "./urls.js";
import { canonicalizeTags } from "./tag-taxonomy.js";

export const BLOG_ARCHIVE_CATEGORY = "Archives du blog OOBLIK";
export const BLOG_ARCHIVE_STREAM = "blog-ooblik";
const MAX_DESCRIPTION_LENGTH = 300;

const WORDPRESS_PHOTOGRAPHY_CATEGORIES = new Set([
  "photo",
  "photographie",
  "photographes",
  "argentique",
  "camera porn",
  "exposition",
]);
const WORDPRESS_DESIGN_CATEGORIES = new Set(["livre/book"]);

type XmlNode = Record<string, unknown>;

export type WordpressOverride = {
  source_url?: string;
  image_url?: string | null;
  skip?: boolean;
};

export type WordpressImageSource = "featured" | "content" | "override" | "none";

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
  contentExcerpt: string;
  archiveText: string;
  tags: string[];
  sourceUrls: string[];
  fallbackSourceUrls: string[];
  fallbackSourceEvidence: WordpressSourceEvidence[];
  imageUrl: string;
  imageAlt: string;
  imageSource: WordpressImageSource;
};

export type WordpressSourceEvidence = {
  url: string;
  labels: string[];
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
  image_source: WordpressImageSource;
  image_candidate_url?: string;
  image_rejection?: "external" | "none_by_override";
  existing: boolean;
  previous_id?: string;
  previous_image?: string;
  link: DigestLink;
};

export type WordpressImportPreview = {
  ready: WordpressReadyItem[];
  review: WordpressReviewItem[];
  duplicates: WordpressReviewItem[];
  skipped: WordpressReviewItem[];
  catalog: DigestLink[];
};

export type WordpressImageReviewStatus =
  | "ready"
  | "none"
  | "external"
  | "missing_local"
  | "conversion_failure";

export type WordpressImageReviewItem = {
  wordpress_id: string;
  title: string;
  year: string;
  origin_url: string;
  source: WordpressImageSource;
  status: WordpressImageReviewStatus;
  low_resolution: boolean;
  source_width?: number;
  source_height?: number;
  final_width?: number;
  final_height?: number;
  ftp_path?: string;
  webp_path?: string;
  candidate_url?: string;
  error?: string;
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

const archivedPlainText = (value: string): string => {
  const withParagraphs = value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|figure|figcaption)>/gi, "\n\n")
    .replace(/\[(?:\/?(?:caption|embed)|gallery)[^\]]*\]/gi, "");
  return parseHtml(withParagraphs)
    .textContent.replaceAll("\u00a0", " ")
    .split(/\n+/)
    .map(normalizeSpace)
    .filter(Boolean)
    .join("\n\n");
};

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

export const wordpressDigestCategory = (tags: string[]): string => {
  const normalized = new Set(
    tags.map((tag) =>
      tag.toLocaleLowerCase("fr").trim().replace(/\s*\/\s*/g, "/"),
    ),
  );
  if ([...normalized].some((tag) => WORDPRESS_PHOTOGRAPHY_CATEGORIES.has(tag))) {
    return "Photographie";
  }
  if ([...normalized].some((tag) => WORDPRESS_DESIGN_CATEGORIES.has(tag))) {
    return "Design & Création";
  }
  return BLOG_ARCHIVE_CATEGORY;
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

const recoveryUrl = (rawValue: string, blogHost: string): string => {
  const cleaned = rawValue
    .trim()
    .replace(/\[\/embed\].*$/i, "")
    .replace(/[),.;]+$/, "");
  if (!cleaned) return "";
  const absolute = cleaned.startsWith("//") ? `https:${cleaned}` : cleaned;
  try {
    const canonical = canonicalizePublicUrl(absolute);
    return normalizedHost(canonical) === blogHost ? "" : canonical;
  } catch (error) {
    if (error instanceof UnsafeUrlError && error.code === "SENSITIVE_QUERY") {
      try {
        const url = new URL(absolute);
        if (normalizedHost(url.toString()).endsWith("slideshare.net")) {
          url.search = "";
          const canonical = canonicalizePublicUrl(url.toString());
          return normalizedHost(canonical) === blogHost ? "" : canonical;
        }
      } catch {
        return "";
      }
    }
    if (error instanceof UnsafeUrlError || error instanceof TypeError) return "";
    throw error;
  }
};

export const wordpressFallbackSourceEvidence = (
  html: string,
  blogHost: string,
): WordpressSourceEvidence[] => {
  const root = parseHtml(html);
  const candidates = new Map<string, Set<string>>();
  const add = (url: string, label: string): void => {
    if (!url) return;
    const labels = candidates.get(url) ?? new Set<string>();
    const normalized = normalizeSpace(label);
    if (normalized) labels.add(normalized);
    candidates.set(url, labels);
  };
  for (const anchor of root.querySelectorAll("a")) {
    add(
      recoveryUrl(anchor.getAttribute("href") ?? "", blogHost),
      anchor.textContent,
    );
  }
  const rawUrls = root.textContent.match(/https?:\/\/[^\s<>"']+/g) ?? [];
  for (const url of rawUrls) add(recoveryUrl(url, blogHost), url);
  return [...candidates.entries()].map(([url, labels]) => ({
    url,
    labels: [...labels],
  }));
};

export const wordpressFallbackSourceLinks = (
  html: string,
  blogHost: string,
): string[] =>
  wordpressFallbackSourceEvidence(html, blogHost).map((candidate) => candidate.url);

const firstContentImage = (html: string): { url: string; alt: string } => {
  const image = parseHtml(html).querySelector("img");
  return {
    url: image?.getAttribute("src")?.trim() ?? "",
    alt: normalizeSpace(image?.getAttribute("alt") ?? ""),
  };
};

const exactHostname = (value: string): string => {
  try {
    return new URL(value).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
};

export const normalizeWordpressMediaUrl = (
  rawUrl: string,
  wxrOrigin: string,
): URL => {
  const origin = new URL(wxrOrigin);
  if (!["http:", "https:"].includes(origin.protocol)) {
    throw new Error("UNSAFE_IMAGE_ORIGIN");
  }
  const cleaned = rawUrl.trim();
  if (!cleaned) throw new Error("IMAGE_URL_EMPTY");
  const rawPath = cleaned
    .replace(/[?#].*$/, "")
    .replace(/^[a-z][a-z\d+.-]*:\/\/[^/]*|^\/\/[^/]*/i, "");
  for (const encodedSegment of rawPath.split("/")) {
    let segment: string;
    try {
      segment = decodeURIComponent(encodedSegment);
    } catch {
      throw new Error("UNSAFE_IMAGE_PATH");
    }
    if (
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\")
    ) {
      throw new Error("UNSAFE_IMAGE_PATH");
    }
  }
  const resolved = new URL(cleaned, origin);
  if (
    !["http:", "https:"].includes(resolved.protocol) ||
    exactHostname(resolved.toString()) !== exactHostname(origin.toString())
  ) {
    throw new Error("UNSAFE_IMAGE_HOST");
  }
  if (!resolved.pathname.startsWith("/wp-content/uploads/")) {
    throw new Error("IMAGE_OUTSIDE_UPLOADS");
  }
  wordpressMediaSegments(resolved);
  return resolved;
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
    const archiveText = archivedPlainText(content);
    const fallbackSourceEvidence = wordpressFallbackSourceEvidence(content, blogHost);
    posts.push({
      wordpressId,
      slug: nodeText(item["wp:post_name"]).trim() || `billet-${wordpressId}`,
      title: plainText(nodeText(item.title)),
      originUrl,
      added: nodeText(item["wp:post_date"]).trim().slice(0, 10),
      description: truncate(
        excerpt || archiveText || "Référence archivée depuis le Blog OOBLIK.",
      ),
      contentExcerpt: truncate(archiveText, 600),
      archiveText,
      tags: unique([...categories, "blog-ooblik"]).slice(0, 12),
      sourceUrls: sourceLinks(content, blogHost),
      fallbackSourceUrls: fallbackSourceEvidence.map((candidate) => candidate.url),
      fallbackSourceEvidence,
      imageUrl: featured?.url || fallbackImage.url,
      imageAlt: featured?.alt || fallbackImage.alt,
      imageSource: featured?.url
        ? "featured"
        : fallbackImage.url
          ? "content"
          : "none",
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
      (override.skip !== undefined && typeof override.skip !== "boolean") ||
      (override.image_url !== undefined &&
        override.image_url !== null &&
        typeof override.image_url !== "string") ||
      override.image_url === ""
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
  const probes = new Map<string, WordpressProbe>();
  for (const probe of input.probes ?? []) {
    if (!probe.url) continue;
    try {
      probes.set(canonicalizePublicUrl(probe.url), probe);
    } catch (error) {
      if (!(error instanceof UnsafeUrlError || error instanceof TypeError)) throw error;
    }
  }
  const existingUrlKey = (rawUrl: string): string => {
    try {
      return canonicalizePublicUrl(rawUrl);
    } catch (error) {
      if (!(error instanceof UnsafeUrlError)) throw error;
      // Historical catalog entries are preserved even when their old URL no
      // longer satisfies the stricter rules applied to new destinations.
      return rawUrl;
    }
  };
  const currentByUrl = new Map(
    input.currentLinks.map((link) => [existingUrlKey(link.url), link]),
  );
  const currentByOrigin = new Map(
    input.currentLinks
      .filter((link) => link.stream === BLOG_ARCHIVE_STREAM && link.origin_url)
      .map((link) => [canonicalizePublicUrl(link.origin_url!), link]),
  );
  const knownTags = unique(
    input.currentLinks.flatMap((link) =>
      Array.isArray(link.tags) ? link.tags.map(String) : [],
    ),
  );
  const occupied = new Map(currentByUrl.entries());
  const ready: WordpressReadyItem[] = [];
  const review: WordpressReviewItem[] = [];
  const duplicates: WordpressReviewItem[] = [];
  const skipped: WordpressReviewItem[] = [];

  const imageDetails = (
    post: WordpressPostCandidate,
    override: WordpressOverride | undefined,
  ): Pick<
    WordpressReadyItem,
    | "image_url"
    | "image_alt"
    | "image_source"
    | "image_candidate_url"
    | "image_rejection"
  > => {
    const overridden = override && Object.hasOwn(override, "image_url");
    if (overridden && override.image_url === null) {
      return {
        image_url: "",
        image_alt: "",
        image_source: "none",
        image_rejection: "none_by_override",
      };
    }
    const candidate = overridden ? override.image_url! : post.imageUrl;
    if (!candidate) {
      return { image_url: "", image_alt: "", image_source: "none" };
    }
    try {
      return {
        image_url: normalizeWordpressMediaUrl(candidate, post.originUrl).toString(),
        image_alt: post.imageAlt,
        image_source: overridden ? "override" : post.imageSource,
      };
    } catch (error) {
      if ((error as Error).message !== "UNSAFE_IMAGE_HOST") throw error;
      return {
        image_url: "",
        image_alt: "",
        image_source: post.imageSource,
        image_candidate_url: candidate,
        image_rejection: "external",
      };
    }
  };

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
    const imported = currentByOrigin.get(canonicalizePublicUrl(post.originUrl));
    if (imported) {
      const claimedBy = occupied.get(url);
      if (claimedBy && claimedBy.id !== imported.id) {
        duplicates.push({
          ...base,
          reason: "duplicate_destination",
          candidates: [url],
        });
        continue;
      }
      const details = imageDetails(post, override);
      const link: DigestLink = {
        ...imported,
        id: stableLinkId(url),
        url,
        category: wordpressDigestCategory(post.tags),
        description: post.description,
        ...(post.archiveText ? { archive_text: post.archiveText } : {}),
        archive_tags: post.tags.filter((tag) => tag !== BLOG_ARCHIVE_STREAM),
        ...(probe?.definitive_dead
          ? { tags: unique([...(imported.tags ?? []), "lien-mort"]).slice(0, 12) }
          : {}),
        ...deadMetadata(probe ?? {}),
      };
      if (details.image_rejection === "none_by_override") {
        delete link.image;
        delete link.image_alt;
      }
      ready.push({
        wordpress_id: post.wordpressId,
        ...details,
        existing: true,
        previous_id: imported.id,
        ...(details.image_rejection === "none_by_override" && imported.image
          ? { previous_image: imported.image }
          : {}),
        link,
      });
      occupied.set(url, imported);
      continue;
    }
    if (existing || occupied.has(url)) {
      duplicates.push({
        ...base,
        reason: "duplicate_destination",
        candidates: [url],
      });
      continue;
    }
    const importedTags = canonicalizeTags(post.tags, knownTags);
    const isSelfArchive = url === canonicalizePublicUrl(post.originUrl);
    if (importedTags.unknown.length && !isSelfArchive) {
      review.push({
        ...base,
        reason: "unknown_tags",
        candidates: importedTags.unknown,
      });
      continue;
    }
    occupied.set(url, {
      id: stableLinkId(url),
      title: post.title,
      url,
      category: wordpressDigestCategory(post.tags),
      added: post.added,
      description: post.description,
    });
    const tags = probe?.definitive_dead
      ? unique([...importedTags.tags, "lien-mort"]).slice(0, 12)
      : importedTags.tags;
    ready.push({
      wordpress_id: post.wordpressId,
      ...imageDetails(post, override),
      existing: false,
      link: {
        id: stableLinkId(url),
        title: post.title,
        url,
        category: wordpressDigestCategory(post.tags),
        added: post.added,
        description: post.description,
        ...(post.archiveText ? { archive_text: post.archiveText } : {}),
        archive_tags: post.tags.filter((tag) => tag !== BLOG_ARCHIVE_STREAM),
        tags,
        origin_url: post.originUrl,
        stream: BLOG_ARCHIVE_STREAM,
        ...deadMetadata(probe ?? {}),
      },
    });
  }
  const importedById = new Map(
    ready.map((item) => [item.previous_id ?? item.link.id, item.link]),
  );
  return {
    ready,
    review,
    duplicates,
    skipped,
    catalog: sortCatalog([
      ...input.currentLinks.map((link) => importedById.get(link.id) ?? link),
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

export const assertBlogMediaUrl = (rawUrl: string, blogOrigin: string): URL =>
  normalizeWordpressMediaUrl(
    rawUrl,
    blogOrigin.includes("://") ? blogOrigin : `https://${blogOrigin}/`,
  );

const wordpressMediaSegments = (url: URL): string[] => {
  const marker = "/wp-content/uploads/";
  const encodedSegments = url.pathname.slice(marker.length).split("/");
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

export const wordpressMediaRelativePath = (
  rawUrl: string,
  blogHost: string,
): string[] => {
  return wordpressMediaSegments(assertBlogMediaUrl(rawUrl, blogHost));
};

export const loadWordpressImageSource = async (input: {
  rawUrl: string;
  blogOrigin: string;
  localOnly: boolean;
  readLocal: (relativePath: string[]) => Promise<Buffer>;
  download: (rawUrl: string) => Promise<Buffer>;
}): Promise<{ buffer: Buffer; from: "local" | "network"; relativePath: string[] }> => {
  const relativePath = wordpressMediaRelativePath(input.rawUrl, input.blogOrigin);
  try {
    return {
      buffer: await input.readLocal(relativePath),
      from: "local",
      relativePath,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (input.localOnly) throw new Error("IMAGE_LOCAL_NOT_FOUND");
  return {
    buffer: await input.download(input.rawUrl),
    from: "network",
    relativePath,
  };
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const renderWordpressImageReviewHtml = (
  rawItems: WordpressImageReviewItem[],
): string => {
  const items = [...rawItems].sort(
    (left, right) =>
      right.year.localeCompare(left.year) ||
      Number(left.wordpress_id) - Number(right.wordpress_id),
  );
  const years = [...new Set(items.map((item) => item.year))].sort().reverse();
  const cells = items
    .map((item) => {
      const filters = [
        item.year,
        item.source,
        item.status,
        ...(item.low_resolution ? ["low_resolution"] : []),
      ].join(" ");
      const image = item.webp_path
        ? `<img src="${escapeHtml(item.webp_path)}" alt="" loading="lazy" width="${item.final_width ?? 16}" height="${item.final_height ?? 9}">`
        : `<div class="placeholder" aria-label="Aucun visuel">${escapeHtml(item.status)}</div>`;
      const dimensions = item.source_width && item.source_height
        ? `${item.source_width}×${item.source_height} → ${item.final_width}×${item.final_height}`
        : "dimensions indisponibles";
      return `<article class="cell" tabindex="0" data-filters="${escapeHtml(filters)}">
  ${image}
  <div class="meta"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.year)} · ID ${escapeHtml(item.wordpress_id)}</span><span>${escapeHtml(item.source)} · ${escapeHtml(item.status)}${item.low_resolution ? " · faible résolution" : ""}</span><span>${escapeHtml(dimensions)}</span><a href="${escapeHtml(item.origin_url)}">Billet d’origine</a>${item.ftp_path ? `<code>${escapeHtml(item.ftp_path)}</code>` : ""}${item.error ? `<span class="error">${escapeHtml(item.error)}</span>` : ""}</div>
</article>`;
    })
    .join("\n");
  const buttons = [
    ["all", "Tout"],
    ["featured", "Featured"],
    ["content", "Content"],
    ["override", "Override"],
    ["low_resolution", "Faible résolution"],
    ["missing_local", "Manquant"],
    ["external", "Externe"],
    ...years.map((year) => [year, year]),
  ]
    .map(
      ([filter, label]) =>
        `<button type="button" data-filter="${filter}" aria-pressed="${filter === "all"}">${label}</button>`,
    )
    .join("");
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Revue des visuels Blog OOBLIK</title>
<style>:root{font-family:Arial,sans-serif;color:#171717;background:#f4f2ec}*{box-sizing:border-box}body{margin:0;padding:24px}header{border:1px solid #171717;padding:16px;margin-bottom:16px}h1{font-size:clamp(1.4rem,3vw,2.4rem);margin:0 0 12px}.filters{display:flex;flex-wrap:wrap}.filters button{border:1px solid #171717;border-radius:0;background:#fff;padding:8px 12px;margin:-1px 0 0 -1px}.filters button[aria-pressed=true]{color:#fff;background:#171717}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));border-top:1px solid #171717;border-left:1px solid #171717}.cell{min-width:0;border-right:1px solid #171717;border-bottom:1px solid #171717;background:#fff}.cell:focus{outline:3px solid #d4422f;outline-offset:-3px}.cell[hidden]{display:none}.cell img,.placeholder{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#ddd}.placeholder{display:grid;place-items:center;text-transform:uppercase}.meta{display:grid;gap:5px;padding:10px}.meta span,.meta a,.meta code{overflow-wrap:anywhere;font-size:.8rem}.error{color:#9d2015}@media(max-width:420px){body{padding:10px}.grid{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style></head>
<body><header><h1>Visuels patrimoniaux · Blog OOBLIK</h1><div class="filters" role="group" aria-label="Filtres">${buttons}</div></header><main class="grid">${cells}</main>
<script>const buttons=[...document.querySelectorAll('[data-filter]')],cells=[...document.querySelectorAll('.cell')];function select(filter){for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.filter===filter));for(const cell of cells)cell.hidden=filter!=='all'&&!cell.dataset.filters.split(' ').includes(filter)}for(const button of buttons)button.addEventListener('click',()=>select(button.dataset.filter));document.addEventListener('keydown',event=>{if(event.key==='Escape')select('all')});</script></body></html>\n`;
};

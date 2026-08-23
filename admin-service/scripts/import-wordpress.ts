import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import sharp from "sharp";

import { parseCatalog, serializeCatalog, type DigestLink } from "../src/catalog.js";
import {
  assertBlogMediaUrl,
  buildWordpressImportPreview,
  loadWordpressImageSource,
  optimizeWordpressImage,
  renderWordpressImageReviewHtml,
  type WordpressImageReviewItem,
  type WordpressOverride,
  type WordpressProbe,
  wordpressImagePath,
} from "../src/wordpress-import.js";

const args = process.argv.slice(2);
const valueAfter = (name: string): string | undefined => {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
};

const apply = args.includes("--apply");
const skipImages = args.includes("--skip-images");
const localOnly = args.includes("--local-only");
const inputPath = resolve(valueAfter("--input") ?? "../import/wordpress/export.xml");
const workDirectory = resolve(valueAfter("--workdir") ?? dirname(inputPath));
const siteRoot = resolve(valueAfter("--site") ?? "..");
const overridesPath = resolve(
  valueAfter("--overrides") ?? join(workDirectory, "overrides.json"),
);
const probesPath = valueAfter("--probe-results")
  ? resolve(valueAfter("--probe-results")!)
  : null;
const requestedMediaRoot = valueAfter("--media-root");
const defaultMediaRoot = join(siteRoot, "import-blog", "uploads");
const mediaRoot = requestedMediaRoot
  ? resolve(requestedMediaRoot)
  : await stat(defaultMediaRoot)
      .then((entry) => (entry.isDirectory() ? defaultMediaRoot : null))
      .catch(() => null);
if (localOnly) {
  if (!mediaRoot) throw new Error("LOCAL_ONLY_MEDIA_ROOT_REQUIRED");
  const mediaRootStat = await stat(mediaRoot).catch(() => null);
  if (!mediaRootStat?.isDirectory()) {
    throw new Error("LOCAL_ONLY_MEDIA_ROOT_UNREADABLE");
  }
  await stat(mediaRoot);
}

const optionalJson = async <T>(path: string | null, fallback: T): Promise<T> => {
  if (!path) return fallback;
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
};

const xml = await readFile(inputPath, "utf8");
const catalogPath = join(siteRoot, "data", "links.json");
const currentLinks = parseCatalog(await readFile(catalogPath, "utf8"));
const overrides = await optionalJson<Record<string, WordpressOverride>>(
  overridesPath,
  {},
);
const probes = await optionalJson<WordpressProbe[]>(probesPath, []);
const preview = buildWordpressImportPreview({ xml, currentLinks, overrides, probes });
const imageFailures: Array<{
  wordpress_id: string;
  image_url: string;
  error: string;
}> = [];
let imageBytes = 0;
let localImages = 0;
let networkImages = 0;
const blogOrigin =
  preview.ready[0]?.link.origin_url ?? "https://blog.ooblik.com/";
const imageCache = join(workDirectory, "media");
await mkdir(imageCache, { recursive: true });
const imageReview: WordpressImageReviewItem[] = [];

const downloadImage = async (rawUrl: string): Promise<Buffer> => {
  let url = assertBlogMediaUrl(rawUrl, blogOrigin);
  for (let redirects = 0; redirects < 4; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "OoblikDigestWordpressImport/1.0" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new Error("IMAGE_REDIRECT_WITHOUT_LOCATION");
        url = assertBlogMediaUrl(new URL(location, url).toString(), blogOrigin);
        continue;
      }
      if (!response.ok) throw new Error(`IMAGE_HTTP_${response.status}`);
      const type = response.headers.get("content-type") ?? "";
      if (!type.toLowerCase().startsWith("image/")) {
        throw new Error("IMAGE_CONTENT_TYPE");
      }
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > 20 * 1024 * 1024) throw new Error("IMAGE_TOO_LARGE");
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > 20 * 1024 * 1024) throw new Error("IMAGE_TOO_LARGE");
      return buffer;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("IMAGE_TOO_MANY_REDIRECTS");
};

let imageCursor = 0;
const processImages = async (): Promise<void> => {
  while (imageCursor < preview.ready.length) {
    const item = preview.ready[imageCursor++];
    if (!item) continue;
    const reportBase = {
      wordpress_id: item.wordpress_id,
      title: item.link.title,
      year: item.link.added.slice(0, 4),
      origin_url: item.link.origin_url ?? "",
      source: item.image_source,
    };
    if (!item.image_url) {
      imageReview.push({
        ...reportBase,
        status: item.image_rejection === "external" ? "external" : "none",
        low_resolution: false,
        ...(item.image_candidate_url
          ? { candidate_url: item.image_candidate_url }
          : {}),
        error: item.image_rejection ?? "no_candidate",
      });
      continue;
    }
    const publicPath = wordpressImagePath(item.link, item.wordpress_id);
    const cachedPath = join(imageCache, basename(publicPath));
    let ftpPath: string | undefined;
    try {
      const loaded = await loadWordpressImageSource({
        rawUrl: item.image_url,
        blogOrigin,
        localOnly,
        readLocal: async (relative) => {
          ftpPath = relative.join("/");
          if (!mediaRoot) {
            const error = new Error("IMAGE_LOCAL_NOT_FOUND") as NodeJS.ErrnoException;
            error.code = "ENOENT";
            throw error;
          }
          return readFile(join(mediaRoot, ...relative));
        },
        download: downloadImage,
      }).catch((error) => {
        if ((error as Error).message === "IMAGE_LOCAL_NOT_FOUND") {
          imageReview.push({
            ...reportBase,
            status: "missing_local",
            low_resolution: false,
            ftp_path: ftpPath,
            error: "IMAGE_LOCAL_NOT_FOUND",
          });
          imageFailures.push({
            wordpress_id: item.wordpress_id,
            image_url: item.image_url,
            error: "IMAGE_LOCAL_NOT_FOUND",
          });
          return null;
        }
        throw error;
      });
      if (!loaded) continue;
      const source = loaded.buffer;
      if (loaded.from === "local") localImages += 1;
      else networkImages += 1;
      const sourceMetadata = await sharp(source).metadata();
      const sourceWidth = sourceMetadata.autoOrient?.width ?? sourceMetadata.width;
      const sourceHeight = sourceMetadata.autoOrient?.height ?? sourceMetadata.height;
      if (!sourceWidth || !sourceHeight) {
        throw new Error("IMAGE_DIMENSIONS_UNAVAILABLE");
      }
      let optimized: Buffer;
      try {
        optimized = await readFile(cachedPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        optimized = await optimizeWordpressImage(source);
        await writeFile(cachedPath, optimized);
      }
      const finalMetadata = await sharp(optimized).metadata();
      imageBytes += optimized.byteLength;
      item.link.image = publicPath;
      if (item.image_alt) item.link.image_alt = item.image_alt;
      else delete item.link.image_alt;
      imageReview.push({
        ...reportBase,
        status: "ready",
        low_resolution: sourceWidth < 960 || sourceHeight < 540,
        source_width: sourceWidth,
        source_height: sourceHeight,
        final_width: finalMetadata.width,
        final_height: finalMetadata.height,
        ftp_path: ftpPath,
        webp_path: `media/${basename(publicPath)}`,
      });
      if (apply) {
        const destination = join(
          siteRoot,
          "static",
          ...publicPath.split("/").filter(Boolean),
        );
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, optimized);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      imageFailures.push({
        wordpress_id: item.wordpress_id,
        image_url: item.image_url,
        error: message,
      });
      imageReview.push({
        ...reportBase,
        status: "conversion_failure",
        low_resolution: false,
        ftp_path: ftpPath,
        error: message,
      });
    }
  }
};
if (!skipImages) {
  await Promise.all(Array.from({ length: 4 }, () => processImages()));
}

// `preview.catalog` contains the same link objects as `preview.ready`, so image
// enrichment above is already reflected there. Remapping by the destination ID
// would collapse two WordPress posts if they resolve to the same URL.
const finalCatalog: DigestLink[] = preview.catalog;
imageReview.sort(
  (left, right) => Number(left.wordpress_id) - Number(right.wordpress_id),
);
const itemsFor = (predicate: (item: WordpressImageReviewItem) => boolean) =>
  imageReview.filter(predicate);
const report = {
  mode: apply ? "apply" : "preview",
  input: inputPath,
  media_root: mediaRoot,
  local_only: localOnly,
  images_skipped: skipImages,
  ready: preview.ready.length,
  new_links: preview.ready.filter((item) => !item.existing).length,
  existing_imports: preview.ready.filter((item) => item.existing).length,
  review: preview.review,
  duplicates: preview.duplicates,
  skipped: preview.skipped,
  images: {
    featured: itemsFor((item) => item.source === "featured"),
    content: itemsFor((item) => item.source === "content"),
    none: itemsFor((item) => item.status === "none"),
    external: itemsFor((item) => item.status === "external"),
    missing_local: itemsFor((item) => item.status === "missing_local"),
    conversion_failure: itemsFor((item) => item.status === "conversion_failure"),
    low_resolution: itemsFor((item) => item.low_resolution),
    ready: itemsFor((item) => item.status === "ready"),
    failures: imageFailures,
    optimized_bytes: imageBytes,
    from_local_media: localImages,
    from_network: networkImages,
  },
};

await mkdir(workDirectory, { recursive: true });
const readyPath = join(workDirectory, "ready.json");
const reportPath = join(workDirectory, "report.json");
const reviewPath = join(workDirectory, "image-review.html");
await writeFile(
  readyPath,
  `${JSON.stringify(preview.ready.map((item) => item.link), null, 2)}\n`,
);
await writeFile(
  reportPath,
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(reviewPath, renderWordpressImageReviewHtml(imageReview));

if (apply) {
  const temporary = `${catalogPath}.wordpress-${process.pid}.tmp`;
  await writeFile(temporary, serializeCatalog(finalCatalog));
  await rename(temporary, catalogPath);
}

process.stdout.write(
  `${JSON.stringify(
    {
      mode: report.mode,
      ready: report.ready,
      new_links: report.new_links,
      existing_imports: report.existing_imports,
      review: report.review.length,
      duplicates: report.duplicates.length,
      skipped: report.skipped.length,
      images_ready: report.images.ready.length,
      images_fallback: report.images.none.length + report.images.external.length,
      images_external: report.images.external.length,
      images_missing_local: report.images.missing_local.length,
      images_conversion_failure: report.images.conversion_failure.length,
      images_low_resolution: report.images.low_resolution.length,
      images_from_network: report.images.from_network,
      optimized_bytes: report.images.optimized_bytes,
      ready_path: readyPath,
      report_path: reportPath,
      review_path: reviewPath,
    },
    null,
    2,
  )}\n`,
);

import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { parseCatalog, serializeCatalog, type DigestLink } from "../src/catalog.js";
import {
  assertBlogMediaUrl,
  buildWordpressImportPreview,
  normalizedHost,
  optimizeWordpressImage,
  type WordpressOverride,
  type WordpressProbe,
  wordpressMediaRelativePath,
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
const blogHost = normalizedHost(
  preview.ready[0]?.link.origin_url ?? "https://blog.ooblik.com/",
);
const imageCache = join(workDirectory, "media");
await mkdir(imageCache, { recursive: true });

const downloadImage = async (rawUrl: string): Promise<Buffer> => {
  let url = assertBlogMediaUrl(rawUrl, blogHost);
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
        url = assertBlogMediaUrl(new URL(location, url).toString(), blogHost);
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
    if (!item?.image_url) continue;
    const publicPath = wordpressImagePath(item.link, item.wordpress_id);
    const cachedPath = join(imageCache, basename(publicPath));
    try {
      let optimized: Buffer;
      try {
        optimized = await readFile(cachedPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        let source: Buffer | null = null;
        if (mediaRoot) {
          try {
            source = await readFile(
              join(mediaRoot, ...wordpressMediaRelativePath(item.image_url, blogHost)),
            );
            localImages += 1;
          } catch (localError) {
            if (
              (localError as NodeJS.ErrnoException).code !== "ENOENT" &&
              (localError as Error).message !== "IMAGE_OUTSIDE_UPLOADS"
            ) {
              throw localError;
            }
          }
        }
        if (!source) {
          source = await downloadImage(item.image_url);
          networkImages += 1;
        }
        optimized = await optimizeWordpressImage(source);
        await writeFile(cachedPath, optimized);
      }
      imageBytes += optimized.byteLength;
      item.link.image = publicPath;
      item.link.image_alt = item.image_alt;
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
      imageFailures.push({
        wordpress_id: item.wordpress_id,
        image_url: item.image_url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};
if (!skipImages) {
  await Promise.all(Array.from({ length: 4 }, () => processImages()));
}

const importedById = new Map(preview.ready.map((item) => [item.link.id, item.link]));
const finalCatalog: DigestLink[] = preview.catalog.map(
  (link) => importedById.get(link.id) ?? link,
);
const report = {
  mode: apply ? "apply" : "preview",
  input: inputPath,
  media_root: mediaRoot,
  images_skipped: skipImages,
  ready: preview.ready.length,
  new_links: preview.ready.filter((item) => !item.existing).length,
  existing_imports: preview.ready.filter((item) => item.existing).length,
  review: preview.review,
  duplicates: preview.duplicates,
  skipped: preview.skipped,
  images: {
    ready: preview.ready.filter((item) => item.link.image).length,
    fallback: preview.ready.filter((item) => !item.link.image).length,
    failures: imageFailures,
    optimized_bytes: imageBytes,
    from_local_media: localImages,
    from_network: networkImages,
  },
};

await mkdir(workDirectory, { recursive: true });
const readyPath = join(workDirectory, "ready.json");
const reportPath = join(workDirectory, "report.json");
await writeFile(
  readyPath,
  `${JSON.stringify(preview.ready.map((item) => item.link), null, 2)}\n`,
);
await writeFile(
  reportPath,
  `${JSON.stringify(report, null, 2)}\n`,
);

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
      images_ready: report.images.ready,
      images_fallback: report.images.fallback,
      optimized_bytes: report.images.optimized_bytes,
      ready_path: readyPath,
      report_path: reportPath,
    },
    null,
    2,
  )}\n`,
);

export type PageCapture = {
  url: string;
  title: string;
  description: string;
  privateNote: string;
};

const privateIpv4 = (host: string): boolean => {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

export const isSupportedCaptureUrl = (rawUrl: string): boolean => {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const ipHost = host.replace(/^\[|\]$/g, "");
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      host !== "localhost" &&
      ![".local", ".lan", ".internal"].some((suffix) =>
        host.endsWith(suffix),
      ) &&
      !privateIpv4(ipHost) &&
      ipHost !== "::1" &&
      !/^f[cd]|^fe[89ab]/i.test(ipHost)
    );
  } catch {
    return false;
  }
};

export const extractPageMetadata = (): PageCapture => {
  const canonical = document
    .querySelector<HTMLLinkElement>('link[rel~="canonical"]')
    ?.href.trim();
  const description =
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.content.trim() ||
    document
      .querySelector<HTMLMetaElement>('meta[property="og:description"]')
      ?.content.trim() ||
    "";
  return {
    url: canonical || location.href,
    title:
      document
        .querySelector<HTMLMetaElement>('meta[property="og:title"]')
        ?.content.trim() ||
      document.title.trim(),
    description,
    privateNote: window.getSelection()?.toString().trim() || ""
  };
};

export const missingEditorialFields = (capture: {
  title: string;
  category: string;
  description: string;
  tags: string[];
}): string[] => {
  const missing: string[] = [];
  if (!capture.title.trim()) missing.push("titre");
  if (!capture.category.trim()) missing.push("catégorie");
  if (!capture.description.trim()) missing.push("résumé");
  if (!capture.tags.length) missing.push("tag");
  return missing;
};

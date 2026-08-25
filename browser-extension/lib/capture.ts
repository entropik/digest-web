export type PageCapture = {
  url: string;
  title: string;
  description: string;
  privateNote: string;
};

export type AnalyzedPageCapture = PageCapture & {
  analysisText: string;
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
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
};

const mappedPrivateIpv4 = (host: string): boolean => {
  const dotted = host.match(/^::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)$/i);
  if (dotted?.[1]) return privateIpv4(dotted[1]);
  const hexadecimal = host.match(
    /^::ffff:(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i,
  );
  if (!hexadecimal?.[1] || !hexadecimal[2]) return false;
  const high = Number.parseInt(hexadecimal[1], 16);
  const low = Number.parseInt(hexadecimal[2], 16);
  return privateIpv4(
    `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`,
  );
};

export const isSupportedCaptureUrl = (rawUrl: string): boolean => {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    const ipHost = host.replace(/^\[|\]$/g, "");
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      host !== "localhost" &&
      ![".localhost", ".local", ".lan", ".internal"].some((suffix) =>
        host.endsWith(suffix),
      ) &&
      !privateIpv4(ipHost) &&
      !mappedPrivateIpv4(ipHost) &&
      ipHost !== "::" &&
      ipHost !== "::1" &&
      !/^f[cd]|^fe[89a-f]|^ff/i.test(ipHost)
    );
  } catch {
    return false;
  }
};

export const extractPageMetadata = (): AnalyzedPageCapture => {
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
    privateNote: window.getSelection()?.toString().trim() || "",
    analysisText: (document.body?.innerText || document.body?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30_000),
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

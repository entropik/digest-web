import { parse } from "node-html-parser";
import { codePoints } from "./translation-types.js";

export class TranslationError extends Error {
  constructor(readonly code: string, readonly uncertain = false) { super(code); }
}
const structure = (html: string) => {
  const root = parse(html);
  return root.querySelectorAll("*").map(node => ({
    tag: node.tagName,
    attributes: Object.fromEntries(Object.entries(node.attributes).filter(([key]) => key !== "translate").sort()),
    literal: ["CODE", "PRE", "SCRIPT", "STYLE"].includes(node.tagName) ? node.innerHTML : null,
  }));
};
export function protectHtml(source: string) {
  const root = parse(source);
  for (const node of root.querySelectorAll("pre,script,style,code")) {
    if (node.tagName !== "CODE" || !node.closest("pre")) node.setAttribute("translate", "no");
  }
  return root.toString();
}
export function validateTranslation(source: string, result: string, format: string) {
  if (!result.trim()) throw new TranslationError("TRANSLATION_EMPTY", true);
  if (format === "text") {
    const literals = (text: string) => text.match(/https?:\/\/[^\s<>"'`]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|`[^`]+`/gi) || [];
    if (JSON.stringify(literals(source)) !== JSON.stringify(literals(result))) throw new TranslationError("TRANSLATION_LITERAL_CHANGED", true);
  }
  if (format === "html" && JSON.stringify(structure(source)) !== JSON.stringify(structure(result))) {
    throw new TranslationError("TRANSLATION_STRUCTURE_CHANGED", true);
  }
  return result;
}
export class DeepLClient {
  readonly base: string;
  constructor(readonly key: string, base?: string, readonly request: typeof fetch = fetch) {
    this.base = base || (key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com");
    if (!["https://api-free.deepl.com", "https://api.deepl.com"].includes(this.base)) throw new Error("DEEPL_ENDPOINT_INVALID");
  }
  async usage() {
    if (!this.key) throw new TranslationError("DEEPL_NOT_CONFIGURED");
    let response: Response;
    try {
      response = await this.request(this.base + "/v2/usage", {
        headers: { Authorization: "DeepL-Auth-Key " + this.key }, signal: AbortSignal.timeout(15_000),
      });
    } catch { throw new TranslationError("QUOTA_UNAVAILABLE"); }
    if (!response.ok) throw new TranslationError("DEEPL_" + response.status);
    const data = await response.json() as { character_count?: number; character_limit?: number };
    if (!Number.isSafeInteger(data.character_count) || !Number.isSafeInteger(data.character_limit) ||
        data.character_count! < 0 || data.character_limit! < 0) throw new TranslationError("QUOTA_INVALID");
    return { used: data.character_count!, limit: data.character_limit! };
  }
  prepare(source: string, format: string) {
    const protectedSource = format === "html" ? protectHtml(source) : source;
    const body = JSON.stringify({
      text: [protectedSource], target_lang: "EN-GB", show_billed_characters: true,
      ...(format === "html" ? { tag_handling: "html", tag_handling_version: "v2" } : {}),
    });
    if (Buffer.byteLength(body) > 120_000) throw new TranslationError("TEXT_TOO_LARGE");
    return { body, reserved: codePoints(protectedSource) };
  }
  async translate(source: string, format: string) {
    const prepared = this.prepare(source, format);
    let response: Response;
    try {
      response = await this.request(this.base + "/v2/translate", {
        method: "POST", headers: { Authorization: "DeepL-Auth-Key " + this.key, "Content-Type": "application/json" },
        body: prepared.body, signal: AbortSignal.timeout(60_000),
      });
    } catch { throw new TranslationError("REQUEST_OUTCOME_UNKNOWN", true); }
    if (!response.ok) {
      // A rejected request is not replayed in a loop. Server failures may have been billed.
      throw new TranslationError("DEEPL_" + response.status, response.status >= 500);
    }
    try {
      const data = await response.json() as { translations?: { text?: string; billed_characters?: number }[] };
      if (data.translations?.length !== 1 || typeof data.translations[0]?.text !== "string") throw new Error("invalid");
      const result = data.translations[0];
      const billed = result.billed_characters ?? prepared.reserved;
      if (!Number.isSafeInteger(billed) || billed < 0 || billed > prepared.reserved) throw new Error("invalid");
      return { text: validateTranslation(source, result.text!, format), billed };
    } catch (error) {
      if (error instanceof TranslationError) throw error;
      throw new TranslationError("TRANSLATION_RESPONSE_INVALID", true);
    }
  }
}

import { parseEdition } from "./editions.js";
import type { SocialImageInput } from "./social-image.js";
import { sourceHash, type TranslationArtwork, type TranslationSnapshot } from "./translation-types.js";

type Dependencies = {
  previous: TranslationSnapshot | null;
  links: { added: string; visibility?: string }[];
  readEdition: (date: string) => Promise<string | null>;
  exists: (path: string) => boolean;
  render: (input: SocialImageInput) => Promise<Buffer>;
  renderLinkedIn: (input: SocialImageInput) => Promise<Buffer>;
};
const matches = (a: TranslationArtwork | undefined, b: TranslationArtwork) => a &&
  a.title === b.title && a.description === b.description && a.linkCount === b.linkCount && a.editorialType === b.editorialType;

export async function prepareTranslationArtwork(entries: TranslationSnapshot["entries"], dependencies: Dependencies) {
  const artwork: Record<string, TranslationArtwork> = {};
  const files: Record<string, Buffer> = {};
  for (const [id, fields] of Object.entries(entries)) {
    const date = id.match(/^page:\/archives\/(\d{4}-\d{2}-\d{2})$/)?.[1];
    if (!date || !fields.title || !fields.description) continue;
    const source = await dependencies.readEdition(date);
    if (!source) continue;
    const edition = parseEdition(source);
    if (edition.draft || fields.title.hash !== sourceHash(edition.title, "text") || fields.description.hash !== sourceHash(edition.description, "text")) continue;
    const image: TranslationArtwork = { title: fields.title.text, description: fields.description.text,
      linkCount: dependencies.links.filter(link => link.added === date && link.visibility !== "hidden").length,
      editorialType: edition.editorialType || "digest" };
    artwork[date] = image;
    const og = "static/social/en/" + date + ".png", linkedin = "static/social/en/" + date + "-linkedin.png";
    if (matches(dependencies.previous?.artwork?.[date], image) && dependencies.exists(og) && dependencies.exists(linkedin)) continue;
    const input = { ...image, digestDate: date, locale: "en-GB" as const };
    files[og] = await dependencies.render(input);
    files[linkedin] = await dependencies.renderLinkedIn(input);
  }
  return { artwork, files };
}

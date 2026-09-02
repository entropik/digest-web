import { createHash } from "node:crypto";
import { serializeCatalog, type DigestLink } from "./catalog.js";
import type { CurationDraft } from "./curation-types.js";
import { renderEdition } from "./editions.js";
import {
  generateOptimizedLinkedInImage,
  generateOptimizedSocialImage,
} from "./social-image.js";

const URL_NAMESPACE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
const uuidBytes = (uuid: string): Buffer =>
  Buffer.from(uuid.replaceAll("-", ""), "hex");

export const stableLinkId = (url: string): string => {
  const digest = createHash("sha1")
    .update(Buffer.concat([uuidBytes(URL_NAMESPACE), Buffer.from(url)]))
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const sortCatalog = (links: DigestLink[]): DigestLink[] =>
  links.slice().sort((left, right) => {
    const dateOrder = right.added.localeCompare(left.added);
    if (dateOrder) return dateOrder;
    return right.title
      .toLocaleLowerCase("fr")
      .localeCompare(left.title.toLocaleLowerCase("fr"), "fr");
  });

export const buildPublicationFiles = async (input: {
  currentLinks: DigestLink[];
  drafts: CurationDraft[];
  digestDate: string;
  title: string;
  introduction: string;
  seoDescription: string;
  editorialType?: "digest" | "focus";
}) => {
  const linkIdsByDraft = new Map<string, string>();
  const newLinks: DigestLink[] = input.drafts.map((draft) => {
    const id = stableLinkId(draft.url);
    linkIdsByDraft.set(draft.id, id);
    return {
      id,
      title: draft.title,
      url: draft.url,
      category: draft.category,
      added: input.digestDate,
      description: draft.description,
      tags: [...draft.tags],
    };
  });
  const socialInput = {
    digestDate: input.digestDate,
    title: input.title,
    description: input.seoDescription,
    linkCount: newLinks.length,
    editorialType: input.editorialType,
  };
  const [socialImage, linkedInImage] = await Promise.all([
    generateOptimizedSocialImage(socialInput),
    generateOptimizedLinkedInImage(socialInput),
  ]);
  return {
    files: {
      "data/links.json": serializeCatalog(
        sortCatalog([...input.currentLinks, ...newLinks]),
      ),
      [`content/archives/${input.digestDate}.md`]: renderEdition({
        digestDate: input.digestDate,
        title: input.title,
        description: input.seoDescription,
        introduction: input.introduction,
        editorialType: input.editorialType === "focus" ? "focus" : undefined,
      }),
      [`static/social/${input.digestDate}.png`]: socialImage,
      [`static/social/${input.digestDate}-linkedin.png`]: linkedInImage,
    },
    linkIdsByDraft,
  };
};

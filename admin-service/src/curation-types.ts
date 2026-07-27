export type DraftState = "draft" | "publishing" | "published";

export type CurationDraft = {
  id: string;
  url: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  privateNote: string;
  state: DraftState;
  publicationId: string | null;
  publishedLinkId: string | null;
  publishedCommit: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type PublicationState =
  | "committing"
  | "validating"
  | "deploying"
  | "live"
  | "failed";

export type DigestPublication = {
  id: string;
  digestDate: string;
  title: string;
  introduction: string;
  seoDescription: string;
  state: PublicationState;
  commitSha: string | null;
  validateUrl: string | null;
  deployUrl: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt: string | null;
};

export type DraftInput = {
  url: string;
  title?: string;
  category?: string;
  description?: string;
  tags?: string[];
  privateNote?: string;
};

export type PublicationInput = {
  requestId: string;
  draftIds: string[];
  digestDate: string;
  title: string;
  introduction: string;
  seoDescription: string;
};


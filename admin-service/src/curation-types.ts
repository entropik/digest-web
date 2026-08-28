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

export type PublicationAction = "publish" | "unpublish";
export type PublicationSource = "curation" | "edition";

export type DigestPublication = {
  id: string;
  digestDate: string;
  title: string;
  introduction: string;
  seoDescription: string;
  action: PublicationAction;
  source: PublicationSource;
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

export type TaxonomyMutationKind =
  | "rename_category"
  | "update_theme"
  | "archive_theme";

export type TaxonomyMutationState = "committing" | "applying" | "complete";

export type TaxonomyMutation = {
  id: string;
  kind: TaxonomyMutationKind;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
  state: TaxonomyMutationState;
  commitSha: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EditionTransitionInput = {
  requestId: string;
  action: PublicationAction;
};

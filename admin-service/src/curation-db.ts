import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  CurationDraft,
  DigestPublication,
  DraftInput,
  DraftState,
  PublicationState,
} from "./curation-types.js";

type DraftRow = {
  id: string;
  url: string;
  title: string;
  category: string;
  description: string;
  tags_json: string;
  private_note: string;
  state: DraftState;
  publication_id: string | null;
  published_link_id: string | null;
  published_commit: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

type PublicationRow = {
  id: string;
  digest_date: string;
  title: string;
  introduction: string;
  seo_description: string;
  state: PublicationState;
  commit_sha: string | null;
  validate_url: string | null;
  deploy_url: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  last_checked_at: string | null;
};

const parseTags = (value: string): string[] => {
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? parsed.map(String) : [];
};

const draftFromRow = (row: DraftRow): CurationDraft => ({
  id: row.id,
  url: row.url,
  title: row.title,
  category: row.category,
  description: row.description,
  tags: parseTags(row.tags_json),
  privateNote: row.private_note,
  state: row.state,
  publicationId: row.publication_id,
  publishedLinkId: row.published_link_id,
  publishedCommit: row.published_commit,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  publishedAt: row.published_at,
});

const publicationFromRow = (row: PublicationRow): DigestPublication => ({
  id: row.id,
  digestDate: row.digest_date,
  title: row.title,
  introduction: row.introduction,
  seoDescription: row.seo_description,
  state: row.state,
  commitSha: row.commit_sha,
  validateUrl: row.validate_url,
  deployUrl: row.deploy_url,
  errorCode: row.error_code,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastCheckedAt: row.last_checked_at,
});

export const ensureCurationSchema = (database: Database.Database): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS curation_drafts (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      private_note TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'draft'
        CHECK (state IN ('draft', 'publishing', 'published')),
      publication_id TEXT,
      published_link_id TEXT,
      published_commit TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT
    );
    CREATE INDEX IF NOT EXISTS curation_drafts_state_updated
      ON curation_drafts(state, updated_at DESC);

    CREATE TABLE IF NOT EXISTS digest_publications (
      id TEXT PRIMARY KEY,
      digest_date TEXT NOT NULL,
      title TEXT NOT NULL,
      introduction TEXT NOT NULL,
      seo_description TEXT NOT NULL,
      state TEXT NOT NULL
        CHECK (state IN ('committing', 'validating', 'deploying', 'live', 'failed')),
      commit_sha TEXT,
      validate_url TEXT,
      deploy_url TEXT,
      error_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_checked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS digest_publications_created
      ON digest_publications(created_at DESC);
  `);
};

export class CurationStore {
  constructor(readonly database: Database.Database) {
    ensureCurationSchema(database);
  }

  listDrafts(state: DraftState = "draft"): CurationDraft[] {
    const rows = this.database
      .prepare(
        "SELECT * FROM curation_drafts WHERE state = ? ORDER BY updated_at DESC",
      )
      .all(state) as DraftRow[];
    return rows.map(draftFromRow);
  }

  findDraft(id: string): CurationDraft | null {
    const row = this.database
      .prepare("SELECT * FROM curation_drafts WHERE id = ?")
      .get(id) as DraftRow | undefined;
    return row ? draftFromRow(row) : null;
  }

  findDraftByUrl(url: string): CurationDraft | null {
    const row = this.database
      .prepare("SELECT * FROM curation_drafts WHERE url = ?")
      .get(url) as DraftRow | undefined;
    return row ? draftFromRow(row) : null;
  }

  listDraftsByPublication(publicationId: string): CurationDraft[] {
    const rows = this.database
      .prepare(
        "SELECT * FROM curation_drafts WHERE publication_id = ? ORDER BY created_at",
      )
      .all(publicationId) as DraftRow[];
    return rows.map(draftFromRow);
  }

  createDraft(input: Required<DraftInput>, now = new Date()): CurationDraft {
    const id = randomUUID();
    const timestamp = now.toISOString();
    this.database
      .prepare(
        `INSERT INTO curation_drafts
          (id, url, title, category, description, tags_json, private_note,
           state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      )
      .run(
        id,
        input.url,
        input.title,
        input.category,
        input.description,
        JSON.stringify(input.tags),
        input.privateNote,
        timestamp,
        timestamp,
      );
    return this.findDraft(id)!;
  }

  updateDraft(
    id: string,
    input: Omit<Required<DraftInput>, "url">,
    now = new Date(),
  ): CurationDraft | null {
    const result = this.database
      .prepare(
        `UPDATE curation_drafts
         SET title = ?, category = ?, description = ?, tags_json = ?,
             private_note = ?, updated_at = ?
         WHERE id = ? AND state = 'draft'`,
      )
      .run(
        input.title,
        input.category,
        input.description,
        JSON.stringify(input.tags),
        input.privateNote,
        now.toISOString(),
        id,
      );
    return result.changes ? this.findDraft(id) : null;
  }

  deleteDraft(id: string): boolean {
    return (
      this.database
        .prepare("DELETE FROM curation_drafts WHERE id = ? AND state = 'draft'")
        .run(id).changes > 0
    );
  }

  countActiveDraftsByCategory(category: string): number {
    const row = this.database
      .prepare(
        "SELECT COUNT(*) AS count FROM curation_drafts WHERE category = ? AND state IN ('draft', 'publishing')",
      )
      .get(category) as { count: number };
    return row.count;
  }

  renameActiveDraftCategory(current: string, replacement: string): number {
    return this.database
      .prepare(
        `UPDATE curation_drafts
         SET category = ?, updated_at = ?
         WHERE category = ? AND state IN ('draft', 'publishing')`,
      )
      .run(replacement, new Date().toISOString(), current).changes;
  }

  replaceActiveDraftTag(current: string, replacement: string | null): number {
    const rows = this.database
      .prepare(
        `SELECT id, tags_json FROM curation_drafts
         WHERE state IN ('draft', 'publishing')`,
      )
      .all() as Array<{ id: string; tags_json: string }>;
    const update = this.database.prepare(
      `UPDATE curation_drafts SET tags_json = ?, updated_at = ? WHERE id = ?`,
    );
    return this.database.transaction(() => {
      let changed = 0;
      const now = new Date().toISOString();
      for (const row of rows) {
        const tags = parseTags(row.tags_json);
        if (!tags.includes(current)) continue;
        const next = replacement
          ? [...new Set(tags.map((tag) => tag === current ? replacement : tag))]
          : tags.filter((tag) => tag !== current);
        changed += update.run(JSON.stringify(next), now, row.id).changes;
      }
      return changed;
    })();
  }

  markDraftsPublishing(ids: string[], publicationId: string): void {
    const update = this.database.prepare(
      `UPDATE curation_drafts
       SET state = 'publishing', publication_id = ?, updated_at = ?
       WHERE id = ? AND state = 'draft'`,
    );
    const transaction = this.database.transaction(() => {
      const now = new Date().toISOString();
      for (const id of ids) {
        if (update.run(publicationId, now, id).changes !== 1) {
          throw new Error("DRAFT_NOT_AVAILABLE");
        }
      }
    });
    transaction();
  }

  restorePublishingDrafts(publicationId: string): void {
    this.database
      .prepare(
        `UPDATE curation_drafts
         SET state = 'draft', publication_id = NULL, updated_at = ?
         WHERE publication_id = ? AND state = 'publishing'`,
      )
      .run(new Date().toISOString(), publicationId);
  }

  markDraftsPublished(
    publicationId: string,
    commitSha: string,
    linkIdsByDraft: Map<string, string>,
  ): void {
    const update = this.database.prepare(
      `UPDATE curation_drafts
       SET state = 'published', published_link_id = ?, published_commit = ?,
           published_at = ?, updated_at = ?
       WHERE id = ? AND publication_id = ?`,
    );
    const transaction = this.database.transaction(() => {
      const now = new Date().toISOString();
      for (const [draftId, linkId] of linkIdsByDraft) {
        update.run(linkId, commitSha, now, now, draftId, publicationId);
      }
    });
    transaction();
  }

  createPublication(input: {
    id: string;
    digestDate: string;
    title: string;
    introduction: string;
    seoDescription: string;
  }): DigestPublication {
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO digest_publications
          (id, digest_date, title, introduction, seo_description, state,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'committing', ?, ?)`,
      )
      .run(
        input.id,
        input.digestDate,
        input.title,
        input.introduction,
        input.seoDescription,
        now,
        now,
      );
    return this.findPublication(input.id)!;
  }

  findPublication(id: string): DigestPublication | null {
    const row = this.database
      .prepare("SELECT * FROM digest_publications WHERE id = ?")
      .get(id) as PublicationRow | undefined;
    return row ? publicationFromRow(row) : null;
  }

  listPublications(limit = 20): DigestPublication[] {
    const rows = this.database
      .prepare(
        "SELECT * FROM digest_publications ORDER BY created_at DESC LIMIT ?",
      )
      .all(limit) as PublicationRow[];
    return rows.map(publicationFromRow);
  }

  updatePublication(
    id: string,
    values: {
      state: PublicationState;
      commitSha?: string | null;
      validateUrl?: string | null;
      deployUrl?: string | null;
      errorCode?: string | null;
      checked?: boolean;
    },
  ): DigestPublication {
    const current = this.findPublication(id);
    if (!current) throw new Error("PUBLICATION_NOT_FOUND");
    const now = new Date().toISOString();
    this.database
      .prepare(
        `UPDATE digest_publications
         SET state = ?, commit_sha = ?, validate_url = ?, deploy_url = ?,
             error_code = ?, updated_at = ?, last_checked_at = ?
         WHERE id = ?`,
      )
      .run(
        values.state,
        values.commitSha === undefined ? current.commitSha : values.commitSha,
        values.validateUrl === undefined ? current.validateUrl : values.validateUrl,
        values.deployUrl === undefined ? current.deployUrl : values.deployUrl,
        values.errorCode === undefined ? current.errorCode : values.errorCode,
        now,
        values.checked ? now : current.lastCheckedAt,
        id,
      );
    return this.findPublication(id)!;
  }
}

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type Database from "better-sqlite3";
import { config } from "./config.js";
import { canonicalizePublicUrl } from "./urls.js";
import { fetchWithDeadline, NetworkDeadlineError } from "./network.js";

const LINKEDIN_AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const LINKEDIN_ASSETS_URL = "https://api.linkedin.com/v2/assets?action=registerUpload";
const LINKEDIN_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";
const STATE_LIFETIME_MS = 10 * 60 * 1_000;
const PUBLICATION_RESERVATION_LIFETIME_MS = 10 * 60 * 1_000;
const PUBLICATION_RESERVATION_RENEWAL_MS = 60 * 1_000;
const MAX_COMMENTARY_LENGTH = 3_000;
const LINKEDIN_READ_TIMEOUT_MS = 15_000;
const LINKEDIN_WRITE_TIMEOUT_MS = 30_000;
const LINKEDIN_UPLOAD_TIMEOUT_MS = 60_000;

type LinkedInDeadlines = {
  read: number;
  write: number;
  upload: number;
};

const defaultDeadlines: LinkedInDeadlines = {
  read: LINKEDIN_READ_TIMEOUT_MS,
  write: LINKEDIN_WRITE_TIMEOUT_MS,
  upload: LINKEDIN_UPLOAD_TIMEOUT_MS,
};

export type LinkedInErrorCode =
  | "LINKEDIN_NOT_CONFIGURED"
  | "LINKEDIN_INVALID_STATE"
  | "LINKEDIN_AUTHORIZATION_FAILED"
  | "LINKEDIN_NOT_CONNECTED"
  | "LINKEDIN_TOKEN_EXPIRED"
  | "LINKEDIN_IMAGE_UNAVAILABLE"
  | "LINKEDIN_UPLOAD_FAILED"
  | "LINKEDIN_PUBLICATION_FAILED"
  | "LINKEDIN_PUBLICATION_OUTCOME_UNKNOWN"
  | "LINKEDIN_PUBLICATION_IN_PROGRESS"
  | "LINKEDIN_INVALID_CONFIGURATION"
  | "LINKEDIN_INVALID_PUBLICATION";

export class LinkedInError extends Error {
  constructor(
    readonly code: LinkedInErrorCode,
    readonly status: number,
    readonly details?: string,
  ) {
    super(code);
  }
}

type Fetch = typeof globalThis.fetch;

type ConnectionRow = {
  admin_user_id: string;
  member_id: string;
  member_name: string;
  encrypted_access_token: string;
  expires_at: number;
};

type PublicationInput = {
  title: string;
  text: string;
  url: string;
  imageUrl: string;
};

type AppCredentials = {
  clientId: string;
  clientSecret: string;
};

const json = async <T>(response: Response, code: LinkedInErrorCode): Promise<T> => {
  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new LinkedInError(code, 502, details);
  }
  return response.json() as Promise<T>;
};

const tokenKey = (): Buffer =>
  createHash("sha256")
    .update(config.betterAuthSecret)
    .update("digest-linkedin-oauth-v1")
    .digest();

const encrypt = (value: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
};

const decrypt = (value: string): string => {
  const [encodedIv, encodedTag, encodedEncrypted] = value.split(".");
  if (!encodedIv || !encodedTag || !encodedEncrypted) {
    throw new LinkedInError("LINKEDIN_NOT_CONNECTED", 409);
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    tokenKey(),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedEncrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
};

const stateHash = (state: string): string =>
  createHash("sha256").update(state).digest("hex");

const safeReturnTo = (value: string | undefined): string => {
  if (!value) return "/admin";
  const target = new URL(value, config.origin);
  if (
    target.origin !== config.origin ||
    !/^\/archives\/\d{4}-\d{2}-\d{2}\/$/.test(target.pathname)
  ) {
    return "/admin";
  }
  return target.pathname;
};

export class LinkedInService {
  constructor(
    private readonly database: Database.Database,
    private readonly fetcher: Fetch = fetch,
    private readonly deadlines: LinkedInDeadlines = defaultDeadlines,
  ) {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS linkedin_oauth_states (
        state_hash TEXT PRIMARY KEY,
        admin_user_id TEXT NOT NULL,
        return_to TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS linkedin_connections (
        admin_user_id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL,
        member_name TEXT NOT NULL,
        encrypted_access_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS linkedin_app_credentials (
        admin_user_id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        encrypted_client_secret TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS linkedin_publications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archive_url TEXT NOT NULL,
        post_urn TEXT NOT NULL,
        admin_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS linkedin_publication_reservations (
        publication_url TEXT PRIMARY KEY,
        reservation_token TEXT NOT NULL,
        admin_user_id TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'reserved',
        expires_at INTEGER NOT NULL
      );
    `);
    const reservationColumns = this.database
      .prepare("PRAGMA table_info(linkedin_publication_reservations)")
      .all() as Array<{ name: string }>;
    if (!reservationColumns.some(({ name }) => name === "state")) {
      this.database.exec(
        "ALTER TABLE linkedin_publication_reservations ADD COLUMN state TEXT NOT NULL DEFAULT 'reserved'",
      );
    }
    const publicationColumns = this.database
      .prepare("PRAGMA table_info(linkedin_publications)")
      .all() as Array<{ name: string }>;
    if (!publicationColumns.some(({ name }) => name === "id")) {
      this.database.transaction(() => {
        this.database.exec(`
          ALTER TABLE linkedin_publications RENAME TO linkedin_publications_legacy;
          CREATE TABLE linkedin_publications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            archive_url TEXT NOT NULL,
            post_urn TEXT NOT NULL,
            admin_user_id TEXT NOT NULL,
            created_at INTEGER NOT NULL
          );
          INSERT INTO linkedin_publications
            (archive_url, post_urn, admin_user_id, created_at)
          SELECT archive_url, post_urn, admin_user_id, created_at
          FROM linkedin_publications_legacy;
          DROP TABLE linkedin_publications_legacy;
        `);
      })();
    }
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS linkedin_publications_url_created_at
      ON linkedin_publications (archive_url, created_at DESC, id DESC);
    `);
  }

  private async request<T>(
    input: Parameters<Fetch>[0],
    init: RequestInit,
    timeoutMs: number,
    timeoutCode: LinkedInErrorCode,
    consume: (response: Response) => Promise<T>,
  ): Promise<T> {
    try {
      return await fetchWithDeadline(
        this.fetcher,
        input,
        init,
        timeoutMs,
        consume,
      );
    } catch (error) {
      if (error instanceof NetworkDeadlineError) {
        throw new LinkedInError(timeoutCode, 504, error.message);
      }
      throw error;
    }
  }

  status(adminUserId: string) {
    const connection = this.connection(adminUserId);
    const connected = !!connection && connection.expires_at > Date.now();
    return {
      configured: !!this.credentials(adminUserId),
      connected,
      memberName: connected ? connection.member_name : null,
      expiresAt: connected ? new Date(connection.expires_at).toISOString() : null,
    };
  }

  configure(adminUserId: string, clientId: string, clientSecret: string) {
    const normalizedClientId = clientId.trim();
    const normalizedClientSecret = clientSecret.trim();
    if (
      !/^[a-zA-Z0-9_-]{6,200}$/.test(normalizedClientId) ||
      normalizedClientSecret.length < 12 ||
      normalizedClientSecret.length > 500
    ) {
      throw new LinkedInError("LINKEDIN_INVALID_CONFIGURATION", 400);
    }
    const now = Date.now();
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO linkedin_app_credentials
             (admin_user_id, client_id, encrypted_client_secret, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(admin_user_id) DO UPDATE SET
             client_id = excluded.client_id,
             encrypted_client_secret = excluded.encrypted_client_secret,
             updated_at = excluded.updated_at`,
        )
        .run(
          adminUserId,
          normalizedClientId,
          encrypt(normalizedClientSecret),
          now,
          now,
        );
      this.database
        .prepare("DELETE FROM linkedin_connections WHERE admin_user_id = ?")
        .run(adminUserId);
      this.database
        .prepare("DELETE FROM linkedin_oauth_states WHERE admin_user_id = ?")
        .run(adminUserId);
    })();
    return { configured: true, connected: false };
  }

  authorizationUrl(adminUserId: string, requestedReturnTo?: string): string {
    const credentials = this.requireConfiguration(adminUserId);
    const state = randomBytes(32).toString("base64url");
    const returnTo = safeReturnTo(requestedReturnTo);
    const expiresAt = Date.now() + STATE_LIFETIME_MS;
    this.database
      .prepare("DELETE FROM linkedin_oauth_states WHERE expires_at <= ?")
      .run(Date.now());
    this.database
      .prepare(
        `INSERT INTO linkedin_oauth_states
           (state_hash, admin_user_id, return_to, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(stateHash(state), adminUserId, returnTo, expiresAt);

    const url = new URL(LINKEDIN_AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", credentials.clientId);
    url.searchParams.set("redirect_uri", config.linkedinRedirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "openid profile w_member_social");
    return url.toString();
  }

  async completeAuthorization(
    adminUserId: string,
    state: string,
    code: string,
  ): Promise<string> {
    const credentials = this.requireConfiguration(adminUserId);
    const row = this.database
      .prepare(
        `DELETE FROM linkedin_oauth_states
         WHERE state_hash = ? AND admin_user_id = ?
         RETURNING return_to, expires_at`,
      )
      .get(stateHash(state), adminUserId) as
      | { return_to: string; expires_at: number }
      | undefined;
    if (!row || row.expires_at <= Date.now()) {
      throw new LinkedInError("LINKEDIN_INVALID_STATE", 400);
    }

    const token = await this.request(LINKEDIN_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.linkedinRedirectUri,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }),
    }, this.deadlines.write, "LINKEDIN_AUTHORIZATION_FAILED", (response) =>
      json<{ access_token: string; expires_in: number }>(
        response,
        "LINKEDIN_AUTHORIZATION_FAILED",
      ),
    );
    const userInfo = await this.request(LINKEDIN_USERINFO_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    }, this.deadlines.read, "LINKEDIN_AUTHORIZATION_FAILED", (response) =>
      json<{ sub: string; name?: string }>(
        response,
        "LINKEDIN_AUTHORIZATION_FAILED",
      ),
    );
    if (!userInfo.sub) {
      throw new LinkedInError("LINKEDIN_AUTHORIZATION_FAILED", 502);
    }

    const now = Date.now();
    this.database
      .prepare(
        `INSERT INTO linkedin_connections
           (admin_user_id, member_id, member_name, encrypted_access_token,
            expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(admin_user_id) DO UPDATE SET
           member_id = excluded.member_id,
           member_name = excluded.member_name,
           encrypted_access_token = excluded.encrypted_access_token,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at`,
      )
      .run(
        adminUserId,
        userInfo.sub,
        userInfo.name || "Compte LinkedIn",
        encrypt(token.access_token),
        now + token.expires_in * 1_000,
        now,
        now,
      );
    return row.return_to;
  }

  async publish(adminUserId: string, input: PublicationInput, republish = false) {
    return this.publishValidated(
      adminUserId,
      this.validatePublication(input),
      republish,
    );
  }

  async publishLink(adminUserId: string, input: PublicationInput, republish = false) {
    return this.publishValidated(
      adminUserId,
      this.validatePublication(input, true),
      republish,
    );
  }

  publicationStatus(adminUserId: string, rawUrl: string) {
    let publicationUrl: string;
    try {
      const candidate = new URL(rawUrl, config.origin);
      publicationUrl =
        candidate.origin === config.origin &&
        /^\/archives\/\d{4}-\d{2}-\d{2}\/$/.test(candidate.pathname)
          ? candidate.toString()
          : canonicalizePublicUrl(candidate.toString());
    } catch {
      throw new LinkedInError("LINKEDIN_INVALID_PUBLICATION", 400);
    }
    const latest = this.database
      .prepare(
        `SELECT post_urn,
           (SELECT COUNT(*)
            FROM linkedin_publications
            WHERE archive_url = ? AND admin_user_id = ?) AS publication_count
         FROM linkedin_publications
         WHERE archive_url = ? AND admin_user_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
      )
      .get(
        publicationUrl,
        adminUserId,
        publicationUrl,
        adminUserId,
      ) as { post_urn: string; publication_count: number } | undefined;
    return {
      alreadyPublished: Boolean(latest),
      publicationCount: latest?.publication_count ?? 0,
      latestPostUrl: latest ? this.postUrl(latest.post_urn) : null,
    };
  }

  private async publishValidated(
    adminUserId: string,
    validated: PublicationInput,
    republish: boolean,
  ) {
    this.requireConfiguration(adminUserId);
    const reservation = this.reservePublication(adminUserId, validated.url, republish);
    if (reservation.previousPostUrn) {
      return {
        postUrn: reservation.previousPostUrn,
        postUrl: this.postUrl(reservation.previousPostUrn),
        alreadyPublished: true,
        publicationCount: reservation.publicationCount,
      };
    }
    if (reservation.outcomeUnknown) {
      throw new LinkedInError("LINKEDIN_PUBLICATION_OUTCOME_UNKNOWN", 409);
    }
    if (!reservation.token) {
      throw new LinkedInError("LINKEDIN_PUBLICATION_IN_PROGRESS", 409);
    }

    const renewal = setInterval(() => {
      try {
        this.renewPublication(validated.url, reservation.token!);
      } catch (error) {
        console.error("LinkedIn publication reservation renewal failed", error);
      }
    }, PUBLICATION_RESERVATION_RENEWAL_MS);
    renewal.unref();
    let submissionStarted = false;
    try {
      const postUrn = await this.createLinkedInPost(
        adminUserId,
        validated,
        () => {
          this.markPublicationSubmitting(validated.url, reservation.token!);
          submissionStarted = true;
        },
      );
      const publicationCount = this.finishPublication(
        validated.url,
        reservation.token,
        postUrn,
        adminUserId,
      );
      return {
        postUrn,
        postUrl: this.postUrl(postUrn),
        alreadyPublished: false,
        publicationCount,
      };
    } catch (error) {
      const definitiveRemoteFailure =
        error instanceof LinkedInError &&
        ["LINKEDIN_TOKEN_EXPIRED", "LINKEDIN_PUBLICATION_FAILED"].includes(
          error.code,
        );
      if (!submissionStarted || definitiveRemoteFailure) {
        this.releasePublication(validated.url, reservation.token);
      }
      if (submissionStarted && !definitiveRemoteFailure) {
        throw new LinkedInError(
          "LINKEDIN_PUBLICATION_OUTCOME_UNKNOWN",
          409,
        );
      }
      throw error;
    } finally {
      clearInterval(renewal);
    }
  }

  private async createLinkedInPost(
    adminUserId: string,
    validated: PublicationInput,
    beforeSubmit: () => void,
  ): Promise<string> {
    const connection = this.connection(adminUserId);
    if (!connection) throw new LinkedInError("LINKEDIN_NOT_CONNECTED", 409);
    if (connection.expires_at <= Date.now()) {
      throw new LinkedInError("LINKEDIN_TOKEN_EXPIRED", 409);
    }
    const accessToken = decrypt(connection.encrypted_access_token);
    const image = await this.request(validated.imageUrl, {
      headers: { "User-Agent": "digest-linkedin-publisher" },
    }, this.deadlines.read, "LINKEDIN_IMAGE_UNAVAILABLE", async (response) => {
      if (!response.ok) {
        throw new LinkedInError("LINKEDIN_IMAGE_UNAVAILABLE", 502);
      }
      return response.arrayBuffer();
    });
    if (!image.byteLength || image.byteLength > 10 * 1024 * 1024) {
      throw new LinkedInError("LINKEDIN_IMAGE_UNAVAILABLE", 502);
    }

    const author = `urn:li:person:${connection.member_id}`;
    const registered = await this.request(LINKEDIN_ASSETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: author,
          supportedUploadMechanism: ["SYNCHRONOUS_UPLOAD"],
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    }, this.deadlines.write, "LINKEDIN_UPLOAD_FAILED", async (response) => {
      if (response.status === 401) {
        throw new LinkedInError("LINKEDIN_TOKEN_EXPIRED", 409);
      }
      return json<{
      value: {
        uploadMechanism: {
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
            uploadUrl: string;
          };
        };
        asset: string;
      };
      }>(response, "LINKEDIN_UPLOAD_FAILED");
    });
    const upload =
      registered.value?.uploadMechanism?.[
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
      ];
    if (!upload?.uploadUrl || !registered.value.asset) {
      throw new LinkedInError("LINKEDIN_UPLOAD_FAILED", 502);
    }

    await this.request(upload.uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "image/png",
      },
      body: image,
    }, this.deadlines.upload, "LINKEDIN_UPLOAD_FAILED", async (response) => {
      if (response.status === 401) {
        throw new LinkedInError("LINKEDIN_TOKEN_EXPIRED", 409);
      }
      if (!response.ok) {
        throw new LinkedInError(
          "LINKEDIN_UPLOAD_FAILED",
          502,
          (await response.text()).slice(0, 500),
        );
      }
    });

    beforeSubmit();
    return this.request(LINKEDIN_POSTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: `${validated.text}\n\n${validated.url}` },
            shareMediaCategory: "IMAGE",
            media: [
              {
                status: "READY",
                media: registered.value.asset,
                title: { text: validated.title },
              },
            ],
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      }),
    }, this.deadlines.write, "LINKEDIN_PUBLICATION_OUTCOME_UNKNOWN", async (response) => {
      if (response.status === 401) {
        throw new LinkedInError("LINKEDIN_TOKEN_EXPIRED", 409);
      }
      if (response.status !== 201) {
        const outcomeUnknown =
          response.status < 400 ||
          response.status >= 500 ||
          response.status === 408;
        if (!outcomeUnknown) {
          throw new LinkedInError("LINKEDIN_PUBLICATION_FAILED", 502);
        }
        throw new LinkedInError(
          "LINKEDIN_PUBLICATION_OUTCOME_UNKNOWN",
          409,
          (await response.text()).slice(0, 500),
        );
      }
      const postUrn = response.headers.get("x-restli-id");
      if (!postUrn) {
        throw new LinkedInError("LINKEDIN_PUBLICATION_OUTCOME_UNKNOWN", 409);
      }
      return postUrn;
    });
  }

  private reservePublication(
    adminUserId: string,
    publicationUrl: string,
    republish: boolean,
  ): {
    token?: string;
    previousPostUrn?: string;
    publicationCount?: number;
    outcomeUnknown?: boolean;
  } {
    return this.database.transaction(() => {
      const now = Date.now();
      this.database
        .prepare(
          `DELETE FROM linkedin_publication_reservations
           WHERE expires_at <= ? AND state = 'reserved'`,
        )
        .run(now);
      const unresolved = this.database
        .prepare(
          `SELECT state FROM linkedin_publication_reservations
           WHERE publication_url = ?`,
        )
        .get(publicationUrl) as { state: string } | undefined;
      if (unresolved?.state === "submitting") return { outcomeUnknown: true };
      const previous = this.database
        .prepare(
          `SELECT post_urn,
             (SELECT COUNT(*) FROM linkedin_publications WHERE archive_url = ?) AS publication_count
           FROM linkedin_publications
           WHERE archive_url = ?
           ORDER BY created_at DESC, id DESC
           LIMIT 1`,
        )
        .get(publicationUrl, publicationUrl) as
          | { post_urn: string; publication_count: number }
          | undefined;
      if (previous && !republish) {
        return {
          previousPostUrn: previous.post_urn,
          publicationCount: previous.publication_count,
        };
      }
      const token = randomBytes(24).toString("base64url");
      const inserted = this.database
        .prepare(
          `INSERT OR IGNORE INTO linkedin_publication_reservations
             (publication_url, reservation_token, admin_user_id, expires_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(
          publicationUrl,
          token,
          adminUserId,
          now + PUBLICATION_RESERVATION_LIFETIME_MS,
        );
      return inserted.changes === 1 ? { token } : {};
    })();
  }

  private markPublicationSubmitting(
    publicationUrl: string,
    reservationToken: string,
  ): void {
    const updated = this.database
      .prepare(
        `UPDATE linkedin_publication_reservations
         SET state = 'submitting'
         WHERE publication_url = ? AND reservation_token = ? AND state = 'reserved'`,
      )
      .run(publicationUrl, reservationToken);
    if (updated.changes !== 1) {
      throw new LinkedInError("LINKEDIN_PUBLICATION_IN_PROGRESS", 409);
    }
  }

  private renewPublication(
    publicationUrl: string,
    reservationToken: string,
  ): void {
    this.database
      .prepare(
        `UPDATE linkedin_publication_reservations
         SET expires_at = ?
         WHERE publication_url = ? AND reservation_token = ?`,
      )
      .run(
        Date.now() + PUBLICATION_RESERVATION_LIFETIME_MS,
        publicationUrl,
        reservationToken,
      );
  }

  private finishPublication(
    publicationUrl: string,
    reservationToken: string,
    postUrn: string,
    adminUserId: string,
  ): number {
    return this.database.transaction(() => {
      const reservation = this.database
        .prepare(
          `SELECT reservation_token FROM linkedin_publication_reservations
           WHERE publication_url = ?`,
        )
        .get(publicationUrl) as { reservation_token: string } | undefined;
      if (reservation?.reservation_token !== reservationToken) {
        throw new LinkedInError("LINKEDIN_PUBLICATION_IN_PROGRESS", 409);
      }
      this.database
        .prepare(
          `INSERT INTO linkedin_publications
             (archive_url, post_urn, admin_user_id, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(publicationUrl, postUrn, adminUserId, Date.now());
      this.database
        .prepare(
          `DELETE FROM linkedin_publication_reservations
           WHERE publication_url = ? AND reservation_token = ?`,
        )
        .run(publicationUrl, reservationToken);
      const count = this.database
        .prepare(
          "SELECT COUNT(*) AS publication_count FROM linkedin_publications WHERE archive_url = ?",
        )
        .get(publicationUrl) as { publication_count: number };
      return count.publication_count;
    })();
  }

  private releasePublication(
    publicationUrl: string,
    reservationToken: string,
  ): void {
    this.database
      .prepare(
        `DELETE FROM linkedin_publication_reservations
         WHERE publication_url = ? AND reservation_token = ?`,
      )
      .run(publicationUrl, reservationToken);
  }

  private connection(adminUserId: string): ConnectionRow | undefined {
    return this.database
      .prepare("SELECT * FROM linkedin_connections WHERE admin_user_id = ?")
      .get(adminUserId) as ConnectionRow | undefined;
  }

  private credentials(adminUserId: string): AppCredentials | null {
    const row = this.database
      .prepare(
        `SELECT client_id, encrypted_client_secret
         FROM linkedin_app_credentials WHERE admin_user_id = ?`,
      )
      .get(adminUserId) as
      | { client_id: string; encrypted_client_secret: string }
      | undefined;
    if (row) {
      return {
        clientId: row.client_id,
        clientSecret: decrypt(row.encrypted_client_secret),
      };
    }
    return config.linkedinClientId && config.linkedinClientSecret
      ? {
          clientId: config.linkedinClientId,
          clientSecret: config.linkedinClientSecret,
        }
      : null;
  }

  private requireConfiguration(adminUserId: string): AppCredentials {
    const credentials = this.credentials(adminUserId);
    if (!credentials) {
      throw new LinkedInError("LINKEDIN_NOT_CONFIGURED", 503);
    }
    return credentials;
  }

  private validatePublication(
    input: PublicationInput,
    allowCatalogUrl = false,
  ): PublicationInput {
    const title = input.title?.trim();
    const text = input.text?.trim();
    if (
      !title ||
      title.length > 200 ||
      !text ||
      text.length > MAX_COMMENTARY_LENGTH
    ) {
      throw new LinkedInError("LINKEDIN_INVALID_PUBLICATION", 400);
    }
    let url: URL;
    let imageUrl: URL;
    try {
      url = new URL(input.url, config.origin);
      imageUrl = new URL(input.imageUrl, config.origin);
    } catch {
      throw new LinkedInError("LINKEDIN_INVALID_PUBLICATION", 400);
    }
    const archiveImage = /^\/social\/\d{4}-\d{2}-\d{2}(?:-linkedin)?\.png$/.test(
      imageUrl.pathname,
    );
    const linkImage =
      allowCatalogUrl &&
      /^\/api\/linkedin-images\/[0-9a-f-]{36}-[0-9a-f]{16}\.png$/.test(
        imageUrl.pathname,
      );
    if (
      imageUrl.origin !== config.origin ||
      (allowCatalogUrl ? !linkImage : !archiveImage)
    ) {
      throw new LinkedInError("LINKEDIN_INVALID_PUBLICATION", 400);
    }
    if (!allowCatalogUrl &&
        (url.origin !== config.origin ||
         !/^\/archives\/\d{4}-\d{2}-\d{2}\/$/.test(url.pathname))) {
      throw new LinkedInError("LINKEDIN_INVALID_PUBLICATION", 400);
    }
    if (allowCatalogUrl) {
      try {
        url = new URL(canonicalizePublicUrl(url.toString()));
      } catch {
        throw new LinkedInError("LINKEDIN_INVALID_PUBLICATION", 400);
      }
    }
    if (`${text}\n\n${url.toString()}`.length > MAX_COMMENTARY_LENGTH) {
      throw new LinkedInError("LINKEDIN_INVALID_PUBLICATION", 400);
    }
    return {
      title,
      text,
      url: url.toString(),
      imageUrl: imageUrl.toString(),
    };
  }

  private postUrl(postUrn: string): string {
    return `https://www.linkedin.com/feed/update/${postUrn}`;
  }
}

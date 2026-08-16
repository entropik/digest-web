import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type Database from "better-sqlite3";
import { config } from "./config.js";

const LINKEDIN_AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const LINKEDIN_ASSETS_URL = "https://api.linkedin.com/v2/assets?action=registerUpload";
const LINKEDIN_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";
const STATE_LIFETIME_MS = 10 * 60 * 1_000;

export type LinkedInErrorCode =
  | "LINKEDIN_NOT_CONFIGURED"
  | "LINKEDIN_INVALID_STATE"
  | "LINKEDIN_AUTHORIZATION_FAILED"
  | "LINKEDIN_NOT_CONNECTED"
  | "LINKEDIN_TOKEN_EXPIRED"
  | "LINKEDIN_IMAGE_UNAVAILABLE"
  | "LINKEDIN_UPLOAD_FAILED"
  | "LINKEDIN_PUBLICATION_FAILED"
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
      CREATE TABLE IF NOT EXISTS linkedin_publications (
        archive_url TEXT PRIMARY KEY,
        post_urn TEXT NOT NULL,
        admin_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  get configured(): boolean {
    return !!config.linkedinClientId && !!config.linkedinClientSecret;
  }

  status(adminUserId: string) {
    const connection = this.connection(adminUserId);
    const connected = !!connection && connection.expires_at > Date.now();
    return {
      configured: this.configured,
      connected,
      memberName: connected ? connection.member_name : null,
      expiresAt: connected ? new Date(connection.expires_at).toISOString() : null,
    };
  }

  authorizationUrl(adminUserId: string, requestedReturnTo?: string): string {
    this.requireConfiguration();
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
    url.searchParams.set("client_id", config.linkedinClientId!);
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
    this.requireConfiguration();
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

    const tokenResponse = await this.fetcher(LINKEDIN_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.linkedinRedirectUri,
        client_id: config.linkedinClientId!,
        client_secret: config.linkedinClientSecret!,
      }),
    });
    const token = await json<{ access_token: string; expires_in: number }>(
      tokenResponse,
      "LINKEDIN_AUTHORIZATION_FAILED",
    );
    const userInfoResponse = await this.fetcher(LINKEDIN_USERINFO_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const userInfo = await json<{ sub: string; name?: string }>(
      userInfoResponse,
      "LINKEDIN_AUTHORIZATION_FAILED",
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

  async publish(adminUserId: string, input: PublicationInput) {
    this.requireConfiguration();
    const validated = this.validatePublication(input);
    const previous = this.database
      .prepare("SELECT post_urn FROM linkedin_publications WHERE archive_url = ?")
      .get(validated.url) as { post_urn: string } | undefined;
    if (previous) {
      return {
        postUrn: previous.post_urn,
        postUrl: this.postUrl(previous.post_urn),
        alreadyPublished: true,
      };
    }

    const connection = this.connection(adminUserId);
    if (!connection) throw new LinkedInError("LINKEDIN_NOT_CONNECTED", 409);
    if (connection.expires_at <= Date.now()) {
      throw new LinkedInError("LINKEDIN_TOKEN_EXPIRED", 409);
    }
    const accessToken = decrypt(connection.encrypted_access_token);
    const imageResponse = await this.fetcher(validated.imageUrl, {
      headers: { "User-Agent": "digest-linkedin-publisher" },
    });
    if (!imageResponse.ok) {
      throw new LinkedInError("LINKEDIN_IMAGE_UNAVAILABLE", 502);
    }
    const image = await imageResponse.arrayBuffer();
    if (!image.byteLength || image.byteLength > 10 * 1024 * 1024) {
      throw new LinkedInError("LINKEDIN_IMAGE_UNAVAILABLE", 502);
    }

    const author = `urn:li:person:${connection.member_id}`;
    const registerResponse = await this.fetcher(LINKEDIN_ASSETS_URL, {
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
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    });
    if (registerResponse.status === 401) {
      throw new LinkedInError("LINKEDIN_TOKEN_EXPIRED", 409);
    }
    const registered = await json<{
      value: {
        uploadMechanism: {
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
            uploadUrl: string;
          };
        };
        asset: string;
      };
    }>(registerResponse, "LINKEDIN_UPLOAD_FAILED");
    const upload =
      registered.value?.uploadMechanism?.[
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
      ];
    if (!upload?.uploadUrl || !registered.value.asset) {
      throw new LinkedInError("LINKEDIN_UPLOAD_FAILED", 502);
    }

    const uploadResponse = await this.fetcher(upload.uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "image/png",
      },
      body: image,
    });
    if (uploadResponse.status === 401) {
      throw new LinkedInError("LINKEDIN_TOKEN_EXPIRED", 409);
    }
    if (!uploadResponse.ok) {
      throw new LinkedInError(
        "LINKEDIN_UPLOAD_FAILED",
        502,
        (await uploadResponse.text()).slice(0, 500),
      );
    }

    const postResponse = await this.fetcher(LINKEDIN_POSTS_URL, {
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
                description: { text: validated.text },
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
    });
    if (postResponse.status === 401) {
      throw new LinkedInError("LINKEDIN_TOKEN_EXPIRED", 409);
    }
    if (postResponse.status !== 201) {
      throw new LinkedInError(
        "LINKEDIN_PUBLICATION_FAILED",
        502,
        (await postResponse.text()).slice(0, 500),
      );
    }
    const postUrn = postResponse.headers.get("x-restli-id");
    if (!postUrn) throw new LinkedInError("LINKEDIN_PUBLICATION_FAILED", 502);
    this.database
      .prepare(
        `INSERT INTO linkedin_publications
           (archive_url, post_urn, admin_user_id, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(validated.url, postUrn, adminUserId, Date.now());
    return {
      postUrn,
      postUrl: this.postUrl(postUrn),
      alreadyPublished: false,
    };
  }

  private connection(adminUserId: string): ConnectionRow | undefined {
    return this.database
      .prepare("SELECT * FROM linkedin_connections WHERE admin_user_id = ?")
      .get(adminUserId) as ConnectionRow | undefined;
  }

  private requireConfiguration(): void {
    if (!this.configured) {
      throw new LinkedInError("LINKEDIN_NOT_CONFIGURED", 503);
    }
  }

  private validatePublication(input: PublicationInput): PublicationInput {
    const title = input.title?.trim();
    const text = input.text?.trim();
    if (!title || title.length > 200 || !text || text.length > 1_500) {
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
    if (
      url.origin !== config.origin ||
      imageUrl.origin !== config.origin ||
      !/^\/archives\/\d{4}-\d{2}-\d{2}\/$/.test(url.pathname) ||
      !/^\/social\/\d{4}-\d{2}-\d{2}\.png$/.test(imageUrl.pathname)
    ) {
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

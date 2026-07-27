import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { config } from "./config.js";

mkdirSync(dirname(config.databasePath), { recursive: true });

export const authDatabase = new Database(config.databasePath);
authDatabase.pragma("journal_mode = WAL");
authDatabase.pragma("foreign_keys = ON");

export const auth = betterAuth({
  appName: "Digest Admin",
  baseURL: config.baseUrl,
  secret: config.betterAuthSecret,
  trustedOrigins: [config.origin],
  database: authDatabase,
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    github: {
      clientId: config.githubClientId,
      clientSecret: config.githubClientSecret,
    },
  },
  advanced: {
    cookiePrefix: "digest-admin",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.nodeEnv === "production",
    },
  },
});

export type AdminSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

export const getAdminSession = async (
  headers: Headers,
): Promise<AdminSession | null> => {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const accounts = await auth.api.listUserAccounts({ headers });
  const isOwner = accounts.some(
    (account) =>
      account.providerId === "github" &&
      String(account.accountId) === config.adminGithubId,
  );
  return isOwner ? session : null;
};

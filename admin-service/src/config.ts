import "dotenv/config";
import { dirname, resolve } from "node:path";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const positiveInteger = (name: string, fallback?: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw && fallback !== undefined) return fallback;
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
};

const baseUrl = required("BETTER_AUTH_URL").replace(/\/+$/, "");
const base = new URL(baseUrl);
if (base.protocol !== "https:" && process.env.NODE_ENV === "production") {
  throw new Error("BETTER_AUTH_URL must use HTTPS in production");
}

const configuredExtensionOrigins = [
  process.env.CHROME_EXTENSION_ORIGINS,
  process.env.FIREFOX_EXTENSION_ORIGINS,
]
  .filter((value): value is string => !!value)
  .flatMap((value) => value.split(","))
  .map((value) => value.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const chromeExtensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/;
const firefoxExtensionOrigin =
  /^moz-extension:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

for (const origin of configuredExtensionOrigins) {
  if (!chromeExtensionOrigin.test(origin) && !firefoxExtensionOrigin.test(origin)) {
    throw new Error(
      "Extension origins must be exact chrome-extension or moz-extension origins",
    );
  }
}
const extensionOrigins = [...new Set(configuredExtensionOrigins)];

const linkedinClientId = process.env.LINKEDIN_CLIENT_ID?.trim() || null;
const linkedinClientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim() || null;
if (!!linkedinClientId !== !!linkedinClientSecret) {
  throw new Error(
    "LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must be configured together",
  );
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: positiveInteger("PORT", 3210),
  baseUrl,
  origin: base.origin,
  databasePath: resolve(required("BETTER_AUTH_DATABASE")),
  betterAuthSecret: required("BETTER_AUTH_SECRET"),
  githubClientId: required("GITHUB_CLIENT_ID"),
  githubClientSecret: required("GITHUB_CLIENT_SECRET"),
  githubAppId: positiveInteger("GITHUB_APP_ID"),
  githubInstallationId: positiveInteger("GITHUB_APP_INSTALLATION_ID"),
  githubPrivateKey: Buffer.from(
    required("GITHUB_APP_PRIVATE_KEY_BASE64"),
    "base64",
  ).toString("utf8"),
  repositoryOwner: process.env.GITHUB_REPOSITORY_OWNER?.trim() || "entropik",
  repositoryName: process.env.GITHUB_REPOSITORY_NAME?.trim() || "digest-web",
  repositoryBranch: process.env.GITHUB_REPOSITORY_BRANCH?.trim() || "main",
  adminGithubId: process.env.ADMIN_GITHUB_ID?.trim() || "1025402",
  linkedinClientId,
  linkedinClientSecret,
  linkedinRedirectUri: `${base.origin}/api/admin/linkedin/callback`,
  linkedinCaptureDirectory: resolve(
    process.env.LINKEDIN_CAPTURE_DIRECTORY?.trim() ||
      resolve(dirname(required("BETTER_AUTH_DATABASE")), "linkedin-captures"),
  ),
  extensionOrigins,
  allowedOrigins: [base.origin, ...extensionOrigins],
} as const;

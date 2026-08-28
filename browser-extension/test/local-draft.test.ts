import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import {
  canonicalLocalDraftUrl,
  clearLocalDraft,
  loadLocalDraft,
  LOCAL_DRAFT_TTL_MS,
  pruneExpiredLocalDrafts,
  saveLocalDraft,
  type LocalDraftFields,
  type LocalStorageArea,
} from "../lib/local-draft";

type UrlFixture = {
  name: string;
  input: string;
  error?: boolean;
};

const sharedUrlFixtures = JSON.parse(
  readFileSync(
    new URL("../../test-fixtures/url-canonicalization.json", import.meta.url),
    "utf8",
  ),
) as UrlFixture[];

const fields: LocalDraftFields = {
  url: "https://example.com/article",
  title: "Titre corrigé",
  category: "Design",
  description: "Résumé corrigé",
  tags: ["design", "outil"],
  privateNote: "Note privée locale",
};

let values: Record<string, unknown>;
let storage: LocalStorageArea;

beforeEach(() => {
  values = {};
  storage = {
    get: async (keys = null) => {
      if (keys === null) return { ...values };
      const requested = typeof keys === "string" ? [keys] : keys;
      if (Array.isArray(requested)) {
        return Object.fromEntries(
          requested
            .filter((key) => key in values)
            .map((key) => [key, values[key]]),
        );
      }
      return { ...requested, ...values };
    },
    set: async (items) => {
      Object.assign(values, items);
    },
    remove: async (keys) => {
      for (const key of typeof keys === "string" ? [keys] : keys) {
        delete values[key];
      }
    },
  };
});

describe("temporary local drafts", () => {
  test.each(sharedUrlFixtures)(
    "matches the shared server decision: $name",
    ({ input, error }) => {
      if (error) {
        expect(() => canonicalLocalDraftUrl(input)).toThrow("SENSITIVE_URL");
      } else {
        expect(() => canonicalLocalDraftUrl(input)).not.toThrow();
      }
    },
  );

  test("restores recent fields through the canonical URL", async () => {
    await saveLocalDraft(
      storage,
      "https://EXAMPLE.com/article/?utm_source=test",
      fields,
      1_000,
    );

    await expect(
      loadLocalDraft(storage, "https://example.com/article/", 2_000),
    ).resolves.toEqual(fields);
  });

  test("never restores a draft for another URL", async () => {
    await saveLocalDraft(storage, "https://example.com/first", fields, 1_000);

    await expect(
      loadLocalDraft(storage, "https://example.com/second", 2_000),
    ).resolves.toBeNull();
  });

  test.each([
    ["https://example.com/report", "https://example.com/report/"],
    ["https://example.com/a/b", "https://example.com/a//b"],
  ])("keeps distinct path structures isolated: %s / %s", async (first, second) => {
    await saveLocalDraft(storage, first, fields, 1_000);

    await expect(loadLocalDraft(storage, second, 2_000)).resolves.toBeNull();
  });

  test("expires and removes a draft after 24 hours", async () => {
    await saveLocalDraft(storage, "https://example.com/article", fields, 1_000);

    await expect(
      loadLocalDraft(
        storage,
        "https://example.com/article",
        1_000 + LOCAL_DRAFT_TTL_MS,
      ),
    ).resolves.toBeNull();
    expect(values).toEqual({});
  });

  test("clears a saved draft after successful publication", async () => {
    await saveLocalDraft(storage, "https://example.com/article", fields, 1_000);
    await clearLocalDraft(storage, "https://example.com/article");

    await expect(
      loadLocalDraft(storage, "https://example.com/article", 2_000),
    ).resolves.toBeNull();
  });

  test("prunes expired entries without touching unrelated local data", async () => {
    await saveLocalDraft(storage, "https://example.com/old", fields, 1_000);
    await saveLocalDraft(
      storage,
      "https://example.com/recent",
      fields,
      LOCAL_DRAFT_TTL_MS,
    );
    values.preferences = { compact: true };

    await pruneExpiredLocalDrafts(storage, LOCAL_DRAFT_TTL_MS + 1_000);

    expect(Object.keys(values)).toHaveLength(2);
    expect(values.preferences).toEqual({ compact: true });
    await expect(
      loadLocalDraft(
        storage,
        "https://example.com/recent",
        LOCAL_DRAFT_TTL_MS + 1_000,
      ),
    ).resolves.toEqual(fields);
  });

  test("keeps meaningful fragments but removes presentation fragments", () => {
    expect(
      canonicalLocalDraftUrl("https://example.com/article/#comments"),
    ).toBe("https://example.com/article/#comments");
    expect(
      canonicalLocalDraftUrl("https://example.com/article/#fullscreen"),
    ).toBe("https://example.com/article/");
  });

  test.each([
    "https://example.com/login",
    "https://example.com/wp-admin/post.php",
    "https://example.com/cms-admin/editor",
    "https://example.com/wp-login.php",
    "https://example.com/staging-wp-admin/post.php",
    "https://example.com/foo-bar-login.php",
    "https://example.com/article?session_token=secret",
    "https://example.com/article?oauth_code=secret",
    "https://example.com/callback#access_token=secret",
    "https://example.com/#/callback?session_token=secret",
    "https://example.com/#/admin",
    "https://example.com/#/oauth/callback/SECRET",
    "https://example.com/callback?accessToken=SECRET",
    "https://example.com/callback?apiKey=SECRET",
    "https://example.com/callback?apikey=SECRET",
    "https://example.com/#accessToken=SECRET",
    "https://example.com/%61dmin",
    "https://example.com/%2561dmin",
    "https://example.com/#/%61dmin",
    "https://user:password@example.com/article",
    "http://localhost/article",
    "http://localhost./article",
    "http://app.localhost/article",
    "http://app.localhost./article",
    "https://example.com/reset-password/SECRET",
    "https://example.com/invitations/SECRET",
    "https://example.com/callback?ticket=SECRET",
    "https://example.com/callback?tickets=SECRET",
    "https://example.com/callback?ticket_id=SECRET",
    "http://[::ffff:127.0.0.1]/article",
    "http://[ff02::1]/article",
    "http://[fec0::1]/article",
    "http://[feff::1]/article",
  ])("rejects sensitive URL data before local persistence: %s", async (url) => {
    await expect(saveLocalDraft(storage, url, fields)).rejects.toThrow(
      "SENSITIVE_URL",
    );
    expect(values).toEqual({});
  });

  test("keys an edited URL by the stable captured-page identity", async () => {
    await saveLocalDraft(
      storage,
      "https://example.com/captured",
      {
        ...fields,
        url: "https://example.com/corrected/?utm_source=verbatim",
      },
      1_000,
    );

    await expect(
      loadLocalDraft(storage, "https://example.com/captured", 2_000),
    ).resolves.toEqual({
      ...fields,
      url: "https://example.com/corrected/?utm_source=verbatim",
    });
    await expect(
      loadLocalDraft(storage, "https://example.com/corrected", 2_000),
    ).resolves.toBeNull();
  });
});

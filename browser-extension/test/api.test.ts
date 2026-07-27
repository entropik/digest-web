import { describe, expect, test, vi } from "vitest";
import { DigestApiError, requestJson } from "../lib/api";

describe("Digest API client", () => {
  test("does not impose a timeout unless the caller requests one", async () => {
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const fetchImpl = vi.fn(async () =>
      Response.json({ ok: true }),
    ) as typeof fetch;

    await expect(
      requestJson(
        "https://digest.ooblik.com",
        "/api/admin/curation/drafts",
        {
          method: "POST",
        },
        {
          fetchImpl,
        },
      ),
    ).resolves.toEqual({ ok: true });
    expect(timeoutSpy).not.toHaveBeenCalled();
    timeoutSpy.mockRestore();
  });

  test("turns a stalled request into an explicit timeout", async () => {
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    ) as typeof fetch;

    await expect(
      requestJson("https://digest.ooblik.com", "/api/admin/session", {}, {
        fetchImpl,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
  });

  test("keeps the timeout classification when the JSON body stalls", async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        ({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () => {
                reject(new DOMException("Aborted", "AbortError"));
              });
            }),
        }) as Response,
    ) as typeof fetch;

    await expect(
      requestJson("https://digest.ooblik.com", "/api/admin/session", {}, {
        fetchImpl,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
  });

  test("preserves API error codes and statuses", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 }),
    ) as typeof fetch;

    await expect(
      requestJson("https://digest.ooblik.com", "/api/admin/session", {}, {
        fetchImpl,
      }),
    ).rejects.toEqual(
      new DigestApiError("AUTHENTICATION_REQUIRED", 401, undefined),
    );
  });

  test("classifies a fetch failure as a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    await expect(
      requestJson("https://digest.ooblik.com", "/api/admin/session", {}, {
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      code: "NETWORK_UNAVAILABLE",
    });
  });
});

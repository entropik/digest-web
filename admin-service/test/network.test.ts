import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchWithDeadline,
  NetworkDeadlineError,
  withDeadline,
} from "../src/network.js";

test("network deadlines abort stalled requests with a typed error", async () => {
  let aborted = false;
  const stalled = (_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new DOMException("Aborted", "AbortError"));
      });
    });

  await assert.rejects(
    fetchWithDeadline(
      stalled as typeof fetch,
      "https://example.test",
      {},
      10,
      async (response) => response,
    ),
    (error: unknown) =>
      error instanceof NetworkDeadlineError && error.timeoutMs === 10,
  );
  assert.equal(aborted, true);
});

test("non-fetch network operations also have an explicit deadline", async () => {
  await assert.rejects(
    withDeadline(() => new Promise<never>(() => undefined), 10),
    (error: unknown) =>
      error instanceof NetworkDeadlineError && error.timeoutMs === 10,
  );
});

test("caller cancellation remains distinct from a deadline", async () => {
  const controller = new AbortController();
  const stalled = (_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      if (init?.signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
    });
  controller.abort();

  await assert.rejects(
    fetchWithDeadline(
      stalled as typeof fetch,
      "https://example.test",
      { signal: controller.signal },
      100,
      async (response) => response,
    ),
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
});

test("the deadline remains active while consuming the response body", async () => {
  let bodyAborted = false;
  const fetcher = async (_input: string | URL | Request, init?: RequestInit) =>
    new Response(
      new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => {
            bodyAborted = true;
            controller.error(new DOMException("Aborted", "AbortError"));
          });
        },
      }),
    );

  await assert.rejects(
    fetchWithDeadline(
      fetcher as typeof fetch,
      "https://example.test",
      {},
      10,
      (response) => response.text(),
    ),
    NetworkDeadlineError,
  );
  assert.equal(bodyAborted, true);
});

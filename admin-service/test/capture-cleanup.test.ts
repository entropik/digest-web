import assert from "node:assert/strict";
import test from "node:test";
import { withCaptureCleanup } from "../src/link-social-image.js";

test("capture cleanup attempts browser and proxy independently", async () => {
  const primary = new Error("capture failed");
  const calls: string[] = [];
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    await assert.rejects(
      withCaptureCleanup(
        {
          closeBrowser: async () => {
            calls.push("browser");
            throw new Error("browser close failed");
          },
          closeProxy: async () => {
            calls.push("proxy");
          },
        },
        async () => {
          throw primary;
        },
        20,
      ),
      (error: unknown) => error === primary,
    );
  } finally {
    console.error = originalConsoleError;
  }
  assert.deepEqual(calls.sort(), ["browser", "proxy"]);
});

test("capture cleanup is bounded even if one resource never closes", async () => {
  let proxyClosed = false;
  await assert.rejects(
    withCaptureCleanup(
      {
        closeBrowser: () => new Promise<void>(() => undefined),
        closeProxy: async () => {
          proxyClosed = true;
        },
      },
      async () => Buffer.from("captured"),
      10,
    ),
    (error: unknown) =>
      error instanceof AggregateError && error.message === "CAPTURE_CLEANUP_FAILED",
  );
  assert.equal(proxyClosed, true);
});

test("successful capture reports every cleanup failure", async () => {
  await assert.rejects(
    withCaptureCleanup(
      {
        closeBrowser: async () => {
          throw new Error("browser close failed");
        },
        closeProxy: async () => {
          throw new Error("proxy close failed");
        },
      },
      async () => "captured",
      20,
    ),
    (error: unknown) =>
      error instanceof AggregateError && error.errors.length === 2,
  );
});

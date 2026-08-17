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
          forceCloseBrowser: async () => {
            calls.push("browser-force");
          },
          forceCloseProxy: async () => {
            calls.push("proxy-force");
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
  assert.deepEqual(calls.sort(), ["browser", "browser-force", "proxy"]);
});

test("capture cleanup is bounded even if one resource never closes", async () => {
  let proxyClosed = false;
  let browserKilled = false;
  const result = await withCaptureCleanup(
    {
      closeBrowser: () => new Promise<void>(() => undefined),
      closeProxy: async () => {
        proxyClosed = true;
      },
      forceCloseBrowser: async () => {
        browserKilled = true;
      },
      forceCloseProxy: async () => undefined,
    },
    async () => Buffer.from("captured"),
    10,
  );
  assert.equal(result.toString(), "captured");
  assert.equal(browserKilled, true);
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
        forceCloseBrowser: async () => {
          throw new Error("browser kill failed");
        },
        forceCloseProxy: async () => {
          throw new Error("proxy force close failed");
        },
      },
      async () => "captured",
      20,
    ),
    (error: unknown) =>
      error instanceof AggregateError && error.errors.length === 2,
  );
});

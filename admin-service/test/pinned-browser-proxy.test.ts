import assert from "node:assert/strict";
import test from "node:test";
import { PinnedAddressBook } from "../src/pinned-browser-proxy.js";

test("a hostname is resolved once and remains pinned to its validated address", async () => {
  let calls = 0;
  const addresses = new PinnedAddressBook(async () => {
    calls += 1;
    return calls === 1
      ? [{ address: "203.0.113.20", family: 4 }]
      : [{ address: "127.0.0.1", family: 4 }];
  });

  assert.deepEqual(await addresses.resolve("example.test"), {
    address: "203.0.113.20",
    family: 4,
  });
  assert.deepEqual(await addresses.resolve("EXAMPLE.test."), {
    address: "203.0.113.20",
    family: 4,
  });
  assert.equal(calls, 1);
});

test("private or mixed DNS answers are never approved", async () => {
  const privateOnly = new PinnedAddressBook(async () => [
    { address: "192.168.1.10", family: 4 },
  ]);
  await assert.rejects(
    privateOnly.resolve("private.example"),
    /UNSAFE_SCREENSHOT_DESTINATION/,
  );

  const mixed = new PinnedAddressBook(async () => [
    { address: "203.0.113.20", family: 4 },
    { address: "10.0.0.5", family: 4 },
  ]);
  await assert.rejects(
    mixed.resolve("rebinding.example"),
    /UNSAFE_SCREENSHOT_DESTINATION/,
  );
});

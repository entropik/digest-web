import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalizePublicUrl,
  isPrivateHost,
  UnsafeUrlError,
} from "../src/urls.js";

type Fixture = {
  name: string;
  input: string;
  expected?: string;
  error?: boolean;
};

test("candidate URL normalization matches shared fixtures", async (context) => {
  const path = new URL("../../test-fixtures/url-canonicalization.json", import.meta.url);
  const fixtures = JSON.parse(await readFile(path, "utf8")) as Fixture[];
  for (const fixture of fixtures) {
    await context.test(fixture.name, () => {
      if (fixture.error) {
        assert.throws(
          () => canonicalizePublicUrl(fixture.input),
          UnsafeUrlError,
        );
      } else {
        assert.equal(canonicalizePublicUrl(fixture.input), fixture.expected);
      }
    });
  }
});

test("different www hosts are never collapsed", () => {
  assert.notEqual(
    canonicalizePublicUrl("https://example.com"),
    canonicalizePublicUrl("https://www.example.com"),
  );
});

test("private IPv6 literals are rejected", () => {
  assert.throws(() => canonicalizePublicUrl("http://[::1]/"), UnsafeUrlError);
  assert.throws(() => canonicalizePublicUrl("http://[fd00::1]/"), UnsafeUrlError);
});

test("private IPv4-mapped IPv6 literals are rejected in every notation", () => {
  const privateAddresses = [
    "::ffff:0.0.0.0",
    "::ffff:10.0.0.1",
    "::ffff:100.64.0.1",
    "::ffff:127.0.0.1",
    "::ffff:172.16.0.1",
    "::ffff:192.168.1.1",
    "::ffff:c0a8:101",
    "0:0:0:0:0:ffff:a9fe:101",
    "::ffff:e000:1",
  ];
  for (const address of privateAddresses) {
    assert.equal(isPrivateHost(address), true, address);
    assert.throws(
      () => canonicalizePublicUrl(`http://[${address}]/`),
      UnsafeUrlError,
      address,
    );
  }
});

test("public IPv4-mapped IPv6 literals remain allowed", () => {
  assert.equal(isPrivateHost("::ffff:8.8.8.8"), false);
  assert.equal(
    canonicalizePublicUrl("https://[::ffff:8.8.8.8]/resource"),
    "https://[::ffff:808:808]/resource",
  );
});

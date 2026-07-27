import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalizePublicUrl,
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

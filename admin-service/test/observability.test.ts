import assert from "node:assert/strict";
import test from "node:test";
import {
  recordTiming,
  runWithRequestContext,
  startTimer,
} from "../src/observability.js";

test("writes a correlated, structured timing record", () => {
  const messages: string[] = [];
  const originalInfo = console.info;
  console.info = (message?: unknown) => messages.push(String(message));
  try {
    runWithRequestContext("request-test-1", () => {
      recordTiming("github.cache", startTimer(), { cache: "hit" });
    });
  } finally {
    console.info = originalInfo;
  }

  assert.equal(messages.length, 1);
  const record = JSON.parse(messages[0]!) as Record<string, unknown>;
  assert.equal(record.event, "github.cache");
  assert.equal(record.request_id, "request-test-1");
  assert.equal(record.cache, "hit");
  assert.equal(record.level, "info");
  assert.equal(typeof record.duration_ms, "number");
  assert.equal(typeof record.timestamp, "string");
  assert.deepEqual(Object.keys(record).sort(), [
    "cache",
    "duration_ms",
    "event",
    "level",
    "request_id",
    "timestamp",
  ]);
});

test("promotes slow operations to warning records", () => {
  const messages: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown) => messages.push(String(message));
  try {
    recordTiming("github.ref", startTimer() - 1_000, {
      status: "success",
    });
  } finally {
    console.warn = originalWarn;
  }

  const record = JSON.parse(messages[0]!) as Record<string, unknown>;
  assert.equal(record.level, "warn");
  assert.equal(record.event, "github.ref");
  assert.equal(record.request_id, "background");
  assert.equal(record.status, "success");
});

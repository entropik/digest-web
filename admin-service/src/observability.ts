import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

type TimingEvent =
  | "curation.bootstrap"
  | "github.auth"
  | "github.cache"
  | "github.catalog.download"
  | "github.catalog.parse"
  | "github.commit"
  | "github.ref";

type TimingFields = {
  cache?: "hit" | "miss" | "shared";
  outcome?: "available" | "draft" | "error" | "published";
  status?: "error" | "success";
};

type TimingRecord = TimingFields & {
  duration_ms: number;
  event: TimingEvent;
  level: "info" | "warn";
  request_id: string;
  timestamp: string;
};

const requestContext = new AsyncLocalStorage<{ requestId: string }>();
const DEFAULT_SLOW_THRESHOLD_MS = 750;
const BOOTSTRAP_SLOW_THRESHOLD_MS = 1_500;

export const createRequestId = (): string => randomUUID();

export const runWithRequestContext = <T>(
  requestId: string,
  operation: () => T,
): T => requestContext.run({ requestId }, operation);

export const startTimer = (): number => performance.now();

export const recordTiming = (
  event: TimingEvent,
  startedAt: number,
  fields: TimingFields = {},
): void => {
  const duration = Math.max(0, performance.now() - startedAt);
  const threshold =
    event === "curation.bootstrap"
      ? BOOTSTRAP_SLOW_THRESHOLD_MS
      : DEFAULT_SLOW_THRESHOLD_MS;
  const record: TimingRecord = {
    timestamp: new Date().toISOString(),
    level: duration >= threshold ? "warn" : "info",
    event,
    request_id: requestContext.getStore()?.requestId ?? "background",
    duration_ms: Math.round(duration * 10) / 10,
    ...fields,
  };
  const serialized = JSON.stringify(record);
  if (record.level === "warn") {
    console.warn(serialized);
  } else {
    console.info(serialized);
  }
};

export const measureTiming = async <T>(
  event: TimingEvent,
  operation: () => Promise<T>,
): Promise<T> => {
  const startedAt = startTimer();
  try {
    const result = await operation();
    recordTiming(event, startedAt, { status: "success" });
    return result;
  } catch (error) {
    recordTiming(event, startedAt, { status: "error" });
    throw error;
  }
};

export const measureTimingSync = <T>(
  event: TimingEvent,
  operation: () => T,
): T => {
  const startedAt = startTimer();
  try {
    const result = operation();
    recordTiming(event, startedAt, { status: "success" });
    return result;
  } catch (error) {
    recordTiming(event, startedAt, { status: "error" });
    throw error;
  }
};

export type ApiErrorCode =
  | "NETWORK_UNAVAILABLE"
  | "REQUEST_FAILED"
  | "REQUEST_TIMEOUT"
  | string;

export class DigestApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = "DigestApiError";
  }
}

type RequestJsonOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export const requestJson = async <T>(
  origin: string,
  path: string,
  init: RequestInit = {},
  options: RequestJsonOptions = {},
): Promise<T> => {
  const controller = new AbortController();
  const fetchImpl = options.fetchImpl ?? fetch;
  let timedOut = false;
  const timeout =
    options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, options.timeoutMs);

  try {
    const response = await fetchImpl(`${origin}${path}`, {
      ...init,
      credentials: "include",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const data = (await response.json().catch(() => ({}))) as T & {
      error?: string;
      details?: unknown;
    };
    if (!response.ok) {
      throw new DigestApiError(
        data.error || "REQUEST_FAILED",
        response.status,
        data.details,
      );
    }
    return data;
  } catch (error) {
    if (error instanceof DigestApiError) throw error;
    if (timedOut) throw new DigestApiError("REQUEST_TIMEOUT");
    throw new DigestApiError("NETWORK_UNAVAILABLE");
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};

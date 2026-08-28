export class NetworkDeadlineError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Network request exceeded its ${timeoutMs}ms deadline`);
    this.name = "NetworkDeadlineError";
  }
}

export class ResponseBodyTooLargeError extends Error {
  constructor(
    readonly maximumBytes: number,
    readonly receivedBytes: number,
  ) {
    super(`Response body exceeded its ${maximumBytes}-byte limit`);
    this.name = "ResponseBodyTooLargeError";
  }
}

export const withDeadline = async <T>(
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new NetworkDeadlineError(timeoutMs)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([operation(), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const fetchWithDeadline = async <T>(
  fetcher: typeof globalThis.fetch,
  input: Parameters<typeof globalThis.fetch>[0],
  init: RequestInit = {},
  timeoutMs: number,
  consume: (response: Response) => Promise<T>,
): Promise<T> => {
  const deadline = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    deadline.abort();
  }, timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, deadline.signal])
    : deadline.signal;
  try {
    const response = await fetcher(input, { ...init, signal });
    return await consume(response);
  } catch (error) {
    if (expired) throw new NetworkDeadlineError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const readResponseTextWithLimit = async (
  response: Response,
  maximumBytes: number,
): Promise<string> => {
  const advertisedLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(advertisedLength) &&
    advertisedLength > maximumBytes
  ) {
    throw new ResponseBodyTooLargeError(maximumBytes, advertisedLength);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    receivedBytes += chunk.value.byteLength;
    if (receivedBytes > maximumBytes) {
      await reader.cancel("response body limit reached");
      throw new ResponseBodyTooLargeError(maximumBytes, receivedBytes);
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
};

export class NetworkDeadlineError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Network request exceeded its ${timeoutMs}ms deadline`);
    this.name = "NetworkDeadlineError";
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

export const fetchWithDeadline = async (
  fetcher: typeof globalThis.fetch,
  input: Parameters<typeof globalThis.fetch>[0],
  init: RequestInit = {},
  timeoutMs: number,
): Promise<Response> => {
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
    return await fetcher(input, { ...init, signal });
  } catch (error) {
    if (expired) throw new NetworkDeadlineError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

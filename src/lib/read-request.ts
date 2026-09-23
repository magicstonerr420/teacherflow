/** Bound read-only UI requests. Never use this for mutations or paid AI operations. */
export function readRequest<T>(
  read: (signal: AbortSignal) => Promise<T>,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const { signal, timeoutMs = 15_000 } = options;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function finish(settle: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      settle();
    }
    function cancel() {
      const reason = signal?.reason ?? new DOMException('Request cancelled.', 'AbortError');
      finish(() => reject(reason));
      controller.abort(reason);
    }
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => {
      const error = new Error('This is taking longer than expected. Please try again.');
      finish(() => reject(error));
      controller.abort(error);
    }, timeoutMs);
    // Observe late rejections too: middleware may finish after the read was cancelled.
    try {
      Promise.resolve(read(controller.signal)).then(
        value => finish(() => resolve(value)),
        error => finish(() => reject(error)),
      );
    } catch (error) { finish(() => reject(error)); }
  });
}

/** Reuse recent account data across navigation; mutations still invalidate these keys. */
export const ACCOUNT_READ_STALE_MS = 30_000;

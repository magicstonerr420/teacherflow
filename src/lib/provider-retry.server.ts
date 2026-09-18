import { setTimeout as delay } from 'node:timers/promises';

export class ProviderRateLimitError extends Error {
  readonly retryAfterMs: number | undefined;
  constructor(retryAfterMs?: number) {
    const seconds = Math.max(10, Math.ceil((retryAfterMs ?? 10_000) / 1000));
    const wait = seconds >= 60 ? `${Math.ceil(seconds / 60)} minute(s)` : `${seconds} seconds`;
    super(`The AI service is temporarily rate limiting requests. Please wait ${wait}, then retry only this part. Your existing lesson is retained.`);
    this.retryAfterMs = retryAfterMs;
  }
}

function retryAfter(response: Response, now: number): number | undefined {
  const value = response.headers.get('retry-after')?.trim();
  if (!value) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const ms = Number(value) * 1000;
    return Number.isFinite(ms) ? ms : undefined;
  }
  if (/^[+-]?\d/.test(value)) return undefined;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

/** Retry explicit rate-limit rejections only. Never replay an uncertain paid request. */
export async function retryRateLimited(
  send: () => Promise<Response>,
  options: {
    signal: AbortSignal;
    now?: () => number;
    random?: () => number;
    wait?: (ms: number, signal: AbortSignal) => Promise<void>;
    onRetry?: (attempt: number, delayMs: number) => Promise<void>;
  },
): Promise<Response> {
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const wait = options.wait ?? ((ms, signal) => delay(ms, undefined, { signal }));
  for (let attempt = 0; ; attempt++) {
    options.signal.throwIfAborted();
    const response = await send();
    if (response.status !== 429) return response;
    const requestedWait = retryAfter(response, now());
    // Release the rejected response before waiting; never log its private body.
    await response.body?.cancel().catch(() => {});
    const delayMs = Math.min(30_000, Math.max(requestedWait ?? 0, 2000 * 2 ** attempt) + Math.floor(random() * 500));
    // Two retries, at most 30 seconds per wait, within the caller's overall timeout.
    // A longer Retry-After is surfaced without retrying earlier than requested.
    if (attempt >= 2 || (requestedWait ?? 0) > 30_000) throw new ProviderRateLimitError(requestedWait);
    await options.onRetry?.(attempt + 1, delayMs);
    await wait(delayMs, options.signal);
  }
}

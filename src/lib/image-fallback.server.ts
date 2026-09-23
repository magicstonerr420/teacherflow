import { setTimeout as delay } from "node:timers/promises";
import { ProviderRateLimitError } from "./provider-retry.server.ts";
import { ProviderRejectedError } from "./provider-fallback.server.ts";
import {
  BACKUP_IMAGE_MODEL,
  IMAGE_BACKUP_APPROVED,
  PRIMARY_IMAGE_MODEL,
} from "./image-models.server.ts";

/** At most one approved alternate after a definite rejection, never after paid or uncertain work. */
export async function withImageModelFallback<T>(
  primary: string,
  signal: AbortSignal,
  run: (model: string) => Promise<T>,
  options: {
    enabled?: boolean;
    onFallback?: (from: string, to: string, reason: string) => void;
    wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  } = {},
): Promise<T> {
  try {
    return await run(primary);
  } catch (error) {
    const throttled = error instanceof ProviderRateLimitError;
    const safe =
      (error instanceof ProviderRejectedError && error.status === 404) ||
      (throttled && (error.retryAfterMs ?? 0) <= 30_000);
    if (!(options.enabled ?? IMAGE_BACKUP_APPROVED) || primary !== PRIMARY_IMAGE_MODEL || !safe)
      throw error;
    signal.throwIfAborted();
    if (throttled)
      await (options.wait ?? ((ms, s) => delay(ms, undefined, { signal: s })))(
        Math.max(2000, error.retryAfterMs ?? 0),
        signal,
      );
    signal.throwIfAborted();
    options.onFallback?.(
      primary,
      BACKUP_IMAGE_MODEL,
      throttled ? "rate limit" : "model unavailable",
    );
    return run(BACKUP_IMAGE_MODEL);
  }
}

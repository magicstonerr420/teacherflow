import { setTimeout as delay } from "node:timers/promises";
import { ProviderRateLimitError } from "./provider-retry.server.ts";

export class ProviderRejectedError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export class ProviderFormatError extends Error {
  constructor(
    message: string,
    readonly confirmedCost: boolean,
  ) {
    super(message);
  }
}
const backups: Record<string, string> = {
  "deepseek/deepseek-v4-flash-0731": "openai/gpt-5.4-mini",
  "openai/gpt-5.4-mini": "deepseek/deepseek-v4-flash-0731",
};
/** One alternate among existing budget-approved models; never replay uncertain paid work or a refusal. */
export async function withTextModelFallback<T>(
  primary: string,
  signal: AbortSignal,
  run: (model: string) => Promise<T>,
  options: {
    onFallback?: (from: string, to: string, reason: string) => void;
    wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  } = {},
): Promise<T> {
  try {
    return await run(primary);
  } catch (error) {
    const backup = backups[primary];
    const throttled = error instanceof ProviderRateLimitError;
    const safe =
      (error instanceof ProviderRejectedError && error.status === 404) ||
      (error instanceof ProviderFormatError && error.confirmedCost) ||
      (throttled && (error.retryAfterMs ?? 0) <= 30_000);
    if (!backup || !safe) throw error;
    signal.throwIfAborted();
    if (throttled)
      await (options.wait ?? ((ms, s) => delay(ms, undefined, { signal: s })))(
        Math.max(2000, error.retryAfterMs ?? 0),
        signal,
      );
    signal.throwIfAborted();
    options.onFallback?.(
      primary,
      backup,
      throttled
        ? "rate limit"
        : error instanceof ProviderFormatError
          ? "invalid completed output"
          : "model unavailable",
    );
    return run(backup);
  }
}

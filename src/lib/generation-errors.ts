type GenerationPart = 'reading' | 'listening' | 'recording' | 'illustrations' | 'presentation' | 'lesson';
const messageOf = (error: unknown) => typeof error === 'string' ? error : error instanceof Error ? error.message : '';
const technical = (text: string) => text.length > 600 || /<\/?[a-z!][^>]*>|&lt;\/?(?:!doctype|html|head|body)|data:[^\s;]+;base64|\b(?:stack|traceback)\b|\bat \S+\s*\(|"(?:issues|stack|code|path)"\s*:|\b(?:sk-or-|sb_secret_|Bearer\s)|\S{100}/i.test(text);

/** Never display an HTML gateway page, JSON validation dump, or stack trace. */
export function generationErrorMessage(error: unknown, part: GenerationPart): string {
  const message = messageOf(error).trim();
  if (message && !technical(message) && !/^(?:TypeError|SyntaxError|ReferenceError)|failed to fetch|networkerror|load failed|unexpected token/i.test(message)) return message;
  return `We couldn't finish ${part === 'illustrations' ? 'the missing pictures' : `the ${part}`} because the service response was interrupted. Your existing lesson and completed materials have been kept. Please retry only this part.`;
}

/** Only browser-to-app delivery errors qualify; provider/budget failures do not. */
export function isInterruptedResponse(error: unknown): boolean {
  const message = messageOf(error);
  if (/charge.*uncertain|budget|credits|allowance|retry limit|rate limit/i.test(message) && !technical(message)) return false;
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : undefined;
  return [502, 503, 504].includes(status ?? 0)
    || /<(?:title|h1)[^>]*>\s*(?:502|503|504)\b|\b(?:502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout)\b|failed to fetch|networkerror|network request failed|load failed/i.test(message);
}

export const isGenerationPending = (error: unknown) => /This (?:lesson recording|listening item|reading) is already (?:running|generating)/i.test(messageOf(error));

/** Use ONLY for actions with persistent server deduplication, or read-only loads. */
export async function retryRetainedRequest<T>(run: () => Promise<T>, options: {
  wait?: (ms: number) => Promise<void>;
  onRetry?: () => void;
} = {}): Promise<T> {
  const wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let interruptions = 0;
  for (let attempt = 0; ; attempt++) {
    try { return await run(); }
    catch (error) {
      const interrupted = isInterruptedResponse(error);
      if (attempt >= 10 || (!isGenerationPending(error) && (!interrupted || interruptions++ >= 2))) throw error;
      options.onRetry?.();
      await wait(Math.min(5000, 2000 * 2 ** attempt));
    }
  }
}

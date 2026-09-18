import { budgetFetch, BetaBudgetError } from './beta-budget.server.ts';
import { appendFile, mkdir } from "node:fs/promises";
import { modelSetting } from "./model-settings.server.ts";
import { ProviderRateLimitError, retryRateLimited } from './provider-retry.server.ts';

async function recordResult(event: Record<string, unknown>) {
  console.info("TeacherFlow generation", event);
  try {
    await mkdir(".local-runtime", { recursive: true });
    await appendFile(".local-runtime/generation-events.jsonl", JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n");
  } catch { /* Logging must not break generation. No keys or lesson text are recorded. */ }
}

/** Server-only OpenRouter transport. Never import this module into browser code. */
type OpenRouterRequest = {
  system: string;
  input: string;
  schemaName: string;
  schema: unknown;
};
export function requestOpenRouter(args: OpenRouterRequest): Promise<unknown> {
  return sendOpenRouter(args, modelSetting("OPENROUTER_MODEL", "openai/gpt-5.4-mini"), 12000);
}
export function requestReadingOpenRouter(args: OpenRouterRequest): Promise<unknown> {
  return sendOpenRouter(args, "deepseek/deepseek-v4-flash-0731", 6000);
}
async function sendOpenRouter(args: OpenRouterRequest, model: string, maxTokens: number): Promise<unknown> {
  const apiKey = process.env["OPENROUTER_API_KEY"]?.trim();
  if (!apiKey) throw new Error("Add your OpenRouter API key to .env.local and restart TeacherFlow.");
  // Model choice comes only from server settings, never a client-supplied userTier.
  let response: Response;
  const signal = AbortSignal.timeout(240_000);
  try {
    response = await retryRateLimited(() => budgetFetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "TeacherFlow",
      },
      signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `${args.system}\nReturn one valid JSON object matching the supplied schema. No Markdown fences, introductory prose, or trailing commentary. Escape quotation marks and newlines inside JSON strings.` },
          { role: "user", content: `${args.input}\n\nREQUIRED RESPONSE CONTRACT\nReturn the lesson as a JSON object conforming to this exact JSON Schema, not a human-formatted lesson document. The required top-level fields and all nested fields must be present.\n${JSON.stringify(args.schema)}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: args.schemaName, strict: true, schema: args.schema },
        },
        provider: { require_parameters: true, allow_fallbacks: true },
        plugins: [{ id: "response-healing" }],
        max_tokens: maxTokens,
        ...(model === "deepseek/deepseek-v4-flash-0731" ? { reasoning: { enabled: false } } : {}),
        ...(model === "openai/gpt-5.4-mini" ? { reasoning: { effort: "low" } } : {}),
        stream: false,
      }),
    }), { signal, onRetry: (attempt, delayMs) => recordResult({ model, section: args.schemaName, outcome: 'rate_limit_retry', attempt, delayMs }) });
  } catch (error) {
    if (error instanceof BetaBudgetError || error instanceof ProviderRateLimitError) throw error;
    const cause = error as { name?: string; cause?: { code?: string } };
    await recordResult({ model, section: args.schemaName, outcome: "network", reason: cause.cause?.code ?? cause.name });
    if (cause.name === "TimeoutError" || cause.name === "AbortError") throw new Error("The AI provider exceeded the four-minute time limit for this part. Retry this part; completed parts are retained.");
    if (cause.cause?.code === "EACCES" || cause.cause?.code === "EPERM") throw new Error("The local server is blocked from accessing OpenRouter. Network permission must be restored before retrying.");
    throw new Error("OpenRouter could not be reached. Check the internet connection and retry this part.");
  }
  // Do not relay upstream bodies or log prompts/credentials.
  if (!response.ok) {
    if (model === "deepseek/deepseek-v4-flash-0731" && (response.status === 400 || response.status === 404)) {
      throw new Error(response.status === 404
        ? "DeepSeek V4 Flash 0731 is unavailable on OpenRouter. Retry the reading later."
        : "OpenRouter rejected DeepSeek's structured reading request. The lesson is retained; the reading configuration needs checking.");
    }
    const messages: Record<number, string> = {
      400: "OpenRouter rejected the model or lesson format. Check your server model setting.",
      401: "The OpenRouter API key is invalid. Update .env.local and restart TeacherFlow.",
      402: "Your OpenRouter account needs credits to generate this lesson.",
      403: "OpenRouter denied this request. Check your key permissions and model access.",
      404: "The configured OpenRouter model is unavailable. Update OPENROUTER_MODEL.",
    };
    throw new Error(messages[response.status] || "OpenRouter could not complete this lesson. Please retry.");
  }
  let payload;
  try { payload = await response.json(); }
  catch (error) {
    if (model === "deepseek/deepseek-v4-flash-0731" && ["AbortError", "TimeoutError"].includes((error as Error).name)) throw new Error("DeepSeek exceeded the four-minute response limit. Retry only the reading; the lesson is retained.");
    throw new Error("OpenRouter returned an unreadable response. Please retry.");
  }
  const choice = payload?.choices?.[0];
  await recordResult({ model, section: args.schemaName, status: response.status, finish: choice?.finish_reason, nativeFinish: choice?.native_finish_reason, errorCode: payload?.error?.code, outputTokens: payload?.usage?.completion_tokens, cost: payload?.usage?.cost });
  if (payload?.error) throw new Error("OpenRouter reported a provider error after accepting this part. Retry this part; completed parts are retained.");
  if (!choice) throw new Error("OpenRouter returned no result for this part. Retry this part.");
  if (choice.message?.refusal || choice.finish_reason === "content_filter") throw new Error("The provider declined the content for this part. Review the topic and teacher notes before retrying.");
  if (choice.finish_reason === "length") throw new Error("This part reached the model's output limit before it was complete. The incomplete result was discarded. Retry this part with shorter teacher notes if needed.");
  if (choice.finish_reason !== "stop") throw new Error("The provider stopped unexpectedly before completing this part. Retry this part; completed parts are retained.");
  try {
    if (typeof choice.message?.content !== "string") throw new Error();
    const content = choice.message.content.trim().replace(/^\uFEFF/, "");
    // A complete fenced JSON document is harmless presentation formatting.
    // Never guess missing lesson fields or accept a truncated model response.
    const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(content);
    return JSON.parse(fenced?.[1] ?? content);
  } catch {
    console.warn("OpenRouter JSON parsing failed", { model, section: args.schemaName, contentType: typeof choice.message?.content, contentLength: typeof choice.message?.content === "string" ? choice.message.content.length : 0 });
    throw new Error("The model returned an invalid lesson format. Please retry.");
  }
}

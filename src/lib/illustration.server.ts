import { budgetFetch, BetaBudgetError, withProviderOperation } from './beta-budget.server.ts';
import { modelSetting } from "./model-settings.server.ts";
import { ProviderRateLimitError, retryRateLimited } from './provider-retry.server.ts';
import { validateImageBase64 } from './media-validation.server.ts';
import { ProviderQueueError } from './provider-queue.server.ts';
import { recordProviderEvent } from './management-store.server.ts';
import { withImageModelFallback } from './image-fallback.server.ts';
import { ProviderRejectedError } from './provider-fallback.server.ts';
import { BACKUP_IMAGE_MODEL, PRIMARY_IMAGE_MODEL } from './image-models.server.ts';

export class IllustrationBillingError extends Error {
  readonly code = 'image_billing';
  constructor() {
    super('OpenRouter blocked illustrations because the account balance or API-key spending allowance is insufficient. Check the OpenRouter account and key used by TeacherFlow, then retry.');
  }
}

export function illustrationBrief(prompt: string, age: string, level: string) {
  const years = Number.parseInt(age, 10);
  const style = Number.isFinite(years) && years <= 9
    ? "Young children: friendly simple shapes, clear silhouettes, a few concrete objects, cheerful colours, uncluttered composition. No abstract symbolism or frightening imagery."
    : Number.isFinite(years) && years <= 12
      ? "Older children: engaging illustrated scenes, clear visual storytelling, age-appropriate detail, no preschool styling."
      : Number.isFinite(years) && years < 18
        ? "Teenagers: contemporary editorial illustration, believable teen-relevant contexts, sophisticated colour palette. No preschool cartoons, babyish characters or childish clip art."
        : "Adults: polished editorial illustration, mature real-world contexts and professional visual design. No childish clip art.";
  const complexity = /^A[12]$/.test(level)
    ? "Beginner language level: make the target meaning immediately visible through concrete objects and actions, with few distracting details. Simplicity must not infantilize older students."
    : /^B[12]$/.test(level)
      ? "Intermediate language level: use clear contextual scenes that support description and discussion."
      : "Advanced language level: nuanced contextual scenes may support inference and discussion, while staying appropriate to the student's age. Advanced language does not imply adult content.";
  return `Create one original classroom illustration.\nStudents: age ${age}; English level ${level}.\n${style}\n${complexity}\nLesson visual: ${prompt}\nNo written words, letters, watermarks, logos or brands. The visual must teach the specified concept rather than decorate the slide.`;
}

export async function generateIllustration(prompt: string, age: string, level: string) {
  const key = process.env["OPENROUTER_API_KEY"]?.trim();
  if (!key) throw new Error("The OpenRouter image key is not configured.");
  const primary = modelSetting("OPENROUTER_IMAGE_MODEL", PRIMARY_IMAGE_MODEL);
  const brief = illustrationBrief(prompt, age, level);
  const signal = AbortSignal.timeout(180_000);
  return withProviderOperation(JSON.stringify({ kind: 'illustration', prompt, age, level }), () =>
    withImageModelFallback(primary, signal, model => generateImage(model, brief, key, signal), {
      onFallback: (from, to, reason) => recordProviderEvent({
        model: to, kind: 'image', event: 'fallback', ms: 0,
        detail: `Approved image alternate after ${reason}; previous model ${from}.`,
      }),
    }),
  );
}

async function generateImage(model: string, brief: string, key: string, signal: AbortSignal) {
  let response: Response;
  try { response = await retryRateLimited(() => budgetFetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: brief,
      aspect_ratio: "4:3",
      ...([PRIMARY_IMAGE_MODEL, BACKUP_IMAGE_MODEL].includes(model) ? { resolution: "1K" } : {}),
      ...(model === BACKUP_IMAGE_MODEL ? { provider: { only: ['google-vertex/global'], allow_fallbacks: false } } : {}),
      n: 1,
    }),
  }), { signal, onRetry: async (_attempt, ms) => { recordProviderEvent({ model, kind: 'image', event: 'retry', ms, detail: 'Explicit image rate-limit rejection.' }); } }); }
  catch (error) {
    if (error instanceof BetaBudgetError || error instanceof ProviderRateLimitError || error instanceof ProviderQueueError) throw error;
    throw new Error('The image service connection was interrupted. Your completed pictures have been kept. The previous request may still be running; contact the organizer before requesting another picture.');
  }
  if (response.status === 402) throw new IllustrationBillingError();
  if (response.status === 404) throw new ProviderRejectedError('The image model is unavailable. Your completed pictures have been kept; retry only this picture.', 404);
  if (!response.ok) throw new Error(response.status >= 500 || response.status === 408
    ? 'The image service could not confirm this picture. Your completed pictures have been kept. Contact the organizer before retrying this picture.'
    : 'OpenRouter could not generate this illustration. Your completed pictures have been kept; retry only this picture.');
  let result;
  try { result = await response.json(); }
  catch {
    recordProviderEvent({ model, kind: 'image', event: 'validation', ms: 0, detail: 'Image response was not complete JSON.' });
    throw new Error('The image service returned an incomplete picture. Your completed pictures have been kept. Contact the organizer before retrying this picture.');
  }
  const item = result?.data?.[0];
  // Malformed successful delivery may already have been billed. Validate once;
  // never regenerate or switch models automatically for this response.
  try { return validateImageBase64(item?.b64_json, item?.media_type); }
  catch (error) {
    recordProviderEvent({ model, kind: 'image', event: 'validation', ms: 0, detail: 'Image bytes were missing, corrupt or did not match their format.' });
    throw error;
  }
}

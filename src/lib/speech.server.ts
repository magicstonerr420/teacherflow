import { budgetFetch, BetaBudgetError, withProviderOperation } from './beta-budget.server.ts';
import type { VoiceChoice } from './listening';
import { ProviderRateLimitError, retryRateLimited } from './provider-retry.server.ts';
import { isValidMp3 } from './media-validation.server.ts';
import { ProviderQueueError } from './provider-queue.server.ts';
import { recordProviderEvent } from './management-store.server.ts';

export const SPEECH_MODELS = {
  // Explicit US voices, including the fallback; generic English does not fix an accent.
  standard: { model: 'microsoft/mai-voice-2', voice: 'en-US-Harper:MAI-Voice-2' },
  economy: { model: 'hexgrad/kokoro-82m', voice: 'af_heart' },
  test: { model: 'deepgram/flux-tts:free', voice: 'flux-alexis-en' },
} as const;
class SpeechError extends Error {
  constructor(message: string, readonly fallbackAllowed = false) { super(message); }
}
export const isMp3 = isValidMp3;
async function synthesize(script: string, choice: VoiceChoice) {
  const config = SPEECH_MODELS[choice];
  const key = process.env['OPENROUTER_API_KEY']?.trim();
  if (!key) throw new SpeechError('The listening voice service is not configured. Contact the organizer.');
  let response: Response;
  const signal = AbortSignal.timeout(150_000);
  try {
    response = await retryRateLimited(() => budgetFetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'TeacherFlow' },
      signal, body: JSON.stringify({ ...config, input: script, response_format: 'mp3',
        ...(choice === 'standard' ? { speed: 0.8, provider: { only: ['azure'], allow_fallbacks: false } } : {}),
        ...(choice === 'economy' ? { provider: { only: ['deepinfra'], allow_fallbacks: false, options: { deepinfra: { speed: 0.8 } } } } : {}),
      }),
    }), { signal, onRetry: async (_attempt, ms) => { recordProviderEvent({ model: config.model, kind: 'audio', event: 'retry', ms, detail: 'Explicit voice rate-limit rejection.' }); } });
  } catch (error) {
    if (error instanceof BetaBudgetError || error instanceof ProviderRateLimitError || error instanceof ProviderQueueError) throw error;
    throw new SpeechError('The voice service connection was interrupted. Your script is saved. The previous recording may still be running; contact the organizer before retrying.');
  }
  if (!response.ok) {
    const message = response.status === 402 ? 'OpenRouter needs credits for the recording. Your script is saved.'
      : [401, 403].includes(response.status) ? 'The voice service denied access. Contact the organizer.'
      : response.status >= 500 || response.status === 408
        ? 'The voice service could not confirm the recording. Your script is saved. Contact the organizer before retrying.'
        : 'The selected voice is temporarily unavailable. Your script is saved; retry the recording.';
    // A gateway/server error can arrive after generation has started and billed.
    // Only an explicit missing endpoint can buy the approved alternate voice.
    throw new SpeechError(message, response.status === 404);
  }
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await response.arrayBuffer()); }
  catch { throw new SpeechError('The recording download was interrupted. Your script is saved. Contact the organizer before retrying.'); }
  if (!['audio/mpeg', 'audio/mp3'].includes(response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '') || !isMp3(bytes)) {
    recordProviderEvent({ model: config.model, kind: 'audio', event: 'validation', ms: 0, detail: 'Recording bytes were invalid or did not match the MP3 format.' });
    throw new SpeechError('The voice service returned an invalid recording. Your script is saved.');
  }
  return { ...config, bytes, choice };
}
/** Only an explicit missing endpoint can use the fallback. Never retry an uncertain delivery. */
export async function generateSpeech(script: string, choice: VoiceChoice = 'standard') {
  return withProviderOperation(JSON.stringify({ type: 'speech', script, choice }), () => generateWithFallback(script, choice));
}
async function generateWithFallback(script: string, choice: VoiceChoice) {
  if (!script.trim() || script.length > 3500) throw new Error('The listening script is empty or too long.');
  if (choice === 'test' && process.env['NODE_ENV'] === 'production') throw new Error('The test voice is available only during local development.');
  try { return await synthesize(script, choice); }
  catch (error) {
    if (choice === 'standard' && error instanceof SpeechError && error.fallbackAllowed) {
      recordProviderEvent({ model: SPEECH_MODELS.economy.model, kind: 'audio', event: 'fallback', ms: 0, detail: 'Standard voice endpoint explicitly unavailable; using the approved economy voice.' });
      return synthesize(script, 'economy');
    }
    throw error;
  }
}

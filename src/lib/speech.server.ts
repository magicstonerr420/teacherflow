import { budgetFetch, BetaBudgetError } from './beta-budget.server.ts';
import type { VoiceChoice } from './listening';
import { ProviderRateLimitError, retryRateLimited } from './provider-retry.server.ts';

export const SPEECH_MODELS = {
  // Explicit US voices, including the fallback; generic English does not fix an accent.
  standard: { model: 'microsoft/mai-voice-2', voice: 'en-US-Harper:MAI-Voice-2' },
  economy: { model: 'hexgrad/kokoro-82m', voice: 'af_heart' },
  test: { model: 'deepgram/flux-tts:free', voice: 'flux-alexis-en' },
} as const;
class SpeechError extends Error {
  constructor(message: string, readonly fallbackAllowed = false) { super(message); }
}
export function isMp3(bytes: Uint8Array) {
  if (bytes.length < 500) return false;
  return (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0);
}
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
    }), { signal });
  } catch (error) {
    if (error instanceof BetaBudgetError || error instanceof ProviderRateLimitError) throw error;
    throw new SpeechError('The voice service did not respond. Your script is saved; retry the recording.');
  }
  if (!response.ok) {
    const message = response.status === 402 ? 'OpenRouter needs credits for the recording. Your script is saved.'
      : [401, 403].includes(response.status) ? 'The voice service denied access. Contact the organizer.'
      : 'The selected voice is temporarily unavailable. Your script is saved; retry the recording.';
    throw new SpeechError(message, [404, 429, 503].includes(response.status));
  }
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await response.arrayBuffer()); }
  catch { throw new SpeechError('The recording download was interrupted. Your script is saved; retry the recording.'); }
  if (!response.headers.get('content-type')?.startsWith('audio/') || bytes.length > 8_000_000 || !isMp3(bytes))
    throw new SpeechError('The voice service returned an invalid recording. Your script is saved.');
  return { ...config, bytes, choice };
}
/** Only an explicit unavailable/rate-limit response can use the fallback. Never retry an uncertain delivery. */
export async function generateSpeech(script: string, choice: VoiceChoice = 'standard') {
  if (!script.trim() || script.length > 3500) throw new Error('The listening script is empty or too long.');
  if (choice === 'test' && process.env['NODE_ENV'] === 'production') throw new Error('The test voice is available only during local development.');
  try { return await synthesize(script, choice); }
  catch (error) {
    if (choice === 'standard' && error instanceof SpeechError && error.fallbackAllowed) return synthesize(script, 'economy');
    throw error;
  }
}

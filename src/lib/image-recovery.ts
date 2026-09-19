import { isInterruptedResponse } from './generation-errors.ts';

/** Poll saved results only; a gateway failure must never buy another illustration. */
export async function recoverSavedImage(load: () => Promise<{ dataUrl?: string; pending: boolean }>,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<string | undefined> {
  for (let attempt = 0; attempt < 8; attempt++) {
    await wait(attempt ? 5000 : 2000);
    try {
      const result = await load();
      if (result.dataUrl) return result.dataUrl;
      if (!result.pending) return undefined;
    } catch (error) {
      if (!isInterruptedResponse(error)) throw error;
    }
  }
  return undefined;
}

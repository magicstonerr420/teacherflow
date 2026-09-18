// Explicit short speech probes only; max combined provider cost $0.02. No lessons regenerated.
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { '@': path.resolve('src') } }, server: { middlewareMode: true, watch: null, hmr: false } });
const originalFetch = globalThis.fetch, records = [], dir = '.local-runtime/shape-reading-review';
try {
  const { generateSpeech, SPEECH_MODELS } = await server.ssrLoadModule('/src/lib/speech.server.ts');
  const input = 'Look at the red square. The square has four sides and four corners. The green circle is near the blue square. Say the words: square, teacher, water, color, and car. Now point to the orange star and the purple oval.';
  await mkdir(dir, { recursive: true });
  let budget = 0;
  globalThis.fetch = async (url, options) => {
    if (!String(url).endsWith('/audio/speech')) throw new Error('Only speech calls allowed');
    const body = JSON.parse(options.body), rate = body.model === SPEECH_MODELS.standard.model ? .000022 : .00000062;
    budget += body.input.length * rate; if (budget > .02) throw new Error('Test spend cap reached');
    const r = await originalFetch(url, options);
    records.push({ model: body.model, voice: body.voice, characters: body.input.length, status: r.status, estimatedUsd: body.input.length * rate, generationId: r.headers.get('x-generation-id') });
    return r;
  };
  for (const choice of ['standard','economy']) {
    const result = await generateSpeech(input, choice);
    if (result.model !== SPEECH_MODELS[choice].model) throw new Error('Primary probe fell back; do not claim primary passed');
    await writeFile(`${dir}/${choice}-american.mp3`, result.bytes);
  }
  await writeFile(`${dir}/audio-checks.json`, JSON.stringify({ records, estimatedTotalUsd: budget }, null, 2));
  console.log(JSON.stringify({ records, estimatedTotalUsd: budget }));
} finally { globalThis.fetch = originalFetch; await server.close(); }

import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, resolve: { alias: { '@': path.resolve('src') } } });
const originalFetch = globalThis.fetch;
const saved = { ...process.env };
try {
  const { generateSpeech } = await server.ssrLoadModule('/src/lib/speech.server.ts');
  const { generateListening, generateListeningAudio, getListeningAudio } = await server.ssrLoadModule('/src/lib/listening.server.ts');
  const { validateListening, applyListening, withoutListeningSections, integrateListeningPatch } = await server.ssrLoadModule('/src/lib/listening.ts');
  const { worksheetSchema } = await server.ssrLoadModule('/src/lib/lesson-schema.ts');
  const { mergeLessonPatch } = await server.ssrLoadModule('/src/lib/generation-plan.ts');
  const fixture = JSON.parse(await readFile('comparison/budget-lesson.json', 'utf8'));
  const request = { ...fixture.request, level: 'A1' };
  const script = ('I go to the park with my sister. We see a red ball near a tree. We play with the ball and walk home together. ').repeat(7).trim();
  const value = { title: 'At the park', cefr: 'A1', purpose: 'Listen for details', instructions: 'Listen and answer.', script, teacherGuidance: 'Read twice.',
    questions: [
      { question: 'Where do they go?', choices: ['Park', 'Store'], answer: 'Park', evidence: 'I go to the park', explanation: 'The place is given.' },
      { question: 'What color is the ball?', choices: ['Red', 'Blue'], answer: 'Red', evidence: 'a red ball', explanation: 'The color is stated.' },
      { question: 'Who goes with the speaker?', choices: [], answer: 'Sister', evidence: 'with my sister', explanation: 'The companion is named.' },
    ] };
  validateListening(value, 'A1');
  const young = validateListening({ ...value, teacherGuidance: 'Circle the correct picture.' }, 'A1', '5-7');
  assert.ok(!young.teacherGuidance.includes('picture'));
  assert.ok(young.teacherGuidance.includes('orally'));
  assert.ok(young.instructions.includes('correct words'));
  assert.throws(() => validateListening({ ...value, cefr: 'B1' }, 'A1'));
  assert.throws(() => validateListening({ ...value, script: 'Too short.' }, 'A1'));
  assert.throws(() => validateListening({ ...value, questions: value.questions.map(q => ({ ...q, evidence: 'Invented evidence' })) }, 'A1'));
  const state = { status: 'ready', value, fingerprint: 'fixture' };
  const applied = applyListening(fixture.lesson, state);
  worksheetSchema.parse(applied.worksheet);
  assert.equal(applied.worksheet.student.sections.at(-1).passage, '');
  assert.equal(JSON.stringify(applied.worksheet.student).includes(script), false);
  assert.equal('answer' in applied.worksheet.student.sections.at(-1).items[0], false);
  assert.ok(applied.worksheet.teacher.sections.at(-1).teacherNotes.includes(script));
  assert.deepEqual(applied.worksheet.studentB, fixture.lesson.worksheet.studentB);
  assert.deepEqual(applyListening(applied, state), applied);
  assert.deepEqual(withoutListeningSections(applied).worksheet, fixture.lesson.worksheet);
  assert.equal(withoutListeningSections({ worksheet: { student: fixture.lesson.worksheet.student }, listening: { status: 'failed', error: 'Retry script' } }).worksheet.teacher, undefined);
  const partial = integrateListeningPatch({ listening: state }, { worksheet: { title: 'Worksheet', student: fixture.lesson.worksheet.student } });
  assert.equal(partial.worksheet.student.sections.at(-1).label, 'Listening');
  assert.equal(mergeLessonPatch(partial, { presentation: fixture.lesson.presentation }).listening.status, 'ready');
  assert.deepEqual(applied.presentation, fixture.lesson.presentation);

  process.env.OPENROUTER_API_KEY = 'test-only';
  process.env.TEACHERFLOW_LISTENING_DB = path.join(await mkdtemp(path.join(tmpdir(), 'teacherflow-listening-')), 'test.sqlite');
  const mp3 = new Uint8Array(2048); mp3.set([0x49, 0x44, 0x33]);
  let scriptCalls = 0, reviewCalls = 0, voiceCalls = 0;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith('/chat/completions')) {
      if (body.response_format.json_schema.name.startsWith('teacherflow_listening_review')) { reviewCalls++; assert.notEqual(body.model, 'deepseek/deepseek-v4-flash-0731'); }
      else { scriptCalls++; assert.equal(body.model, 'deepseek/deepseek-v4-flash-0731'); assert.equal(body.reasoning.enabled, false); }
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });
    }
    voiceCalls++; assert.equal(body.model, 'x-ai/grok-voice-tts-1.0'); assert.equal(body.input, script); assert.equal(body.response_format, 'mp3');
    assert.deepEqual(body.provider.options.xai, { speed: 0.7, language: 'en' });
    return new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' } });
  };
  const [a, b] = await Promise.all([generateListening(request, fixture.lesson, 'teacher'), generateListening(request, fixture.lesson, 'teacher')]);
  assert.deepEqual(a, b); assert.equal(scriptCalls, 1);
  assert.equal(reviewCalls, request.studentAge === '5-7' ? 1 : 0);
  await generateListening(request, { ...fixture.lesson, presentation: { slides: [] } }, 'teacher'); assert.equal(scriptCalls, 1);
  const [audio, again] = await Promise.all([generateListeningAudio(a.fingerprint, 'teacher', 'standard'), generateListeningAudio(a.fingerprint, 'teacher', 'standard')]);
  assert.deepEqual(audio, again); assert.equal(voiceCalls, 1);
  assert.deepEqual(getListeningAudio(audio.audio.id, 'teacher'), audio);
  assert.throws(() => getListeningAudio(audio.audio.id, 'someone-else'));
  await assert.rejects(() => generateListeningAudio(a.fingerprint, 'someone-else', 'standard'));
  await generateListeningAudio(a.fingerprint, 'teacher', 'standard'); assert.equal(voiceCalls, 1);

  let models = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); models.push(body.model);
    if (models.length === 1) return new Response('Unavailable', { status: 503 });
    assert.deepEqual(body.provider, { only: ['deepinfra'], allow_fallbacks: false });
    assert.equal(body.voice, 'tara');
    return new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' } });
  };
  assert.equal((await generateSpeech(script)).model, 'canopylabs/orpheus-3b-0.1-ft');
  assert.deepEqual(models, ['x-ai/grok-voice-tts-1.0', 'canopylabs/orpheus-3b-0.1-ft']);
  for (const status of [401, 402, 403]) {
    let calls = 0; globalThis.fetch = async () => { calls++; return new Response('', { status }); };
    await assert.rejects(() => generateSpeech(script)); assert.equal(calls, 1, 'Do not retry auth or credit failures');
  }
  globalThis.fetch = async () => new Response('not an mp3', { headers: { 'Content-Type': 'audio/mpeg' } });
  await assert.rejects(() => generateSpeech(script, 'economy'), /invalid recording/);
  process.env.NODE_ENV = 'production';
  await assert.rejects(() => generateSpeech(script, 'test'), /local development/);
  process.env.NODE_ENV = 'test';
  let failures = 0;
  globalThis.fetch = async () => { failures++; return new Response('', { status: 402 }); };
  for (let i = 0; i < 3; i++) await assert.rejects(() => generateListeningAudio(a.fingerprint, 'teacher', 'economy', true));
  await assert.rejects(() => generateListeningAudio(a.fingerprint, 'teacher', 'economy', true), /retry limit/);
  assert.equal(failures, 3);
  await assert.rejects(() => generateListeningAudio(a.fingerprint, 'teacher', 'economy', false), /credits/);
  assert.equal(failures, 4, 'Owner is not subject to beta retry limits');
  console.log('PASS: script validation, worksheet/answer separation, unchanged Version B and presentation, concurrent/persistent cache, account isolation, bounded fallback, billing failures, invalid audio, development-only free voice and owner quota exemption.');
} finally {
  globalThis.fetch = originalFetch;
  for (const key of ['OPENROUTER_API_KEY', 'TEACHERFLOW_LISTENING_DB', 'NODE_ENV']) saved[key] === undefined ? delete process.env[key] : process.env[key] = saved[key];
  await server.close();
}

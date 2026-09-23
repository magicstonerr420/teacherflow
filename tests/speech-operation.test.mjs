import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mp3Fixture } from './media-fixtures.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'tf-speech-operation-'));
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null } });
const oldFetch = globalThis.fetch, saved = { ...process.env };
try {
  process.env.OPENROUTER_API_KEY = 'test-only';
  process.env.TEACHERFLOW_BUDGET_DB = path.join(directory, 'budget.sqlite');
  process.env.TEACHERFLOW_PROVIDER_QUEUE_DB = path.join(directory, 'queue.sqlite');
  const { generateSpeech } = await server.ssrLoadModule('/src/lib/speech.server.ts');
  const { withBetaBudget, BetaBudget } = await server.ssrLoadModule('/src/lib/beta-budget.server.ts');
  const calls = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/endpoints')) {
      const standard = String(url).includes('microsoft/mai-voice-2');
      return Response.json({ data: { endpoints: [{ tag: standard ? 'azure' : 'deepinfra', pricing: { prompt: standard ? .000022 : .00000062, completion: 0, request: 0 } }] } });
    }
    assert.ok(String(url).endsWith('/audio/speech'));
    const { model } = JSON.parse(init.body); calls.push(model);
    if (calls.length === 1) return new Response('', { status: 404 });
    if (calls.length === 2) throw Error('Simulated connection loss after fallback dispatch');
    // The primary comes back online, but the uncertain fallback must still
    // block this same logical recording before another paid request is sent.
    return new Response(mp3Fixture(), { headers: { 'Content-Type': 'audio/mpeg' } });
  };
  const record = () => withBetaBudget('teacher', () => generateSpeech('The exact same classroom story.', 'standard'));
  await assert.rejects(record, /charge is uncertain/);
  await assert.rejects(record, /previous charge is still uncertain/);
  assert.deepEqual(calls, ['microsoft/mai-voice-2', 'hexgrad/kokoro-82m']);
  const budget = new BetaBudget();
  try {
    const rows = budget.db.prepare('SELECT model,state,request_key,charged FROM budget_calls ORDER BY created,rowid').all();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].state, 'settled'); assert.equal(rows[0].charged, 0);
    assert.equal(rows[1].state, 'uncertain'); assert.equal(rows[1].charged, null);
    assert.equal(rows[0].request_key, rows[1].request_key, 'Approved alternate voice shares the logical recording identity');
  } finally { budget.close(); }
  console.log('PASS: uncertain alternate-voice delivery blocks a later primary retry before dispatch, without losing its budget reservation.');
} finally {
  globalThis.fetch = oldFetch;
  for (const key of ['OPENROUTER_API_KEY', 'TEACHERFLOW_BUDGET_DB', 'TEACHERFLOW_PROVIDER_QUEUE_DB']) saved[key] === undefined ? delete process.env[key] : process.env[key] = saved[key];
  await server.close();
}

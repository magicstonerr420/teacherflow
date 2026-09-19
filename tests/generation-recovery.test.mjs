import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generationErrorMessage, retryRetainedRequest } from '../src/lib/generation-errors.ts';
import { recoverSavedImage } from '../src/lib/image-recovery.ts';
import { BetaStore } from '../src/lib/beta-store.server.ts';

const gateway = '<!DOCTYPE html><html><title>502</title><style>' + 'font data:base64,'.repeat(500) + '</style></html>';
test('gateway HTML, validation dumps and credentials never reach a teacher alert', () => {
  for (const message of [gateway, '{"issues":[{"code":"invalid_type","path":["value"]}]}', 'Bearer secret', 'sk-or-secret', 'TypeError: Failed to fetch']) {
    const output = generationErrorMessage(new Error(message), 'recording');
    assert.ok(output.length < 300); assert.match(output, /recording.*interrupted/);
    assert.doesNotMatch(output, /DOCTYPE|base64|invalid_type|Bearer|sk-or-|TypeError/);
  }
  assert.equal(generationErrorMessage('Your beta access is inactive.', 'reading'), 'Your beta access is inactive.');
});
test('lost response resumes the same saved action, including work still in progress', async () => {
  let attempts = 0, paid = 0, saved; const waits = [];
  const result = await retryRetainedRequest(async () => {
    attempts++;
    if (attempts === 1) { paid++; saved = { audio: 'retained' }; throw Error(gateway); }
    if (attempts === 2) throw Error('This lesson recording is already running. Wait, then load the saved recording.');
    return saved;
  }, { wait: async ms => { waits.push(ms); } });
  assert.deepEqual(result, { audio: 'retained' }); assert.equal(paid, 1); assert.equal(attempts, 3);
  assert.deepEqual(waits, [2000, 4000]);
});
test('outages stop after bounded retries; business, rate and uncertain-charge errors are not replayed', async () => {
  for (const [message, expected] of [[gateway, 3], ['Failed to fetch', 3], ['Your charge is uncertain.', 1], ['The AI service is temporarily rate limiting requests.', 1], ['Your allowance is used.', 1]]) {
    let count = 0;
    await assert.rejects(retryRetainedRequest(async () => { count++; throw Error(message); }, { wait: async () => {} }));
    assert.equal(count, expected);
  }
});
test('picture recovery polls saved results without creating a new job, survives restart and respects account ownership', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'teacherflow-recovery-')), 'beta.sqlite');
  let store = new BetaStore(file); const [code, second] = store.issue();
  store.claim('teacher', code); store.claim('other', second);
  const request = { topic: 'The Future of Society' };
  for (const stage of ['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation']) await store.stage('teacher', request, stage, async () => ({}));
  // Persist an in-flight provider request whose HTTP response was lost.
  const { createHash } = await import('node:crypto');
  const hash = s => createHash('sha256').update(s).digest('hex');
  const key = hash(JSON.stringify(request)), prompt = 'Adults considering possible futures';
  store.transact(s => { s.teachers.teacher.runs[key].images[hash(prompt)] = { attempts: 1, until: Date.now() + 10000 }; });
  let reads = 0;
  const image = 'data:image/png;base64,c2F2ZWQ=';
  const result = await recoverSavedImage(async () => {
    reads++;
    if (reads === 2) store.transact(s => { s.teachers.teacher.runs[key].images[hash(prompt)].value = image; });
    return store.imageProgress('teacher', request, prompt);
  }, async () => {});
  assert.equal(result, image); assert.equal(reads, 2);
  store.db.close(); store = new BetaStore(file);
  assert.deepEqual(store.imageProgress('teacher', request, prompt), { dataUrl: image, pending: false });
  assert.throws(() => store.imageProgress('other', request, prompt), /own lesson/);
  const persisted = JSON.parse(store.db.prepare('SELECT body FROM beta_state').get().body);
  assert.equal(persisted.teachers.teacher.runs[key].images[hash(prompt)].attempts, 1);
  assert.equal(Object.keys(persisted.teachers.teacher.runs[key].images).length, 1);
  assert.equal(store.status('teacher').remaining, 2);
  assert.equal(await recoverSavedImage(async () => ({ pending: false }), async () => {}), undefined);
  let polls = 0;
  assert.equal(await recoverSavedImage(async () => { polls++; throw Error(gateway); }, async () => {}), undefined);
  assert.equal(polls, 8); store.db.close();
});

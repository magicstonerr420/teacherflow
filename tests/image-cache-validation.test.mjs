import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pngFixture } from './media-fixtures.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'tf-image-cache-'));
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, resolve: { alias: { '@': path.resolve('src') } } });
const oldFetch = globalThis.fetch, saved = { ...process.env };
let store;
try {
  Object.assign(process.env, {
    TEACHERFLOW_BETA: 'true', TEACHERFLOW_BETA_DB: path.join(directory, 'beta.sqlite'),
    TEACHERFLOW_MANAGEMENT_DB: path.join(directory, 'management.sqlite'),
    TEACHERFLOW_PROVIDER_QUEUE_DB: path.join(directory, 'queue.sqlite'),
    SUPABASE_URL: 'https://auth.example.test', SUPABASE_PUBLISHABLE_KEY: 'test-key', TEACHERFLOW_OWNER_USER_ID: 'owner',
  });
  const { betaStore } = await server.ssrLoadModule('/src/lib/beta-store.server.ts');
  const { lessonRequestSchema } = await server.ssrLoadModule('/src/lib/lesson-schema.ts');
  const { Route } = await server.ssrLoadModule('/src/routes/api/generate-image.ts');
  const handler = Route.options.server.handlers.POST;
  store = betaStore();
  const [code, second] = store.issue(); store.claim('teacher', code); store.claim('other', second);
  const request = lessonRequestSchema.parse(JSON.parse(readFileSync('comparison/budget-lesson.json', 'utf8')).request);
  for (const stage of ['foundation', 'student', 'teacher', 'studentB', 'teacherB', 'presentation', 'activity', 'assessment', 'differentiation']) {
    await store.stage('teacher', request, stage, async () => ({}));
  }
  const prompt = 'An already completed classroom illustration', imageKey = createHash('sha256').update(prompt).digest('hex');
  const valid = `data:image/png;base64,${pngFixture().toString('base64')}`;
  const setImage = value => store.transact(state => {
    const run = Object.values(state.teachers.teacher.runs)[0];
    run.images[imageKey] = { value, attempts: 1 };
  });
  let paidCalls = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://auth.example.test/')) {
      const auth = new Headers(init.headers).get('authorization');
      return Response.json({ id: auth === 'Bearer other' ? 'other' : 'teacher' });
    }
    paidCalls++; throw Error('Unexpected paid provider request in cache test');
  };
  const send = (recoverOnly, token = 'teacher') => handler({ request: new Request('https://app.example.test/api/generate-image', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ request, prompt, recoverOnly }),
  }) });
  setImage(valid);
  for (const recover of [true, false]) {
    const response = await send(recover); assert.equal(response.status, 200); assert.equal((await response.json()).dataUrl, valid);
  }
  assert.equal((await send(true, 'other')).status, 403);
  setImage('data:image/png;base64,dGVzdA==');
  for (const recover of [true, false]) {
    const response = await send(recover); assert.equal(response.status, 403);
    const result = await response.json(); assert.match(result.error, /usable illustration/); assert.equal(result.dataUrl, undefined);
  }
  const state = JSON.parse(store.db.prepare('SELECT body FROM beta_state').get().body);
  const run = Object.values(state.teachers.teacher.runs)[0];
  assert.equal(Object.keys(run.images).length, 1); assert.equal(run.images[imageKey].attempts, 1);
  assert.equal(paidCalls, 0, 'Cache validation and recovery cannot silently create a new paid picture or slot');
  setImage(valid);
  assert.equal((await (await send(true)).json()).dataUrl, valid);
  console.log('PASS: normal and recovery image routes validate saved bytes, preserve slots and successful cache, enforce ownership and never regenerate corrupt cached images.');
} finally {
  globalThis.fetch = oldFetch; store?.db.close();
  for (const key of ['TEACHERFLOW_BETA', 'TEACHERFLOW_BETA_DB', 'TEACHERFLOW_MANAGEMENT_DB', 'TEACHERFLOW_PROVIDER_QUEUE_DB', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'TEACHERFLOW_OWNER_USER_ID']) saved[key] === undefined ? delete process.env[key] : process.env[key] = saved[key];
  await server.close();
}

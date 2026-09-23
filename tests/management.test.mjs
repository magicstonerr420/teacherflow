import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { ManagementStore, managementKey, observeGeneration } from '../src/lib/management-store.server.ts';
import { safeDiagnostic, explainFailure } from '../src/lib/management.ts';
import { BetaStore } from '../src/lib/beta-store.server.ts';
import { BetaBudget, budgetFetch } from '../src/lib/beta-budget.server.ts';
import { retryRateLimited } from '../src/lib/provider-retry.server.ts';
import { betaAdministrator } from '../src/lib/beta-admin.server.ts';

const root = mkdtempSync(join(tmpdir(), 'tf-management-'));
const variables = ['TEACHERFLOW_MANAGEMENT_DB', 'TEACHERFLOW_BETA_DB', 'TEACHERFLOW_BUDGET_DB', 'TEACHERFLOW_READING_DB', 'TEACHERFLOW_LISTENING_DB', 'TEACHERFLOW_BETA', 'TEACHERFLOW_OWNER_USER_ID', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'OPENROUTER_API_KEY', 'NODE_ENV'];
const saved = Object.fromEntries(variables.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
let sequence = 0, directory, vite;
beforeEach(() => {
  directory = join(root, String(++sequence));
  Object.assign(process.env, { TEACHERFLOW_MANAGEMENT_DB: join(directory, 'management.sqlite'), TEACHERFLOW_BETA_DB: join(directory, 'beta.sqlite'), TEACHERFLOW_BUDGET_DB: join(directory, 'budget.sqlite'), TEACHERFLOW_READING_DB: join(directory, 'reading.sqlite'), TEACHERFLOW_LISTENING_DB: join(directory, 'listening.sqlite'), TEACHERFLOW_BETA: 'true', TEACHERFLOW_OWNER_USER_ID: 'owner', SUPABASE_URL: 'https://identity.example.test', SUPABASE_PUBLISHABLE_KEY: 'test-public', OPENROUTER_API_KEY: 'test-only', NODE_ENV: 'test' });
  globalThis.fetch = async () => assert.fail('Unexpected network call: all providers must be faked');
});
after(async () => {
  await vite?.close(); globalThis.fetch = originalFetch;
  for (const key of variables) saved[key] === undefined ? delete process.env[key] : process.env[key] = saved[key];
  rmSync(root, { recursive: true, force: true });
});
const request = { topic: 'A day at the park', studentAge: 'Adults', level: 'A1', durationMinutes: 45, mainSkill: 'Reading', secondarySkill: null, subject: 'English', learningObjective: 'Find facts in a simple passage.', previousKnowledge: 'Present simple', teacherNotes: 'Preserve these exact submitted notes.', requiredVocabulary: 'park, library', groupWorkEnabled: false, studentsPerGroup: null };
const phases = ['foundation', 'student', 'teacher', 'studentB', 'teacherB', 'presentation', 'activity', 'assessment', 'differentiation'];
function beta() { const store = new BetaStore(process.env.TEACHERFLOW_BETA_DB); const codes = store.issue(); store.claim('teacher', codes[0], 'teacher@example.test', 'Teacher Name'); return store; }
const state = store => JSON.parse(store.db.prepare('SELECT body FROM beta_state').get().body);
const failure = (store, input = {}) => { const id = store.begin({ user: 'teacher', request, part: 'foundation', ...input }); store.finish(id, Error('Invalid generated answer')); return id; };
async function module(path) {
  if (!vite) { const { createServer } = await import('vite'); vite = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, resolve: { alias: { '@': resolve('src') } } }); }
  return vite.ssrLoadModule(path);
}

test('submitted inputs, diagnostics, teacher metadata and notes survive restart; legacy progress does not invent failures', async () => {
  const lessonStore = beta(); let management = new ManagementStore();
  try {
    assert.equal(managementKey({ b: 2, a: { d: 4, c: 3 } }), managementKey({ a: { c: 3, d: 4 }, b: 2 }));
    const id = failure(management, { detail: 'Exact worksheet instructions' });
    management.saveNote('owner', 'teacher', 'Private follow-up note');
    management.saveSettings('owner', { emailEnabled: false, dailySummary: true });
    management.close(); management = new ManagementStore();
    assert.deepEqual(management.get(id).request, request); assert.equal(management.get(id).detail, 'Exact worksheet instructions');
    assert.equal(management.get(id).failure.category, 'content'); assert.equal(management.notes()[0].note, 'Private follow-up note');
    assert.deepEqual(management.settings(), { emailEnabled: false, dailySummary: true });
    // Seed a pre-monitoring run without making provider calls or manufacturing telemetry.
    lessonStore.transact(s => { s.teachers.teacher.runs[managementKey(request)] = { request, complete: false, images: {}, parts: { foundation: { attempts: 1, value: { overview: 'Saved legacy lesson' } } } }; });
    const progress = lessonStore.managementProgress();
    assert.equal(progress.lessons[0].steps[0].complete, true); assert.equal(progress.lessons[0].steps[1].attempts, 0);
    assert.equal(management.list().length, 1, 'Missing old telemetry remains unknown');
    assert.doesNotMatch(JSON.stringify(progress), /Saved legacy lesson|digest|"code"/);
    assert.equal(progress.teachers[0].email, 'teacher@example.test');
  } finally { management.close(); lessonStore.db.close(); }
});

test('diagnostics redact credentials, URLs, inline data and gateway pages without claiming an invented root cause', () => {
  const cleaned = safeDiagnostic(Error('Failed Bearer abc.def sk-or-secret sb_secret_private re_private https://provider.example/?token=private data:audio/mp3;base64,secret'));
  assert.doesNotMatch(cleaned, /abc\.def|sk-or-secret|sb_secret_private|re_private|token=private|base64,secret/);
  const gateway = safeDiagnostic('<!doctype html><html><title>502 Bad Gateway</title><body>private debug dump</body></html>');
  assert.match(gateway, /502/); assert.doesNotMatch(gateway, /private debug/);
  assert.match(explainFailure('No completion was recorded before the request stopped reporting progress. The cause is unknown.').explanation, /without a confirmed cause/);
  assert.equal(explainFailure('The provider charge is uncertain.', 429).category, 'uncertain_charge');
  assert.equal(explainFailure('Provider rejected request', 402).category, 'provider_credit');
  assert.equal(explainFailure('Provider rejected request', 401).category, 'access');
});

test('a throttled provider call records each attempt, recovers once and retains the actual budget charge', async () => {
  const store = beta(), management = new ManagementStore(), budget = new BetaBudget(); let calls = 0;
  try {
    globalThis.fetch = async () => ++calls < 3 ? new Response('not persisted provider text', { status: 429 }) : Response.json({ usage: { cost: .003 }, choices: [] });
    const generate = async () => {
      await retryRateLimited(() => budgetFetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash-0731', max_tokens: 6000, messages: [{ role: 'user', content: 'Test request' }] }) }), { signal: new AbortController().signal, random: () => 0, wait: async () => {} });
      return { overview: 'Retained result' };
    };
    const result = await store.stage('teacher', request, 'foundation', generate);
    assert.equal(calls, 3); assert.equal(budget.status().accountedUsd, .003); assert.equal(budget.status().reservedUsd, 0);
    const [operation] = management.list(); assert.equal(operation.status, 'recovered'); assert.equal(operation.issue, 'recovered');
    assert.deepEqual(operation.providers.filter(p => !p.event || p.event === 'request').map(p => p.status), [429, 429, 200]); assert.deepEqual(operation.request, request);
    assert.deepEqual(await store.stage('teacher', request, 'foundation', () => assert.fail('Saved stage must not buy again')), result);
    assert.equal(management.list().length, 1); assert.equal(budget.status().accountedUsd, .003);
  } finally { management.close(); budget.close(); store.db.close(); }
});

test('provider output is not reported completed until the retained lesson write succeeds', async () => {
  const store = beta(), management = new ManagementStore();
  const transact = store.transact.bind(store); let generated = false, failSave = true;
  store.transact = work => {
    if (generated && failSave) { failSave = false; throw Error('Saved lesson write interrupted'); }
    return transact(work);
  };
  try {
    await assert.rejects(store.stage('teacher', request, 'foundation', async () => { generated = true; return { overview: 'Provider output' }; }), /write interrupted/);
    const [operation] = management.list(); assert.equal(operation.status, 'failed'); assert.equal(operation.issue, 'open');
    assert.equal(state(store).teachers.teacher.runs[managementKey(request)].parts.foundation.value, undefined);
    assert.match(operation.failure.detail, /write interrupted/);
  } finally { management.close(); store.db.close(); }
});

test('persistent failures keep redacted details; stale work is marked interrupted with an unknown cause', async () => {
  const management = new ManagementStore();
  try {
    await assert.rejects(observeGeneration({ user: 'teacher', request, part: 'foundation' }, async () => { throw Error('Invalid response Bearer hidden-token'); }), /Invalid response/);
    let [operation] = management.list(); assert.equal(operation.status, 'failed'); assert.equal(operation.issue, 'open');
    assert.doesNotMatch(operation.failure.detail, /hidden-token/);
    const stale = management.begin({ user: 'second', request, part: 'reading' });
    const fresh = management.begin({ user: 'third', request, part: 'reading' });
    const now = Date.now(); management.db.prepare('UPDATE operations SET updated=? WHERE id=?').run(now - 21 * 60000, stale);
    management.interruptStale(now); operation = management.get(stale);
    assert.equal(operation.status, 'interrupted'); assert.equal(operation.failure.category, 'unknown');
    assert.equal(management.get(fresh).status, 'generating');
    management.finish(stale); assert.equal(management.get(stale).issue, 'recovered', 'Late retained success recovers its stale issue');
  } finally { management.close(); }
});

test('browser success cannot resolve a server failure or suppress its owner alert', () => {
  const management = new ManagementStore();
  try {
    const serverIssue = failure(management);
    const browser = management.begin({ user: 'teacher', request, part: 'foundation', source: 'browser' }); management.finish(browser);
    assert.equal(management.get(serverIssue).issue, 'open');
  } finally { management.close(); }
});

test('late completion cannot recover a newer failure, another target or another account; terminal records are immutable', () => {
  const management = new ManagementStore();
  try {
    const first = management.begin({ user: 'teacher', request, part: 'reading', target: 'family' });
    const newer = failure(management, { part: 'reading', target: 'family' });
    const otherTarget = failure(management, { part: 'reading', target: 'another-family' });
    const otherUser = failure(management, { user: 'other-teacher', part: 'reading', target: 'family' });
    management.db.prepare('UPDATE operations SET started=?').run(Date.now());
    management.finish(first);
    for (const id of [newer, otherTarget, otherUser]) assert.equal(management.get(id).issue, 'open');
    management.finish(first, Error('Late duplicate failed message')); assert.equal(management.get(first).status, 'completed');
    management.finish(newer); assert.equal(management.get(newer).status, 'failed');
    const recovered = management.begin({ user: 'teacher', request, part: 'reading', target: 'family' }); management.finish(recovered);
    assert.equal(management.get(newer).issue, 'recovered');
    assert.equal(management.get(otherTarget).issue, 'open'); assert.equal(management.get(otherUser).issue, 'open');
  } finally { management.close(); }
});

test('targeted retry grants are durable, idempotent and scoped to account, item and one attempt', () => {
  let management = new ManagementStore();
  try {
    const id = failure(management, { part: 'reading', target: 'reading-family' });
    management.grant('owner', id); management.grant('owner', id);
    assert.equal(management.db.prepare('SELECT COUNT(*) AS n FROM retry_grants').get().n, 1);
    assert.equal(management.consumeGrant('stranger', 'reading', 'reading-family', 'op'), false);
    assert.equal(management.consumeGrant('teacher', 'listening', 'reading-family', 'op'), false);
    assert.equal(management.consumeGrant('teacher', 'reading', 'different', 'op'), false);
    assert.equal(management.consumeGrant('teacher', 'reading', 'reading-family', 'op'), true);
    management.close(); management = new ManagementStore();
    assert.equal(management.consumeGrant('teacher', 'reading', 'reading-family', 'op'), true, 'Lost response resumes its original reservation');
    assert.equal(management.consumeGrant('teacher', 'reading', 'reading-family', 'other-op'), false);
    management.grant('owner', id);
    assert.equal(management.consumeGrant('teacher', 'reading', 'reading-family', 'third-op'), false);
    const browser = failure(management, { source: 'browser', part: 'reading', target: 'reading-family' });
    assert.throws(() => management.grant('owner', browser), /does not support/);
  } finally { management.close(); }
});

test('lesson retry and slot recovery preserve paid records, enforce live leases and completion, and never duplicate generation', async () => {
  let store = beta(); const budget = new BetaBudget();
  try {
    const paid = budget.reserve('teacher', 'existing-paid-request', 'text', 'test', .5); budget.settle(paid, .25);
    const uncertain = budget.reserve('teacher', 'uncertain-request', 'text', 'test', .25); budget.settle(uncertain);
    const before = budget.status(); let calls = 0;
    const fail = async () => { calls++; throw Error('Invalid generated answer'); };
    for (let i = 0; i < 3; i++) await assert.rejects(store.stage('teacher', request, 'foundation', fail));
    await assert.rejects(store.stage('teacher', request, 'foundation', fail), /retry limit/); assert.equal(calls, 3);
    const input = { operation: 'allow-retry-once', user: 'teacher', lesson: managementKey(request), action: 'allow_retry', part: 'foundation', target: '' };
    store.managementRecovery('owner', input); store.managementRecovery('owner', input);
    assert.equal(state(store).teachers.teacher.runs[input.lesson].parts.foundation.retryCredits, 1);
    await assert.rejects(store.stage('teacher', request, 'foundation', fail)); assert.equal(calls, 4);
    store.db.close(); store = new BetaStore(process.env.TEACHERFLOW_BETA_DB);
    store.managementRecovery('owner', input);
    await assert.rejects(store.stage('teacher', request, 'foundation', fail), /retry limit/); assert.equal(calls, 4);
    store.managementRecovery('owner', { ...input, operation: 'a-new-confirmed-failure' });
    const retained = await store.stage('teacher', request, 'foundation', async () => { calls++; return { overview: 'Preserved work' }; });
    assert.deepEqual(await store.stage('teacher', request, 'foundation', fail), retained); assert.equal(calls, 5);
    assert.throws(() => store.managementRecovery('owner', { ...input, operation: 'already-complete-part' }), /already completed/);
    let release; const pending = store.stage('teacher', request, 'student', () => new Promise(resolve => { release = resolve; }));
    assert.throws(() => store.managementRecovery('owner', { ...input, operation: 'running', action: 'restore_slot' }), /generation in progress/);
    release({ worksheet: { title: 'Retained worksheet' } }); await pending;
    const restore = { ...input, operation: 'restore-only-once', action: 'restore_slot' };
    store.managementRecovery('owner', restore); store.managementRecovery('owner', restore);
    assert.equal(store.status('teacher').remaining, 3); assert.equal(state(store).teachers.teacher.runs[input.lesson].parts.foundation.value.overview, 'Preserved work');
    for (const stage of phases.slice(2)) await store.stage('teacher', request, stage, async () => ({}));
    assert.throws(() => store.managementRecovery('owner', { ...restore, operation: 'completed-lesson' }), /completed lesson/);
    assert.deepEqual(budget.status(), before, 'Neither action resets actual or uncertain provider charges');
  } finally { store.db.close(); budget.close(); }
});

test('reading and listening owner grants allow exactly one extra failed attempt and preserve cached results', async () => {
  const { generateReading } = await module('/src/lib/reading.server.ts');
  const { generateListening } = await module('/src/lib/listening.server.ts');
  const fixture = JSON.parse(readFileSync('comparison/budget-lesson.json', 'utf8'));
  const management = new ManagementStore(); let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return new Response('Rejected test content', { status: 422 }); };
    for (let i = 0; i < 3; i++) assert.equal((await generateReading(request, fixture.lesson, 'teacher', `reading-${i}`, true)).status, 'failed');
    const readingCalls = calls;
    assert.match((await generateReading(request, fixture.lesson, 'teacher', 'reading-blocked', true)).error, /retry limit/); assert.equal(calls, readingCalls);
    const issue = management.list().find(row => row.part === 'reading'); assert.ok(issue?.target);
    management.grant('owner', issue.id); management.grant('owner', issue.id);
    assert.equal((await generateReading(request, fixture.lesson, 'teacher', 'reading-extra', true)).status, 'failed'); assert.equal(calls, readingCalls + 1);
    assert.equal((await generateReading(request, fixture.lesson, 'teacher', 'reading-extra', true)).status, 'failed'); assert.equal(calls, readingCalls + 1, 'Stored failed operation is not bought twice');
    assert.match((await generateReading(request, fixture.lesson, 'teacher', 'reading-too-many', true)).error, /retry limit/); assert.equal(calls, readingCalls + 1);
    for (let i = 0; i < 3; i++) await assert.rejects(generateListening(request, fixture.lesson, 'teacher', true));
    const listeningCalls = calls;
    await assert.rejects(generateListening(request, fixture.lesson, 'teacher', true), /retry limit/); assert.equal(calls, listeningCalls);
    const listeningIssue = management.list().find(row => row.part === 'listening'); management.grant('owner', listeningIssue.id);
    await assert.rejects(generateListening(request, fixture.lesson, 'teacher', true)); assert.equal(calls, listeningCalls + 1);
    management.grant('owner', listeningIssue.id);
    await assert.rejects(generateListening(request, fixture.lesson, 'teacher', true), /retry limit/); assert.equal(calls, listeningCalls + 1);
  } finally { management.close(); }
});

test('owner management authentication and recovery endpoint deny unauthorized, unsafe, stale and duplicate actions', async () => {
  const { manageGenerationRequest } = await import('../src/lib/management-admin.server.ts');
  const tokenRequest = token => new Request('https://app.example.test/beta-management', { headers: token ? { authorization: `Bearer ${token}` } : {} });
  let calls = 0, ownerStore, management, budget;
  try {
    globalThis.fetch = async (_url, init) => {
      calls++; const token = new Headers(init.headers).get('authorization');
      return token === 'Bearer expired' ? Response.json({ message: 'Expired', code: 'bad_jwt' }, { status: 401 }) : Response.json({ id: token === 'Bearer owner' ? 'owner' : 'teacher', user_metadata: { role: 'owner' } });
    };
    await assert.rejects(betaAdministrator(tokenRequest()), /Sign in/); assert.equal(calls, 0);
    await assert.rejects(betaAdministrator(tokenRequest('teacher')), /Only the owner/);
    await assert.rejects(betaAdministrator(tokenRequest('expired')), /expired/);
    assert.equal(existsSync(process.env.TEACHERFLOW_BETA_DB), false); assert.equal(existsSync(process.env.TEACHERFLOW_MANAGEMENT_DB), false);
    const authorized = await betaAdministrator(tokenRequest('owner')); ownerStore = authorized.store; assert.equal(authorized.actor, 'owner');
    const codes = ownerStore.issue(); ownerStore.claim('teacher', codes[0]);
    management = new ManagementStore(); budget = new BetaBudget();
    const charge = budget.reserve('teacher', 'charge-before-support', 'text', 'test', .3); budget.settle(charge, .1);
    const beforeBudget = budget.status();
    for (let attempt = 0; attempt < 3; attempt++) await assert.rejects(ownerStore.stage('teacher', request, 'foundation', async () => { throw Error('Invalid generated answer'); }));
    const issue = management.list()[0]; const action = { id: issue.id, action: 'allow_retry' };
    await assert.rejects(manageGenerationRequest(tokenRequest(), action), /Sign in/);
    await assert.rejects(manageGenerationRequest(tokenRequest('teacher'), action), /Only the owner/);
    await assert.rejects(manageGenerationRequest(tokenRequest('expired'), action), /expired/);
    assert.equal(state(ownerStore).teachers.teacher.runs[issue.lesson].parts.foundation.retryCredits, undefined);
    assert.deepEqual(await manageGenerationRequest(tokenRequest('owner'), action), { ok: true });
    assert.deepEqual(await manageGenerationRequest(tokenRequest('owner'), action), { ok: true });
    assert.equal(state(ownerStore).teachers.teacher.runs[issue.lesson].parts.foundation.retryCredits, 1);
    assert.equal(management.history().filter(row => row.action === 'allow_retry').length, 1);
    for (const error of ['The provider charge is uncertain.', 'Budget exhausted', 'Provider credits exhausted', 'Unauthorized access']) {
      const id = management.begin({ user: 'teacher', request, part: 'reading', target: 'protected' }); management.finish(id, Error(error));
      await assert.rejects(manageGenerationRequest(tokenRequest('owner'), { id, action: 'allow_retry' }), /billing, budget, or access/);
      await assert.rejects(manageGenerationRequest(tokenRequest('owner'), { id, action: 'restore_slot' }), /billing, budget, or access/);
    }
    const browser = failure(management, { source: 'browser', part: 'reading', target: 'browser' });
    await assert.rejects(manageGenerationRequest(tokenRequest('owner'), { id: browser, action: 'allow_retry' }), /confirmed server failure/);
    const interrupted = management.begin({ user: 'teacher', request, part: 'reading', target: 'stale' });
    management.db.prepare("UPDATE operations SET status='interrupted',issue='open' WHERE id=?").run(interrupted);
    await assert.rejects(manageGenerationRequest(tokenRequest('owner'), { id: interrupted, action: 'restore_slot' }), /confirmed server failure/);
    const old = failure(management, { part: 'reading', target: 'same-time' });
    const pending = management.begin({ user: 'teacher', request, part: 'reading', target: 'same-time' });
    management.db.prepare('UPDATE operations SET started=? WHERE id IN (?,?)').run(Date.now(), old, pending);
    await assert.rejects(manageGenerationRequest(tokenRequest('owner'), { id: old, action: 'allow_retry' }), /generating|resumed|recovered/);
    management.finish(pending, Error('Invalid generated answer'));
    const restore = { id: issue.id, action: 'restore_slot' };
    await manageGenerationRequest(tokenRequest('owner'), restore); await manageGenerationRequest(tokenRequest('owner'), restore);
    assert.equal(ownerStore.status('teacher').remaining, 3);
    await manageGenerationRequest(tokenRequest('owner'), { id: issue.id, action: 'resolve' });
    await manageGenerationRequest(tokenRequest('owner'), { id: issue.id, action: 'resolve' });
    assert.equal(management.get(issue.id).issue, 'resolved'); assert.equal(management.history().filter(row => row.action === 'resolve').length, 1);
    const last = failure(management, { part: 'reading', target: 'removed' });
    const seat = ownerStore.administration().seats[0]; ownerStore.manageSeat('owner', { seat: 1, revision: seat.revision, user: 'teacher', action: 'deactivate' });
    await assert.rejects(manageGenerationRequest(tokenRequest('owner'), { id: last, action: 'allow_retry' }), /active beta access/);
    assert.deepEqual(budget.status(), beforeBudget);
    process.env.TEACHERFLOW_BETA = 'false'; await assert.rejects(betaAdministrator(tokenRequest('owner')), /not enabled/);
  } finally { ownerStore?.db.close(); management?.close(); budget?.close(); }
});

test('browser reporting API enforces verified identity, lesson ownership, source integrity, revocation and idempotent completion', async () => {
  const { Route } = await module('/src/routes/api/generation-events.ts');
  const { betaStore } = await module('/src/lib/beta-store.server.ts');
  const handler = Route.options.server.handlers.POST;
  const store = betaStore(), management = new ManagementStore();
  const [code, other] = store.issue(); store.claim('teacher', code); store.claim('other', other);
  await store.stage('teacher', request, 'foundation', async () => ({ overview: 'Saved' }));
  globalThis.fetch = async (_url, init) => {
    const auth = new Headers(init.headers).get('authorization');
    return auth === 'Bearer expired' ? Response.json({ message: 'Expired' }, { status: 401 }) : Response.json({ id: auth === 'Bearer other' ? 'other' : 'teacher' });
  };
  const report = (token, body) => handler({ request: new Request('https://app.example.test/api/generation-events', { method: 'POST', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  try {
    const event = { id: randomUUID(), request, part: 'export', status: 'started' };
    assert.equal((await report('', event)).status, 403); assert.equal((await report('expired', event)).status, 403);
    assert.equal((await report('other', event)).status, 403);
    const server = failure(management, { part: 'export' });
    assert.equal((await report('teacher', { ...event, id: server, status: 'completed' })).status, 403);
    assert.equal((await report('teacher', event)).status, 200);
    assert.equal((await report('teacher', { ...event, status: 'failed', error: 'Export interrupted Bearer private' })).status, 200);
    assert.equal((await report('teacher', { ...event, status: 'completed' })).status, 200);
    assert.equal(management.get(event.id).status, 'failed', 'Duplicate late browser messages cannot overwrite the first terminal result');
    assert.doesNotMatch(management.get(event.id).failure.detail, /Bearer private/);
    const seat = store.administration().seats[0]; store.manageSeat('owner', { seat: 1, revision: seat.revision, user: 'teacher', action: 'deactivate' });
    assert.equal((await report('teacher', { ...event, id: randomUUID() })).status, 403, 'Revoked invitation cannot write management events');
  } finally { management.close(); store.db.close(); }
});

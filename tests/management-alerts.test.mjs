import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ManagementStore } from '../src/lib/management-store.server.ts';
import { betaStore } from '../src/lib/beta-store.server.ts';
import { emailConfiguration, queueManagementAlerts, deliverManagementAlerts } from '../src/lib/management-alerts.server.ts';

const directory = mkdtempSync(join(tmpdir(), 'tf-management-alerts-'));
const keys = ['TEACHERFLOW_MANAGEMENT_DB', 'TEACHERFLOW_BETA_DB', 'TEACHERFLOW_BUDGET_DB', 'RESEND_API_KEY', 'TEACHERFLOW_ALERT_FROM', 'TEACHERFLOW_ALERT_TO'];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
let store, sequence = 0;
beforeEach(() => {
  store?.close();
  Object.assign(process.env, { TEACHERFLOW_MANAGEMENT_DB: join(directory, `management-${++sequence}.sqlite`),
    TEACHERFLOW_BETA_DB: join(directory, 'beta.sqlite'), TEACHERFLOW_BUDGET_DB: join(directory, 'budget.sqlite'),
    RESEND_API_KEY: 'test-only-never-sent', TEACHERFLOW_ALERT_FROM: 'alerts@example.test', TEACHERFLOW_ALERT_TO: 'owner@example.test' });
  globalThis.fetch = async () => assert.fail('Tests must never send mail or make a real provider call');
  store = new ManagementStore();
  if (sequence === 1) { const beta = betaStore(); const [code] = beta.issue(); beta.claim('teacher', code, 'teacher@example.test', 'Teacher Name'); }
});
after(() => { store?.close(); betaStore().db.close(); globalThis.fetch = originalFetch;
  for (const key of keys) saved[key] === undefined ? delete process.env[key] : process.env[key] = saved[key];
  rmSync(directory, { recursive: true, force: true });
});

function failure({ user = 'teacher', part = 'foundation', error = 'The request was rate limited', age = 6 * 60_000, now = Date.now(), topic = 'The park' } = {}) {
  const id = store.begin({ user, request: { topic, level: 'A1', teacherNotes: 'Use classroom vocabulary.' }, part });
  store.finish(id, error);
  store.db.prepare('UPDATE operations SET started=?,updated=?,finished=? WHERE id=?').run(now - age, now - age, now - age, id);
  return id;
}
const jobs = () => store.db.prepare('SELECT * FROM alert_outbox ORDER BY created,id').all().map(row => ({ ...row, body: JSON.parse(row.body) }));
const accepted = async () => Response.json({ id: 'fake-provider-acceptance' });

test('mail configuration rejects missing or injected sender/recipient settings without exposing API keys', () => {
  assert.equal(emailConfiguration().configured, true);
  assert.doesNotMatch(JSON.stringify(emailConfiguration()), /test-only-never-sent/);
  process.env.TEACHERFLOW_ALERT_FROM = 'alerts@example.test\r\nBcc: stranger@example.test';
  assert.equal(emailConfiguration().configured, false);
  assert.ok(emailConfiguration().missing.includes('TEACHERFLOW_ALERT_FROM'));
  process.env.TEACHERFLOW_ALERT_FROM = 'alerts@example.test';
  delete process.env.RESEND_API_KEY;
  assert.deepEqual(emailConfiguration().missing, ['RESEND_API_KEY']);
});

test('failure alerts wait for recovery, group by cause, retain submitted settings, redact diagnostics, and queue once', () => {
  const now = Date.now();
  const first = failure({ now, error: 'Rate limit Bearer private-token https://provider.test/?key=private' });
  const second = failure({ now, user: 'second-teacher' });
  failure({ now, error: 'Invalid generated answer' });
  const recent = failure({ now, age: 1000 });
  const recovered = failure({ now, user: 'recovered-teacher' });
  store.finish(store.begin({ user: 'recovered-teacher', request: store.get(recovered).request, part: 'foundation' }));
  queueManagementAlerts(store, now); queueManagementAlerts(store, now);
  const outbox = jobs(); assert.equal(outbox.length, 2);
  assert.deepEqual(new Set(outbox.flatMap(job => job.body.issueIds)), new Set([first, second, ...store.list().filter(row => row.failure?.category === 'content').map(row => row.id)]));
  assert.ok(outbox.every(job => !job.body.issueIds.includes(recent) && !job.body.issueIds.includes(recovered)));
  assert.match(outbox.map(job => job.body.text).join('\n'), /Use classroom vocabulary/);
  assert.match(outbox.map(job => job.body.text).join('\n'), /Teacher Name <teacher@example\.test>/);
  assert.doesNotMatch(outbox.map(job => job.body.text).join('\n'), /private-token|key=private/);
  queueManagementAlerts(store, now + 1800000);
  assert.equal(jobs().length, 3, 'Previously covered issues are not sent again; newly aged issue gets one later digest');
});

test('disabled and unconfigured email do not send; a recovery before delivery cancels the queued alert', async () => {
  const now = Date.now(), id = failure({ now });
  store.saveSettings('owner', { emailEnabled: false, dailySummary: false });
  queueManagementAlerts(store, now); assert.equal(jobs().length, 0);
  store.saveSettings('owner', { emailEnabled: true, dailySummary: false });
  queueManagementAlerts(store, now); assert.equal(jobs().length, 1);
  delete process.env.RESEND_API_KEY;
  await deliverManagementAlerts(store, () => assert.fail('No configured mail service'), now);
  assert.equal(jobs()[0].attempts, 0);
  process.env.RESEND_API_KEY = 'test-only-never-sent';
  store.resolve('owner', id);
  await deliverManagementAlerts(store, () => assert.fail('Resolved issue must not send'), now);
  assert.equal(jobs()[0].status, 'canceled');
});

test('delivery freezes recipients and body, retries the same idempotency key, sanitizes errors, and survives restart', async () => {
  const now = Date.now(); failure({ now }); queueManagementAlerts(store, now);
  const requests = [];
  await deliverManagementAlerts(store, async (url, init) => {
    requests.push({ url, headers: init.headers, body: init.body });
    throw Error('network failure Bearer secret-token https://private.example/');
  }, now);
  let job = jobs()[0];
  assert.equal(job.attempts, 1); assert.equal(job.status, 'queued'); assert.equal(job.next, now + 60000);
  assert.doesNotMatch(job.error, /secret-token|private\.example/);
  await deliverManagementAlerts(store, () => assert.fail('Backoff must be honored'), now + 59999);
  store.close(); store = new ManagementStore();
  process.env.TEACHERFLOW_ALERT_TO = 'replacement@example.test';
  process.env.TEACHERFLOW_ALERT_FROM = 'replacement-sender@example.test';
  await deliverManagementAlerts(store, async (url, init) => { requests.push({ url, headers: init.headers, body: init.body }); return Response.json({ id: 'accepted-mail' }); }, now + 60000);
  job = jobs()[0]; assert.equal(job.status, 'accepted'); assert.equal(job.attempts, 2); assert.equal(job.error, null);
  assert.equal(requests[0].url, 'https://api.resend.com/emails');
  assert.equal(requests[0].headers['Idempotency-Key'], requests[1].headers['Idempotency-Key']);
  assert.equal(requests[0].body, requests[1].body);
  assert.deepEqual(JSON.parse(requests[1].body).to, ['owner@example.test']);
  await deliverManagementAlerts(store, () => assert.fail('Accepted mail must never send again'), now + 999999);
});

test('two workers lease one queued message; uncertain or rejected acceptance is retried with bounded delays', async () => {
  const now = Date.now(); failure({ now }); queueManagementAlerts(store, now);
  const other = new ManagementStore();
  let release, calls = 0;
  const wait = new Promise(resolve => { release = resolve; });
  try {
    const sending = deliverManagementAlerts(store, async () => { calls++; await wait; return new Response('', { status: 503 }); }, now);
    await deliverManagementAlerts(other, () => assert.fail('Active lease belongs to first worker'), now + 1);
    assert.equal(jobs()[0].attempts, 1); release(); await sending;
    assert.equal(calls, 1); assert.equal(jobs()[0].lease, 0);
    await deliverManagementAlerts(other, async () => Response.json({ ok: true }), now + 60000);
    assert.equal(jobs()[0].attempts, 2); assert.equal(jobs()[0].status, 'queued');
    assert.match(jobs()[0].error, /acceptance could not be confirmed/);
    assert.equal(jobs()[0].next, now + 180000);
    await deliverManagementAlerts(other, accepted, now + 180000);
    assert.equal(jobs()[0].status, 'accepted');
  } finally { release?.(); other.close(); }
});

test('crashed delivery leases expire and automatic retry ends before provider idempotency expires', async () => {
  const now = Date.now(); failure({ now }); queueManagementAlerts(store, now);
  store.db.prepare('UPDATE alert_outbox SET lease=?,attempts=1').run(now + 60000);
  await deliverManagementAlerts(store, () => assert.fail('Lease not expired'), now + 59000);
  await deliverManagementAlerts(store, async () => { throw Error('Unconfirmed send'); }, now + 60001);
  assert.equal(jobs()[0].attempts, 2);
  await deliverManagementAlerts(store, () => assert.fail('Do not replay past idempotency retention'), now + 23 * 3600000);
  assert.equal(jobs()[0].status, 'review'); assert.equal(jobs()[0].attempts, 2);
  queueManagementAlerts(store, now + 24 * 3600000);
  assert.equal(jobs().length, 1, 'Uncertain old mail stays visible for owner review without silently requeueing');
});

test('optional daily summaries include recovered previous-day issues exactly once and exclude ordinary success', async () => {
  const now = Math.floor(Date.now() / 86400000) * 86400000 + 3600000;
  const recovered = failure({ now, age: 2 * 3600000 });
  store.db.prepare("UPDATE operations SET issue='recovered' WHERE id=?").run(recovered);
  const completed = store.begin({ user: 'other', request: { topic: 'Normal success' }, part: 'foundation' }); store.finish(completed);
  queueManagementAlerts(store, now); assert.equal(jobs().length, 0);
  store.saveSettings('owner', { emailEnabled: true, dailySummary: true });
  queueManagementAlerts(store, now); queueManagementAlerts(store, now + 60000);
  assert.equal(jobs().length, 1); assert.match(jobs()[0].body.subject, /daily/);
  assert.deepEqual(jobs()[0].body.issueIds, [recovered]);
  await deliverManagementAlerts(store, accepted, now);
  assert.equal(jobs()[0].status, 'accepted', 'Daily recovery summaries must not be canceled as resolved alerts');
});

test('three recovered server failures produce one investigation alert while isolated and browser recoveries stay quiet', async () => {
  const now = Date.now();
  const repeated = [failure({ now }), failure({ now }), failure({ now })];
  for (const id of repeated) store.db.prepare("UPDATE operations SET issue='recovered' WHERE id=?").run(id);
  const isolated = failure({ now, user: 'isolated' }); store.db.prepare("UPDATE operations SET issue='recovered' WHERE id=?").run(isolated);
  for (let i = 0; i < 3; i++) { const id = failure({ now, user: 'browser' }); store.db.prepare("UPDATE operations SET issue='recovered',source='browser' WHERE id=?").run(id); }
  queueManagementAlerts(store, now); queueManagementAlerts(store, now + 60000);
  assert.equal(jobs().length, 1); assert.equal(jobs()[0].body.kind, 'repeated');
  assert.deepEqual(new Set(jobs()[0].body.issueIds), new Set(repeated));
  assert.match(jobs()[0].body.text, /eventually recovered/);
  await deliverManagementAlerts(store, accepted, now);
  assert.equal(jobs()[0].status, 'accepted', 'Repeated recovered failures are an investigation alert, not a canceled open-issue alert');
  queueManagementAlerts(store, now + 1800000); assert.equal(jobs().length, 1);
});

test('a daily summary never suppresses a later unresolved-issue alert for the same operation', () => {
  const midnight = Math.floor(Date.now() / 86400000) * 86400000;
  const now = midnight + 60000;
  const id = failure({ now, age: 120000 });
  store.saveSettings('owner', { emailEnabled: true, dailySummary: true });
  queueManagementAlerts(store, now);
  assert.equal(jobs().length, 1); assert.equal(jobs()[0].body.kind, 'daily');
  assert.deepEqual(jobs()[0].body.issueIds, [id]);
  queueManagementAlerts(store, now + 5 * 60000);
  assert.equal(jobs().length, 2);
  const issue = jobs().find(job => job.body.kind === 'issue'); assert.deepEqual(issue.body.issueIds, [id]);
});

test('disabling the optional summary suppresses an already queued daily email without disabling issue alerts', async () => {
  const midnight = Math.floor(Date.now() / 86400000) * 86400000;
  const now = midnight + 3600000;
  const recovered = failure({ now, age: 2 * 3600000 }); store.db.prepare("UPDATE operations SET issue='recovered' WHERE id=?").run(recovered);
  store.saveSettings('owner', { emailEnabled: true, dailySummary: true }); queueManagementAlerts(store, now);
  assert.equal(jobs().length, 1); assert.equal(jobs()[0].body.kind, 'daily');
  store.saveSettings('owner', { emailEnabled: true, dailySummary: false });
  await deliverManagementAlerts(store, () => assert.fail('Owner opted out before delivery'), now);
  assert.equal(jobs()[0].status, 'canceled');
  const open = failure({ now }); queueManagementAlerts(store, now + 60000);
  let delivered = 0;
  await deliverManagementAlerts(store, async (_url, init) => { delivered++; assert.match(JSON.parse(init.body).subject, /need attention/); return accepted(); }, now + 60000);
  assert.equal(delivered, 1); assert.equal(jobs().find(job => job.body.issueIds.includes(open)).status, 'accepted');
});

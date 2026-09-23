import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {BetaStore, betaStore} from '../src/lib/beta-store.server.ts';
import {AccessRequestStore, RequestLimitError} from '../src/lib/access-request-store.server.ts';
import {submitAccessRequest, ownerAccessRequests, activateRequestedAccess} from '../src/lib/access-request.server.ts';

const application = (email = 'teacher@example.test') => ({name: 'Sample Teacher', email, teaching: 'English, ages 8–12, A1–A2.', consent: true, website: ''});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'tf-access-'));
  const file = join(directory, 'beta.sqlite'), beta = new BetaStore(file);
  return {beta, requests: new AccessRequestStore(beta), file, close() {beta.db.close(); rmSync(directory, {recursive: true, force: true});}};
}

test('applications persist, normalize and deduplicate without overwriting a reviewed request', () => {
  const f = fixture();
  try {
    f.requests.submit(application('Teacher@Example.Test'), 'client');
    f.requests.submit({...application(), name: 'Impersonated replacement'}, 'other-client');
    const pending = f.requests.list('pending');
    assert.equal(pending.total, 1); assert.equal(pending.requests[0].name, 'Sample Teacher');
    const row = pending.requests[0];
    f.requests.review('owner', row.id, row.revision, 'declined');
    f.requests.submit(application(), 'another-client');
    assert.equal(f.requests.list('pending').total, 0);
    assert.equal(f.requests.list('declined').total, 1);
    const reopened = new BetaStore(f.file);
    try {assert.equal(new AccessRequestStore(reopened).list('declined').total, 1);} finally {reopened.db.close();}
  } finally {f.close();}
});

test('approval is atomic, retry-safe and email-bound; existing accounts and revocations cannot gain a fresh allowance', () => {
  const f = fixture();
  try {
    f.requests.submit(application(), 'client');
    const row = f.requests.list('pending').requests[0];
    assert.deepEqual(f.requests.activate({id: 'teacher', email: row.email}), {status: 'pending'});
    assert.equal(f.beta.status('teacher').claimed, false);
    assert.throws(() => f.requests.review('', row.id, row.revision, 'approved'), /Owner/);
    assert.throws(() => f.requests.review('owner', row.id, 'stale', 'approved'), /changed/);
    f.requests.review('owner', row.id, row.revision, 'approved');
    f.requests.review('owner', row.id, row.revision, 'approved');
    assert.equal(f.beta.administration().seats.length, 1);
    const invitation = f.beta.administration().seats[0];
    assert.throws(() => f.beta.claim('wrong-user', invitation.code, 'wrong@example.test'), /email approved/);
    assert.deepEqual(f.requests.activate({id: 'other', email: 'wrong@example.test'}), {status: 'none'});
    assert.deepEqual(f.requests.activate({id: 'teacher', email: row.email, name: 'Verified teacher'}), {status: 'active'});
    assert.deepEqual(f.requests.activate({id: 'teacher', email: row.email}), {status: 'active'});
    assert.equal(f.beta.status('teacher').remaining, 3);
    f.beta.transact(state => {state.teachers.teacher.runs.saved = {request: {topic: 'Existing'}, complete: true, parts: {}, images: {}};});
    assert.deepEqual(f.requests.activate({id: 'teacher', email: row.email}), {status: 'active'});
    assert.equal(f.beta.status('teacher').remaining, 2, 'Checking again must not reset an allowance');
    const seat = f.beta.administration().seats[0];
    f.beta.manageSeat('owner', {seat: seat.seat, revision: seat.revision, user: 'teacher', action: 'deactivate'});
    assert.deepEqual(f.requests.activate({id: 'teacher', email: row.email}), {status: 'inactive'});
    assert.equal(f.beta.managementProgress().lessons.length, 1, 'Completed work stays saved');
    assert.throws(() => f.requests.review('owner', row.id, row.revision, 'declined'), /changed/);
    assert.deepEqual(f.requests.activate({id: 'new-account', email: row.email}), {status: 'inactive'});
  } finally {f.close();}
});

test('approval rolls back its invitation when saving the decision fails, and replacing a key invalidates activation', () => {
  const f = fixture();
  try {
    f.requests.submit(application(), 'client'); const row = f.requests.list('pending').requests[0];
    f.beta.db.exec("CREATE TRIGGER fail_review BEFORE UPDATE ON access_requests BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
    assert.throws(() => f.requests.review('owner', row.id, row.revision, 'approved'), /fixture failure/);
    assert.equal(f.requests.list('pending').total, 1); assert.equal(f.beta.administration().seats.length, 0);
    f.beta.db.exec('DROP TRIGGER fail_review');
    f.requests.review('owner', row.id, row.revision, 'approved');
    const seat = f.beta.administration().seats[0];
    f.beta.manageSeat('owner', {seat: seat.seat, revision: seat.revision, user: null, action: 'replace'});
    assert.deepEqual(f.requests.activate({id: 'teacher', email: row.email}), {status: 'inactive'});
  } finally {f.close();}
});

test('existing teacher emails cannot be approved again; queue pagination and declines do not issue invitations', () => {
  const f = fixture();
  try {
    const [code] = f.beta.issue(); f.beta.claim('existing', code, 'teacher@example.test');
    f.requests.submit(application(), 'client'); const row = f.requests.list('pending').requests[0];
    assert.throws(() => f.requests.review('owner', row.id, row.revision, 'approved'), /already used/);
    for (let i = 0; i < 51; i++) f.requests.submit(application(`queue${i}@example.test`), `client${i}`);
    assert.equal(f.requests.list('pending').requests.length, 50);
    assert.equal(f.requests.list('pending', 50).requests.length, 2);
    f.requests.review('owner', row.id, row.revision, 'declined');
    assert.equal(f.beta.administration().seats.length, 3);
  } finally {f.close();}
});

test('rate limits survive reopening; client changes cannot bypass the global cap; consent and honeypot are enforced', () => {
  const f = fixture();
  try {
    assert.throws(() => f.requests.submit({...application(), consent: false}, 'client'));
    f.requests.submit({...application(), website: 'spam'}, 'client'); assert.equal(f.requests.list('pending').total, 0);
    for (let i = 0; i < 5; i++) f.requests.submit(application(), 'client', 10000);
    assert.throws(() => new AccessRequestStore(f.beta).submit(application(), 'client', 10000), RequestLimitError);
    for (let i = 0; i < 95; i++) f.requests.submit(application(), `different${i}`, 10000);
    assert.throws(() => f.requests.submit(application(), 'unseen-client', 10000), RequestLimitError);
    f.requests.submit(application(), 'client', 3610001);
    assert.equal(f.requests.list('pending').total, 1);
  } finally {f.close();}
});

test('public endpoint exposes no decisions; private endpoints verify identity before reading or activating requests', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tf-access-http-'));
  const keys = ['TEACHERFLOW_BETA', 'TEACHERFLOW_BETA_DB', 'TEACHERFLOW_OWNER_USER_ID', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]])), originalFetch = globalThis.fetch;
  let store;
  try {
    Object.assign(process.env, {TEACHERFLOW_BETA: 'true', TEACHERFLOW_BETA_DB: join(directory, 'beta.sqlite'), TEACHERFLOW_OWNER_USER_ID: 'owner', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'fixture'});
    globalThis.fetch = async (_input, init) => {
      const token = new Headers(init?.headers).get('authorization');
      if (token === 'Bearer owner') return Response.json({id: 'owner', email: 'owner@example.test', user_metadata: {}});
      if (token === 'Bearer teacher') return Response.json({id: 'teacher', email: 'teacher@example.test', user_metadata: {}});
      return Response.json({message: 'Invalid token'}, {status: 401});
    };
    const request = (body = application(), extra = {}) => new Request('https://teacherflow.test/api/access-request', {method: 'POST', headers: {origin: 'https://teacherflow.test', 'content-type': 'application/json', ...extra}, body: JSON.stringify(body)});
    assert.equal((await submitAccessRequest(request(application(), {origin: 'https://attacker.test'}))).status, 403);
    assert.equal((await submitAccessRequest(request({...application(), name: 'x'}))).status, 400);
    assert.equal((await submitAccessRequest(request({...application(), teaching: 'x'.repeat(9000)}))).status, 413);
    assert.equal((await submitAccessRequest(request(application(), {'content-type': 'text/plain'}))).status, 415);
    const result = await submitAccessRequest(request()); assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store'); assert.equal((await result.json()).ok, true);
    store = betaStore();
    const auth = token => new Request('https://teacherflow.test/', {headers: token ? {authorization: `Bearer ${token}`} : {}});
    await assert.rejects(ownerAccessRequests(auth()), /Sign in/);
    await assert.rejects(ownerAccessRequests(auth('expired')), /expired/);
    await assert.rejects(ownerAccessRequests(auth('teacher')), /Only the owner/);
    await assert.rejects(activateRequestedAccess(auth()), /Sign in/);
    const {actor, requests} = await ownerAccessRequests(auth('owner')); const row = requests.list('pending').requests[0];
    requests.review(actor, row.id, row.revision, 'approved');
    assert.equal((await (await submitAccessRequest(request())).json()).ok, true);
    assert.deepEqual(await activateRequestedAccess(auth('teacher')), {status: 'active'});
    process.env.TEACHERFLOW_BETA = 'false';
    assert.equal((await submitAccessRequest(request())).status, 503);
    await assert.rejects(activateRequestedAccess(auth('teacher')), /temporarily closed/);
  } finally {
    globalThis.fetch = originalFetch; store?.db.close();
    for (const [key, value] of Object.entries(before)) {if (value === undefined) delete process.env[key]; else process.env[key] = value;}
    rmSync(directory, {recursive: true, force: true});
  }
});

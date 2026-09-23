import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSessionStore, AUTH_SESSION_TIMEOUT_MS } from '../src/lib/auth-session-store.ts';

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function fixture() {
  let callback, subscriptions = 0, reads = 0;
  const requests = [];
  const store = createAuthSessionStore(() => ({
    onAuthStateChange(next) {
      subscriptions += 1;
      callback = next;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    getSession() {
      reads += 1;
      const request = deferred();
      requests.push(request);
      return request.promise;
    },
  }));
  return {
    store, requests,
    emit: (event, session) => callback(event, session),
    counts: () => ({ subscriptions, reads }),
  };
}

test('consumers and route remounts share one read and retain the resolved account', async () => {
  const { store, requests, counts } = fixture();
  assert.deepEqual(counts(), { subscriptions: 0, reads: 0 });
  const offFirst = store.subscribe(() => {});
  const offSecond = store.subscribe(() => {});
  await flush();
  assert.deepEqual(counts(), { subscriptions: 1, reads: 1 });
  const session = { user: { id: 'teacher-one' } };
  requests[0].resolve({ data: { session } });
  await flush();
  offFirst();
  offSecond();
  store.subscribe(() => {});
  assert.deepEqual(counts(), { subscriptions: 1, reads: 1 });
  assert.deepEqual(store.getSnapshot(), { session, loading: false, error: null });
});

test('late initial reads cannot restore an account after sign-out', async () => {
  const { store, requests, emit } = fixture();
  store.subscribe(() => {});
  await flush();
  emit('SIGNED_OUT', null);
  requests[0].resolve({ data: { session: { user: { id: 'old-account' } } } });
  await flush();
  assert.deepEqual(store.getSnapshot(), { session: null, loading: false, error: null });
});

test('refresh and sign-out are observed even while no route is subscribed', async () => {
  const { store, requests, emit } = fixture();
  const unsubscribe = store.subscribe(() => {});
  await flush();
  requests[0].resolve({ data: { session: null } });
  await flush();
  unsubscribe();
  const session = { user: { id: 'teacher-one' }, access_token: 'replacement' };
  emit('TOKEN_REFRESHED', session);
  store.subscribe(() => {});
  assert.equal(store.getSnapshot().session, session);
  emit('SIGNED_OUT', null);
  assert.equal(store.getSnapshot().session, null);
});

test('a failed initial session stays unresolved and a retry can recover', async () => {
  const { store, requests, counts } = fixture();
  store.subscribe(() => {});
  await flush();
  requests[0].reject(new Error('temporary network failure'));
  await flush();
  assert.equal(store.getSnapshot().loading, true);
  assert.equal(store.getSnapshot().session, null);
  assert.ok(store.getSnapshot().error);
  store.retry();
  await flush();
  assert.equal(store.getSnapshot().error, null);
  assert.deepEqual(counts(), { subscriptions: 1, reads: 2 });
  requests[1].resolve({ data: { session: { user: { id: 'teacher-one' } } } });
  await flush();
  assert.equal(store.getSnapshot().loading, false);
  assert.equal(store.getSnapshot().session.user.id, 'teacher-one');
});

test('a stalled read exposes recovery without misclassifying the visitor as signed out', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { store, requests } = fixture();
  store.subscribe(() => {});
  await flush();
  t.mock.timers.tick(AUTH_SESSION_TIMEOUT_MS);
  assert.equal(store.getSnapshot().loading, true);
  assert.ok(store.getSnapshot().error);
  // If the original response arrives before a retry, it is still useful.
  requests[0].resolve({ data: { session: null } });
  await flush();
  assert.deepEqual(store.getSnapshot(), { session: null, loading: false, error: null });
});

test('an older failed request cannot override a newer sign-in event', async () => {
  const { store, requests, emit } = fixture();
  store.subscribe(() => {});
  await flush();
  const session = { user: { id: 'new-account' } };
  emit('SIGNED_IN', session);
  requests[0].reject(new Error('old request failed'));
  await flush();
  assert.deepEqual(store.getSnapshot(), { session, loading: false, error: null });
});

test('session errors returned as data remain unresolved, preserving a known account on retry', async () => {
  const { store, requests } = fixture();
  store.subscribe(() => {});
  await flush();
  const session = { user: { id: 'teacher-one' } };
  requests[0].resolve({ data: { session } });
  await flush();
  store.retry();
  await flush();
  requests[1].resolve({ data: { session: null }, error: new Error('storage failure') });
  await flush();
  assert.equal(store.getSnapshot().session, session);
  assert.equal(store.getSnapshot().loading, false);
  assert.ok(store.getSnapshot().error);
});

test('client initialization failures can be retried without an unhandled rejection', async () => {
  let attempts = 0;
  const store = createAuthSessionStore(() => {
    attempts += 1;
    if (attempts === 1) throw new Error('storage unavailable');
    return {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: null } }),
    };
  });
  store.subscribe(() => {});
  assert.equal(store.getSnapshot().loading, true);
  assert.ok(store.getSnapshot().error);
  store.retry();
  await flush();
  assert.deepEqual(store.getSnapshot(), { session: null, loading: false, error: null });
});

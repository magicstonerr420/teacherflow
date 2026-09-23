import test from 'node:test';
import assert from 'node:assert/strict';
import { readRequest } from '../src/lib/read-request.ts';

test('read timeout releases stalled UI and aborts the transport without retrying', async () => {
  let calls = 0;
  let signal;
  await assert.rejects(readRequest(value => {
    calls++;
    signal = value;
    return new Promise(() => {});
  }, { timeoutMs: 10 }), /taking longer than expected/);
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
});

test('query cancellation aborts reads and does not start an already-cancelled read', async () => {
  const controller = new AbortController();
  const reason = new Error('Account changed');
  let transport;
  const pending = readRequest(signal => {
    transport = signal;
    return new Promise(() => {});
  }, { signal: controller.signal });
  controller.abort(reason);
  await assert.rejects(pending, error => error === reason);
  assert.equal(transport.aborted, true);
  let calls = 0;
  await assert.rejects(readRequest(async () => { calls++; }, { signal: controller.signal }), error => error === reason);
  assert.equal(calls, 0);
});

test('successful reads retain their result and clean up the timeout and cancellation', async () => {
  const controller = new AbortController();
  let transport;
  const result = await readRequest(async signal => { transport = signal; return ['lesson']; }, { signal: controller.signal, timeoutMs: 10 });
  assert.deepEqual(result, ['lesson']);
  controller.abort();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(transport.aborted, false);
});

test('a timed-out read observes late failures and a separate retry can succeed', async () => {
  let failLate;
  await assert.rejects(readRequest(() => new Promise((_resolve, reject) => { failLate = reject; }), { timeoutMs: 5 }));
  failLate(new Error('Late network rejection'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await readRequest(async () => 'recovered'), 'recovered');
});

test('read failures, including synchronous and falsy rejections, are preserved', async () => {
  const error = new Error('Read denied');
  await assert.rejects(readRequest(() => { throw error; }), result => result === error);
  await assert.rejects(readRequest(() => Promise.reject(null)), result => result === null);
});

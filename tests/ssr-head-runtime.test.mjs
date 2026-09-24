import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

// Run after building. Exercise the real Nitro adapter, which previously dropped
// HEAD response bodies without canceling their SSR streams (120s watchdog).
test('HEAD releases SSR resources and preserves page status/headers', { timeout: 155000 }, async () => {
  const child = spawn(process.execPath, ['.output/server/index.mjs'], {
    windowsHide: true,
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '0', TEACHERFLOW_BETA: 'false', TEACHERFLOW_APPROVAL_EMAIL_PROVIDER: 'disabled' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', diagnostic = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { diagnostic += chunk; });
  try {
    let origin;
    for (let i = 0; i < 100; i++) {
      origin = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (origin) break;
      assert.equal(child.exitCode, null, 'Server exited before listening');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(origin, 'Server did not start');
    for (const route of ['/', '/examples', '/beta-management', '/missing-stability-test-page']) {
      const get = await fetch(origin + route, { signal: AbortSignal.timeout(5000) });
      assert.equal(get.status, route.startsWith('/missing-') ? 404 : 200);
      assert.match(await get.text(), /TeacherFlow/);
      for (let i = 0; i < 4; i++) {
        const head = await fetch(origin + route, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        assert.equal(head.status, get.status);
        assert.equal(head.headers.get('content-type'), get.headers.get('content-type'));
        assert.equal(head.headers.get('cache-control'), get.headers.get('cache-control'));
        assert.equal((await head.arrayBuffer()).byteLength, 0);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 125000));
    assert.doesNotMatch(diagnostic, /maximum lifetime|Stream lifetime exceeded|SSR cleanup|unhandled/i);
    assert.equal(child.exitCode, null, 'Server must survive the watchdog window');
    const after = await fetch(origin, { signal: AbortSignal.timeout(5000) });
    assert.equal(after.status, 200);
    assert.match(await after.text(), /One topic/);
  } finally {
    child.kill();
  }
});

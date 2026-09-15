import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

// Run after building, with the application's environment loaded.
test('production server renders the home, builder and sign-in routes', { timeout: 30000 }, async () => {
  const child = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  // Do not include server diagnostics in test output: they may contain configuration.
  child.stderr.resume();
  try {
    let origin;
    for (let attempt = 0; attempt < 100; attempt++) {
      origin = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (origin) break;
      assert.equal(child.exitCode, null, 'Production server exited before listening');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(origin, 'Production server did not start');
    for (const route of ['/', '/builder', '/auth']) {
      const response = await fetch(origin + route, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200, `${route} must render successfully`);
      assert.match(await response.text(), /TeacherFlow/);
    }
  } finally {
    child.kill();
  }
});

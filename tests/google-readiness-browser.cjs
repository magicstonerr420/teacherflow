const { chromium } = require('C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const origin = process.env.TEACHERFLOW_TEST_ORIGIN || 'http://127.0.0.1:3000';
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    for (const scenario of ['enabled', 'disabled', 'unknown', 'gateway', 'network', 'stalled']) {
      const context = await browser.newContext(), page = await context.newPage();
      const errors = [], authorizations = [];
      page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/auth/v1/authorize') {
          authorizations.push({ provider: url.searchParams.get('provider'), callback: url.searchParams.get('redirect_to') });
          return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>OAuth navigation intercepted for test</p>' });
        }
        if (url.origin !== origin) return route.abort();
        // On the signed-out auth page, this is the Google readiness RPC.
        if (url.pathname.startsWith('/_serverFn/')) {
          if (scenario === 'network') return route.abort();
          if (scenario === 'gateway') return route.fulfill({ status: 502, contentType: 'text/html', body: '<html><title>502</title><body>Gateway failure</body></html>' });
          if (scenario === 'stalled') { await new Promise(resolve => setTimeout(resolve, 9000)); if (page.isClosed()) return; }
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { available: scenario === 'enabled' ? true : scenario === 'disabled' ? false : null }, context: {} }) });
        }
        return route.continue();
      });
      await page.goto(origin + '/auth?redirect=%2Fprofile');
      const button = page.getByRole('button', { name: 'Continue with Google', exact: true });
      await button.waitFor({ timeout: 12000 });
      if (scenario === 'disabled') {
        assert.equal(await button.isDisabled(), true);
        await page.getByText('Google sign-in is being set up.', { exact: false }).waitFor();
        assert.equal(authorizations.length, 0);
      } else {
        assert.equal(await button.isEnabled(), true);
        if (scenario !== 'enabled') await page.getByText('We couldn’t check Google sign-in availability.', { exact: false }).waitFor();
        await button.click();
        await page.waitForURL(url => url.pathname === '/auth/v1/authorize');
        assert.deepEqual(authorizations, [{ provider: 'google', callback: origin + '/auth?redirect=%2Fprofile' }]);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS: Google sign-in remains available after network, gateway, unknown and stalled checks; explicit disabled provider stays disabled; OAuth preserves local origin and destination. No real sign-ins or emails.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

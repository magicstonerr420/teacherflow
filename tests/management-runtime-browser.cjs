// Production-built modules and real local RPCs. Only the upstream identity service is faked.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  await fs.mkdir('.local-runtime/management-ui', { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('.local-runtime/management-ui/runtime-'));
  const files = await fs.readdir('.output/public/assets');
  let project;
  for (const file of files.filter(file => file.endsWith('.js'))) {
    const source = await fs.readFile(path.join('.output/public/assets', file), 'utf8');
    project ??= source.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/)?.[1];
    assert.ok(!source.includes('node:async_hooks'), `Server-only async_hooks leaked into ${file}`);
  }
  assert.ok(project, 'Built browser Supabase project exists');
  const port = process.env.MANAGEMENT_RUNTIME_PORT || '3010', origin = `http://127.0.0.1:${port}`;
  let serverLog = '';
  const server = spawn(process.execPath, ['--experimental-transform-types', 'tests/management-runtime-server.mjs'], { cwd: process.cwd(), windowsHide: true, env: { ...process.env, MANAGEMENT_RUNTIME_FIXTURE: directory, MANAGEMENT_RUNTIME_PORT: port }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { serverLog += data; }); server.stderr.on('data', data => { serverLog += data; });
  let browser;
  try {
    for (let count = 0; count < 40; count++) {
      if (server.exitCode !== null) throw Error(`Fixture server exited: ${serverLog}`);
      try { const response = await fetch(origin); if (response.ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const context = await browser.newContext(), page = await context.newPage();
    const errors = [], rpc = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', async response => { if (response.url().includes('/_serverFn/')) rpc.push({ status: response.status(), url: response.url().split('?')[0], body: await response.text() }); });
    await context.route('**/*', route => { if (route.request().url().startsWith(origin)) return route.continue(); external.push(route.request().url().split('?')[0]); return route.abort(); });
    await page.goto(origin + '/beta-management#lesson-allowances', { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Sign in to Management' }).waitFor();
    await context.addInitScript(({ project }) => localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({ access_token: 'runtime-owner', refresh_token: 'runtime-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: 'runtime-owner', email: 'owner@example.test', app_metadata: {}, user_metadata: {} } })), { project });
    await page.reload({ waitUntil: 'networkidle' });
    await fs.writeFile(path.join(directory, 'body.txt'), await page.locator('body').innerText());
    await fs.writeFile(path.join(directory, 'rpc.json'), JSON.stringify(rpc, null, 2));
    await page.screenshot({ path: path.join(directory, 'owner.png'), fullPage: true });
    await page.getByRole('region', { name: 'Beta teacher controls' }).getByText('1 active teachers · 2 unused invitations', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Teacher progress and support', exact: true }).waitFor();
    await page.getByLabel('Choose a teacher').selectOption('runtime-teacher');
    await page.getByRole('heading', { name: 'Runtime fixture lesson', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Refresh dashboard' }).click();
    await page.getByRole('button', { name: 'Refresh teachers' }).click();
    await page.getByRole('tab', { name: 'Budget', exact: true }).click();
    await page.getByRole('region', { name: 'Beta budget' }).getByText('$9.99', { exact: true }).waitFor();
    await page.getByRole('tab', { name: /^Generation/ }).click();
    await page.getByRole('tab', { name: /^Issues/ }).click();
    await page.locator('details[aria-label="Runtime fixture lesson — Worksheet A"]').waitFor();
    assert.deepEqual(errors, []); assert.ok(external.every(url => url.startsWith('https://fonts.googleapis.com/')), 'Only remote fonts may be requested; all are blocked'); assert.ok(rpc.every(item => item.status === 200), 'All actual fixture RPC handlers succeed');
    console.log(JSON.stringify({ passed: true, checks: ['built modules', 'signed-out hydration', 'actual owner authentication middleware', 'actual loadManagement RPC serialization', 'actual teacher allowance RPC', 'refresh', 'budget', 'issues', 'nonempty SQLite notes/audit/spending/alerts', 'no server module leak'], externalRequestsSent: 0, blockedFontRequests: external.length, fixtureDirectory: directory }));
  } finally {
    await fs.writeFile(path.join(directory, 'server.log'), serverLog);
    await browser?.close(); server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

import test from 'node:test';
import assert from 'node:assert/strict';
import { configureHostedAuth } from '../src/lib/hosting-env.server.ts';

test('Render frontend settings also configure server authentication', () => {
  const env = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
  configureHostedAuth(env);
  assert.equal(env.SUPABASE_URL, env.VITE_SUPABASE_URL);
  assert.equal(env.SUPABASE_PUBLISHABLE_KEY, env.VITE_SUPABASE_PUBLISHABLE_KEY);
});
test('explicit backend settings are preserved and service credentials are never substituted', () => {
  const env = { SUPABASE_URL: 'server-url', VITE_SUPABASE_URL: 'frontend-url', SUPABASE_SERVICE_ROLE_KEY: 'private-key' };
  configureHostedAuth(env);
  assert.equal(env.SUPABASE_URL, 'server-url');
  assert.equal(env.SUPABASE_PUBLISHABLE_KEY, undefined);
});

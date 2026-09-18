import test from 'node:test';
import assert from 'node:assert/strict';
import { requestOpenRouter } from '../src/lib/openrouter.server.ts';

test('OpenRouter server boundary', async t => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalModel = process.env.OPENROUTER_MODEL;
  const args = { system: 'Teacher', input: 'Fractions', schemaName: 'worksheet', schema: { type: 'object' } };
  try {
    await t.test('missing key fails before network access', async () => {
      delete process.env.OPENROUTER_API_KEY;
      globalThis.fetch = () => { assert.fail('Must not call OpenRouter without a key'); };
      await assert.rejects(requestOpenRouter(args), /Add your OpenRouter API key/);
    });
    process.env.OPENROUTER_API_KEY = 'test-only-placeholder';
    process.env.OPENROUTER_MODEL = 'server-selected-model';
    await t.test('client cannot select a premium model and key is only in authorization header', async () => {
      globalThis.fetch = async (url, options) => {
        assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
        assert.equal(options.headers.Authorization, 'Bearer test-only-placeholder');
        assert.ok(!options.body.includes('test-only-placeholder'));
        const body = JSON.parse(options.body);
        assert.equal(body.model, 'server-selected-model');
        assert.equal(body.response_format.json_schema.strict, true);
        assert.equal(body.provider.require_parameters, true);
        assert.equal(body.provider.allow_fallbacks, true);
        assert.deepEqual(body.plugins, [{ id: 'response-healing' }]);
        return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"worksheet":"Fractions"}' } }] });
      };
      assert.deepEqual(await requestOpenRouter({ ...args, userTier: 'premium_teacher', model: 'attacker-model' }), { worksheet: 'Fractions' });
    });
    for (const [status, pattern] of [[401, /key is invalid/], [402, /needs credits/], [429, /rate limiting/], [500, /could not complete/]]) {
      await t.test(`status ${status} produces a safe actionable error`, async () => {
        globalThis.fetch = async () => new Response('sensitive upstream diagnostic', { status, headers: { 'Retry-After': '60' } });
        await assert.rejects(requestOpenRouter(args), error => pattern.test(error.message) && !error.message.includes('sensitive'));
      });
    }
    await t.test('truncated content is rejected even when it is valid JSON', async () => {
      globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] });
      await assert.rejects(requestOpenRouter(args), /output limit/);
    });
    await t.test('invalid JSON is rejected', async () => {
      globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'bad JSON' } }] });
      await assert.rejects(requestOpenRouter(args), /invalid lesson format/);
    });
    await t.test('content refusal is distinguished from truncation', async () => {
      globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: 'content_filter', message: { content: '' } }] });
      await assert.rejects(requestOpenRouter(args), /declined the content/);
    });
    await t.test('empty provider response is identified', async () => {
      globalThis.fetch = async () => Response.json({ choices: [] });
      await assert.rejects(requestOpenRouter(args), /returned no result/);
    });
    await t.test('provider errors inside a successful HTTP response are identified', async () => {
      globalThis.fetch = async () => Response.json({ error: { code: 502, message: 'Private upstream diagnostic' } });
      await assert.rejects(requestOpenRouter(args), error => /provider error/.test(error.message) && !error.message.includes('Private'));
    });
    await t.test('timeout is distinguished from network permissions', async () => {
      globalThis.fetch = async () => { throw new DOMException('Timeout', 'TimeoutError'); };
      await assert.rejects(requestOpenRouter(args), /four-minute time limit/);
      globalThis.fetch = async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'EACCES' } }); };
      await assert.rejects(requestOpenRouter(args), /Network permission must be restored/);
    });
    await t.test('complete Markdown-wrapped JSON is accepted without changing content', async () => {
      globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: '```json\n{"worksheet":"Match A to B."}\n```' } }] });
      assert.deepEqual(await requestOpenRouter(args), { worksheet: 'Match A to B.' });
    });
    await t.test('network errors do not expose diagnostics', async () => {
      globalThis.fetch = async () => { throw Error('sensitive network diagnostic'); };
      await assert.rejects(requestOpenRouter(args), /could not be reached/);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENROUTER_MODEL; else process.env.OPENROUTER_MODEL = originalModel;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { illustrationBrief, generateIllustration, IllustrationBillingError } from '../src/lib/illustration.server.ts';
import { pngFixture } from './media-fixtures.mjs';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
test('age and language level independently control illustrations', () => {
  assert.match(illustrationBrief('school', '5-7', 'A1'), /Young children/);
  const teenBeginner = illustrationBrief('school', '15-17', 'A1');
  assert.match(teenBeginner, /Teenagers/);
  assert.match(teenBeginner, /must not infantilize/);
  const advancedChild = illustrationBrief('school', '5-7', 'C2');
  assert.match(advancedChild, /Young children/);
  assert.match(advancedChild, /Advanced language does not imply adult content/);
});

test('budget image transport returns export-compatible data URLs and rejects missing images', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalModel = process.env.OPENROUTER_IMAGE_MODEL;
  const originalQueue = process.env.TEACHERFLOW_PROVIDER_QUEUE_DB;
  const png = pngFixture().toString('base64');
  try {
    process.env.OPENROUTER_API_KEY = 'fake-test-key';
    process.env.TEACHERFLOW_PROVIDER_QUEUE_DB = join(mkdtempSync(join(tmpdir(), 'tf-image-queue-')), 'queue.sqlite');
    process.env.OPENROUTER_IMAGE_MODEL = 'black-forest-labs/flux.2-klein-4b';
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/images');
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'black-forest-labs/flux.2-klein-4b');
      assert.equal(body.n, 1);
      assert.match(body.prompt, /Teenagers/);
      assert.ok(!options.body.includes('fake-test-key'));
      return Response.json({data:[{media_type:'image/png',b64_json:png}]});
    };
    assert.equal(await generateIllustration('Sharing', '15-17', 'A1'), `data:image/png;base64,${png}`);
    let attempts = 0;
    globalThis.fetch = async () => ++attempts === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '0' } }) : Response.json({ data: [{ media_type: 'image/png', b64_json: png }] });
    assert.equal(await generateIllustration('Future society', 'Adults', 'C2'), `data:image/png;base64,${png}`);
    assert.equal(attempts, 2);
    globalThis.fetch = async () => new Response('<html><title>502</title></html>');
    await assert.rejects(generateIllustration('Future society', 'Adults', 'C2'), /incomplete picture/);
    globalThis.fetch = async () => Response.json({data:[]});
    await assert.rejects(generateIllustration('Sharing','15-17','A1'), /usable illustration/);
    for (const failure of ['bytes', 'mime', 'network', 'gateway']) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        if (failure === 'network') throw Error('private diagnostics fake-test-key');
        if (failure === 'gateway') return new Response('<html>fake-test-key</html>', { status: 502 });
        return Response.json({ data: [{ media_type: failure === 'mime' ? 'image/jpeg' : 'image/png', b64_json: failure === 'mime' ? png : 'dGVzdA==' }] });
      };
      await assert.rejects(generateIllustration('Sharing', '15-17', 'A1'), error => {
        assert.doesNotMatch(error.message, /fake-test-key|private diagnostics|<html>/); return true;
      });
      assert.equal(calls, 1, 'Uncertain or malformed image delivery never buys an automatic replacement');
    }
    globalThis.fetch = async () => Response.json({error:{message:'private provider diagnostics fake-test-key'}},{status:402});
    await assert.rejects(generateIllustration('Sharing','15-17','A1'), error => {
      assert.ok(error instanceof IllustrationBillingError);
      assert.equal(error.code,'image_billing');
      assert.match(error.message,/account balance or API-key spending allowance/);
      assert.ok(!error.message.includes('fake-test-key'));
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENROUTER_IMAGE_MODEL; else process.env.OPENROUTER_IMAGE_MODEL = originalModel;
    if (originalQueue === undefined) delete process.env.TEACHERFLOW_PROVIDER_QUEUE_DB; else process.env.TEACHERFLOW_PROVIDER_QUEUE_DB = originalQueue;
  }
});

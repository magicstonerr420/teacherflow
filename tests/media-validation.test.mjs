import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { validateImageBase64, validateImageDataUrl, isValidMp3, validateMp3DataUrl } from '../src/lib/media-validation.server.ts';
import { pngFixture, mp3Fixture, webpFixture } from './media-fixtures.mjs';

test('images require matching binary format, dimensions and a complete bounded container', () => {
  const fixtures = [['image/png', pngFixture()], ['image/webp', webpFixture], ['image/jpeg', readFileSync(new URL('../comparison/budget-image.jpg', import.meta.url))]];
  for (const [mime, bytes] of fixtures) {
    const data = `data:${mime};base64,${bytes.toString('base64')}`;
    assert.equal(validateImageBase64(bytes.toString('base64'), mime), data);
    assert.equal(validateImageDataUrl(data), data);
    assert.throws(() => validateImageBase64(bytes.subarray(0, bytes.length - 1).toString('base64'), mime), /usable illustration/);
    assert.throws(() => validateImageBase64(bytes.toString('base64'), mime === 'image/png' ? 'image/jpeg' : 'image/png'), /usable illustration/);
  }
  for (const bytes of [Buffer.from('<html>502 private diagnostics</html>'), Buffer.from('test'), pngFixture({ width: 9000 }), pngFixture({ compressed: Buffer.from('not deflate') }), pngFixture({ compressed: deflateSync(Buffer.alloc(10000)) })]) {
    assert.throws(() => validateImageBase64(bytes.toString('base64'), 'image/png'), error => {
      assert.match(error.message, /usable illustration/); assert.doesNotMatch(error.message, /html|diagnostics|deflate/); return true;
    });
  }
  const corrupt = pngFixture(); corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => validateImageBase64(corrupt.toString('base64'), 'image/png'), /usable illustration/);
  for (const invalid of ['dGVzdA', '====', 'dGVzdA==\n', 'a'.repeat(22_000_000)]) assert.throws(() => validateImageBase64(invalid, 'image/png'), /usable illustration/);
  assert.throws(() => validateImageDataUrl('data:image/svg+xml;base64,PHN2Zz4='), /usable illustration/);
});

test('MP3 requires real frame structure after ID3 and rejects HTML, wrong headers and truncated audio', () => {
  for (const tagged of [false, true]) {
    const bytes = mp3Fixture(tagged), data = `data:audio/mpeg;base64,${bytes.toString('base64')}`;
    assert.equal(isValidMp3(bytes), true);
    assert.equal(validateMp3DataUrl(data), data);
    assert.equal(isValidMp3(bytes.subarray(0, bytes.length - 1)), false);
  }
  const tagOnly = Buffer.alloc(2000); tagOnly.set([0x49, 0x44, 0x33, 4]);
  const reservedRate = mp3Fixture(); reservedRate[2] = 0xfc;
  const malformedTag = mp3Fixture(true); malformedTag[6] = 0xff;
  for (const bytes of [tagOnly, reservedRate, malformedTag, Buffer.alloc(8_000_001), Buffer.from('<!DOCTYPE html>'.repeat(100)), Buffer.alloc(501, 0xff)]) {
    assert.equal(isValidMp3(bytes), false);
    assert.throws(() => validateMp3DataUrl(`data:audio/mpeg;base64,${bytes.toString('base64')}`), /saved recording is invalid/);
  }
  assert.throws(() => validateMp3DataUrl(`data:audio/wav;base64,${mp3Fixture().toString('base64')}`), /saved recording is invalid/);
});

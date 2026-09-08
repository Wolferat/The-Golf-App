import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeDataUrl, normalizeContributionPhoto } from '../lib/contribution-photos.js';

test('decodeDataUrl rejects non-image payloads', () => {
  assert.throws(() => decodeDataUrl('data:text/plain;base64,aGk='), /Only JPEG, PNG, and WebP/);
});

test('normalizeContributionPhoto rejects corrupt bytes', async () => {
  await assert.rejects(() => normalizeContributionPhoto(Buffer.from('not-an-image')), /Only JPEG, PNG, and WebP/);
});

test('normalizeContributionPhoto accepts png input and returns jpeg bytes', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const result = await normalizeContributionPhoto(png);
  assert.equal(result.mime, 'image/jpeg');
  assert.ok(result.buffer.length > 0);
});

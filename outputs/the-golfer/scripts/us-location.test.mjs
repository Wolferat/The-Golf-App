import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocationQuery, resolveUsLocation } from '../lib/us-location.js';

test('parseLocationQuery accepts ZIP and city/state formats', () => {
  assert.deepEqual(parseLocationQuery('75090'), { type: 'zip', query: '75090', label: '75090' });
  assert.deepEqual(parseLocationQuery('Sherman, TX'), {
    type: 'city',
    query: 'Sherman, TX',
    label: 'Sherman, TX'
  });
});

test('resolveUsLocation resolves Sherman ZIP within launch area', async () => {
  const result = await resolveUsLocation('75090');
  assert.equal(result.ok, true);
  assert.equal(result.within_launch_area, true);
  assert.equal(result.source, 'local_zip_index');
});

test('distant ZIP resolves but is outside launch area', async () => {
  const result = await resolveUsLocation('90210');
  assert.equal(result.ok, true);
  assert.equal(result.within_launch_area, false);
});

test('unknown ZIP without provider returns unresolved dependency note', async () => {
  const previous = process.env.GOOGLE_GEOCODING_API_KEY;
  delete process.env.GOOGLE_GEOCODING_API_KEY;
  const result = await resolveUsLocation('99999');
  if (previous) process.env.GOOGLE_GEOCODING_API_KEY = previous;
  assert.equal(result.ok, false);
  assert.equal(result.dependency, 'GOOGLE_GEOCODING_API_KEY');
});

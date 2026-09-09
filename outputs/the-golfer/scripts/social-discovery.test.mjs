import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExactUsername } from '../lib/social-discovery.js';

test('exact username lookup rejects wildcards and invalid formats', () => {
  assert.equal(normalizeExactUsername('spidey'), 'spidey');
  assert.equal(normalizeExactUsername('sp'), null);
  assert.equal(normalizeExactUsername('spidey%'), null);
  assert.equal(normalizeExactUsername(''), null);
});

test('empty discovery input should not resolve to a username', () => {
  assert.equal(normalizeExactUsername('   '), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  retentionDaysFromSettings,
  purgeAfterFromRetention,
  moderationEvidenceSnapshot
} from '../lib/account-lifecycle.js';

test('retention days require owner configuration outside test mode', () => {
  const original = process.env.GOLFOLIO_DELETION_TEST_MODE;
  delete process.env.GOLFOLIO_DELETION_TEST_MODE;
  assert.equal(retentionDaysFromSettings({}), null);
  assert.equal(retentionDaysFromSettings({ moderation_evidence_retention_days: 90 }), 90);
  process.env.GOLFOLIO_DELETION_TEST_MODE = 'true';
  assert.equal(retentionDaysFromSettings({}), 30);
  if (original) process.env.GOLFOLIO_DELETION_TEST_MODE = original;
  else delete process.env.GOLFOLIO_DELETION_TEST_MODE;
});

test('moderation evidence avoids copying email or phone', () => {
  const snapshot = moderationEvidenceSnapshot({
    report: {
      id: 'r1',
      category: 'spam',
      details: 'test',
      reported_listing_id: 'l1',
      created_at: '2026-01-01T00:00:00.000Z'
    },
    username: 'player1'
  });
  assert.equal(snapshot.subject_username, 'player1');
  assert.equal(snapshot.content_snapshot.reported_listing_id, 'l1');
  assert.equal('email' in snapshot.content_snapshot, false);
  assert.equal('phone' in snapshot.content_snapshot, false);
});

test('purge_after is explicit when retention days configured', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const purgeAfter = purgeAfterFromRetention(30, now);
  assert.equal(purgeAfter, '2026-01-31T00:00:00.000Z');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canUseSocialFeatures,
  canReportOrBlock,
  publicPlayerCard,
  SOCIAL_ELIGIBILITY_POLICY_VERSION
} from '../lib/social.js';

test('social features require owner flag and eligible attestation', () => {
  const disabled = canUseSocialFeatures(
    { social_eligibility_status: 'eligible' },
    { social_features_enabled: false }
  );
  assert.equal(disabled.allowed, false);
  assert.equal(disabled.reason, 'social_disabled');

  const unknown = canUseSocialFeatures(
    { social_eligibility_status: 'unknown' },
    { social_features_enabled: true }
  );
  assert.equal(unknown.allowed, false);
  assert.equal(unknown.reason, 'attestation_required');

  const allowed = canUseSocialFeatures(
    { social_eligibility_status: 'eligible' },
    { social_features_enabled: true }
  );
  assert.equal(allowed.allowed, true);
});

test('reporting and blocking stay available without social eligibility', () => {
  assert.equal(canReportOrBlock().allowed, true);
});

test('ineligible players do not appear in public cards', () => {
  assert.equal(publicPlayerCard({ id: '1', username: 'player' }, { eligible: false }), null);
});

test('policy version constant is stable', () => {
  assert.match(SOCIAL_ELIGIBILITY_POLICY_VERSION, /adult-self-attestation/);
});

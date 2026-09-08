export const SOCIAL_ELIGIBILITY_POLICY_VERSION = '2026-09-adult-self-attestation-v1';

export function normalizeSocialEligibility(profile = {}) {
  return {
    status: profile.social_eligibility_status || 'unknown',
    attestation_at: profile.social_attestation_at || null,
    policy_version: profile.social_attestation_policy_version || null
  };
}

export function canUseSocialFeatures(profile = {}, appSettings = {}) {
  if (profile.account_restricted) {
    return { allowed: false, reason: 'account_restricted' };
  }
  if (!appSettings.social_features_enabled) {
    return { allowed: false, reason: 'social_disabled' };
  }
  const eligibility = normalizeSocialEligibility(profile);
  if (eligibility.status !== 'eligible') {
    return { allowed: false, reason: 'attestation_required', eligibility };
  }
  return { allowed: true, eligibility };
}

export function canReportOrBlock() {
  return { allowed: true };
}

export function publicPlayerCard(profile = {}, { blocked = false, eligible = true } = {}) {
  if (blocked || !eligible) return null;
  return {
    id: profile.id,
    username: profile.username,
    avatar: profile.avatar || null,
    city: profile.city || null,
    home_course: profile.home_course || null
  };
}

export function friendshipPairKey(a, b) {
  return [a, b].sort().join(':');
}

export const REPORT_CATEGORIES = [
  'harassment',
  'spam',
  'inappropriate_content',
  'impersonation',
  'safety_concern',
  'other'
];

export const RATE_LIMITS = {
  friend_request_per_hour: 10,
  report_per_day: 5,
  username_lookup_per_hour: 30
};

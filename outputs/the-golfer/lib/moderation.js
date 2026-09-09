export function isAccountRestricted(profile = {}) {
  return profile.account_restricted === true;
}

export function assertSocialAllowed(profile = {}, { allowReport = false, allowBlock = false } = {}) {
  if (allowReport || allowBlock) return { allowed: true };
  if (isAccountRestricted(profile)) {
    return { allowed: false, reason: 'account_restricted' };
  }
  return { allowed: true };
}

export const MODERATION_ACTIONS = [
  'open_review',
  'close_report',
  'restrict_account',
  'clear_restriction',
  'note'
];

export const REPORT_STATUSES = ['open', 'reviewing', 'closed'];

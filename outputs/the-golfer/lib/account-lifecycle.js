const DEFAULT_RETENTION_DAYS = Number(process.env.MODERATION_EVIDENCE_RETENTION_DAYS_TEST || 30);

export function retentionDaysFromSettings(appSettings = {}) {
  const configured = appSettings.moderation_evidence_retention_days;
  if (configured == null) {
    if (process.env.NODE_ENV === 'test' || process.env.GOLFOLIO_DELETION_TEST_MODE === 'true') {
      return DEFAULT_RETENTION_DAYS;
    }
    return null;
  }
  const days = Number(configured);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return null;
  return days;
}

export function purgeAfterFromRetention(days, now = new Date()) {
  if (days == null) return null;
  return new Date(now.getTime() + days * 86400000).toISOString();
}

export function moderationEvidenceSnapshot({ report, username }) {
  return {
    subject_username: username || null,
    report_id: report?.id || null,
    category: report?.category || 'unknown',
    summary: String(report?.details || report?.category || 'report').slice(0, 2000),
    content_snapshot: {
      reported_user_id: report?.reported_user_id || null,
      reported_listing_id: report?.reported_listing_id || null,
      created_at: report?.created_at || null
    }
  };
}

export async function deleteUserOwnedData(supabase, userId) {
  const tables = [
    `saved_listings?user_id=eq.${userId}`,
    `listing_photo_contributions?contributor_id=eq.${userId}`,
    `listing_reviews?player_id=eq.${userId}`,
    `rounds?player_id=eq.${userId}`,
    `player_friendships?or=(requester_id.eq.${userId},addressee_id.eq.${userId})`,
    `player_blocks?or=(blocker_id.eq.${userId},blocked_id.eq.${userId})`,
    `player_reports?reporter_id=eq.${userId}`,
    `player_follows?or=(follower_id.eq.${userId},following_id.eq.${userId})`,
    `user_settings?user_id=eq.${userId}`
  ];
  for (const path of tables) {
    await supabase(path, { method: 'DELETE' }).catch(() => {});
  }
}

export async function deleteAuthUser(userId) {
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error('Account deletion service is not configured.');
  const response = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error_description || 'Could not remove authentication access.');
  }
}

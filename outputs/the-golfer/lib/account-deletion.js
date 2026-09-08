import {
  moderationEvidenceSnapshot,
  purgeAfterFromRetention,
  retentionDaysFromSettings,
  deleteAuthUser
} from './account-lifecycle.js';

export async function verifyUserPassword(email, password) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon || !email || !password) {
    throw Object.assign(new Error('Password confirmation is required to delete your account.'), { status: 400 });
  }
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) {
    throw Object.assign(new Error('Password confirmation failed.'), { status: 401 });
  }
}

export async function appendDeletionStep(supabase, requestId, step, status, detail = null) {
  const [row] = await supabase(
    `account_deletion_requests?id=eq.${encodeURIComponent(requestId)}&select=id,steps`
  );
  const steps = Array.isArray(row?.steps) ? row.steps : [];
  steps.push({ step, status, detail, at: new Date().toISOString() });
  await supabase(`account_deletion_requests?id=eq.${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ steps })
  });
}

export async function listUserStoragePaths(supabase, userId) {
  const paths = [];
  const contributions = await supabase(
    `listing_photo_contributions?contributor_id=eq.${encodeURIComponent(userId)}&select=storage_path`
  ).catch(() => []);
  for (const row of contributions) if (row.storage_path) paths.push({ bucket: 'player-contributions', path: row.storage_path });

  const reviews = await supabase(
    `listing_reviews?player_id=eq.${encodeURIComponent(userId)}&select=id,photo_path`
  ).catch(() => []);
  for (const row of reviews) if (row.photo_path) paths.push({ bucket: 'review-photos', path: row.photo_path });

  return paths;
}

export async function deleteStoragePaths(storageRemove, paths) {
  const failures = [];
  for (const item of paths) {
    try {
      await storageRemove(item.bucket, item.path);
    } catch (error) {
      failures.push({ ...item, error: error.message || 'storage_delete_failed' });
    }
  }
  return failures;
}

export async function deleteUserOwnedDataStrict(supabase, userId) {
  const tables = [
    ['saved_listings', `saved_listings?user_id=eq.${userId}`],
    ['listing_photo_contributions', `listing_photo_contributions?contributor_id=eq.${userId}`],
    ['listing_reviews', `listing_reviews?player_id=eq.${userId}`],
    ['rounds', `rounds?player_id=eq.${userId}`],
    ['player_friendships', `player_friendships?or=(requester_id.eq.${userId},addressee_id.eq.${userId})`],
    ['player_invitations', `player_invitations?inviter_id=eq.${userId}`],
    ['player_blocks', `player_blocks?or=(blocker_id.eq.${userId},blocked_id.eq.${userId})`],
    ['player_reports', `player_reports?reporter_id=eq.${userId}`],
    ['player_follows', `player_follows?or=(follower_id.eq.${userId},following_id.eq.${userId})`],
    ['user_settings', `user_settings?user_id=eq.${userId}`],
    ['social_rate_events', `social_rate_events?user_id=eq.${userId}`]
  ];
  const failures = [];
  for (const [name, path] of tables) {
    try {
      await supabase(path, { method: 'DELETE' });
    } catch (error) {
      failures.push({ table: name, error: error.message || 'delete_failed' });
    }
  }
  return failures;
}

export async function archiveModerationEvidence(supabase, { userId, username, reports, retentionDays }) {
  const purgeAfter = purgeAfterFromRetention(retentionDays);
  const failures = [];
  for (const report of reports) {
    try {
      const snapshot = moderationEvidenceSnapshot({ report, username });
      await supabase('moderation_evidence', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          subject_user_id: userId,
          subject_username: snapshot.subject_username,
          report_id: snapshot.report_id,
          category: snapshot.category,
          summary: snapshot.summary,
          content_snapshot: snapshot.content_snapshot,
          purge_after: purgeAfter
        })
      });
    } catch (error) {
      failures.push({ step: 'moderation_evidence', report_id: report.id, error: error.message });
    }
  }
  return failures;
}

export async function purgeExpiredEvidence(supabase, now = new Date()) {
  const due = await supabase(
    `moderation_evidence?purge_after=not.is.null&purge_after=lte.${encodeURIComponent(now.toISOString())}&select=id`
  );
  if (!due.length) return { purged: 0 };
  await supabase(
    `moderation_evidence?purge_after=not.is.null&purge_after=lte.${encodeURIComponent(now.toISOString())}`,
    { method: 'DELETE' }
  );
  return { purged: due.length };
}


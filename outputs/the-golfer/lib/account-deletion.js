import {
  moderationEvidenceSnapshot,
  purgeAfterFromRetention,
  retentionDaysFromSettings,
  deleteAuthUser
} from './account-lifecycle.js';

export { deleteAuthUser, retentionDaysFromSettings, purgeAfterFromRetention } from './account-lifecycle.js';

const REQUIRED_COMPLETION_STEPS = [
  'moderation_evidence',
  'owned_data_cleanup',
  'profile_scrub',
  'auth_delete'
];

export function storageObjectsFromPaths(paths = []) {
  return (paths || []).map(({ bucket, path }) => ({
    bucket,
    path,
    status: 'pending'
  }));
}

export function requiredStepsComplete(steps = []) {
  const completed = new Set(
    (steps || []).filter((entry) => entry.status === 'completed').map((entry) => entry.step)
  );
  return REQUIRED_COMPLETION_STEPS.every((step) => completed.has(step));
}

export function pendingStorageRemaining(objects = []) {
  return (objects || []).filter((item) => item.status !== 'deleted');
}

export function allStorageDeleted(objects = []) {
  return !(objects || []).some((item) => item.status !== 'deleted');
}

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
  return steps;
}

export async function listUserStoragePaths(supabase, userId) {
  const paths = [];
  const contributions = await supabase(
    `listing_photo_contributions?contributor_id=eq.${encodeURIComponent(userId)}&select=storage_path`
  );
  for (const row of contributions) {
    if (row.storage_path) paths.push({ bucket: 'player-contributions', path: row.storage_path });
  }

  const reviews = await supabase(
    `listing_reviews?player_id=eq.${encodeURIComponent(userId)}&select=id,photo_path`
  );
  for (const row of reviews) {
    if (row.photo_path) paths.push({ bucket: 'review-photos', path: row.photo_path });
  }

  return paths;
}

export async function persistPendingStorageObjects(supabase, requestId, paths) {
  const pending_storage_objects = storageObjectsFromPaths(paths);
  await supabase(`account_deletion_requests?id=eq.${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ pending_storage_objects })
  });
  return pending_storage_objects;
}

export async function storageRemoveStrict(bucket, path) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Storage is not configured.');
  const response = await fetch(`${url}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prefixes: [path] })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || 'Storage delete failed.');
  }
}

export async function attemptPendingStorageCleanup(storageRemoveFn, objects = []) {
  const next = (objects || []).map((item) => ({ ...item }));
  const failures = [];
  for (const item of next) {
    if (item.status === 'deleted') continue;
    try {
      await storageRemoveFn(item.bucket, item.path);
      item.status = 'deleted';
      item.deleted_at = new Date().toISOString();
      delete item.error;
    } catch (error) {
      item.status = 'failed';
      item.error = error.message || 'storage_delete_failed';
      failures.push({ bucket: item.bucket, path: item.path, error: item.error });
    }
  }
  return { objects: next, failures };
}

export async function deleteStoragePaths(storageRemoveFn, paths) {
  const { failures } = await attemptPendingStorageCleanup(
    storageRemoveFn,
    storageObjectsFromPaths(paths)
  );
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

export async function markDeletionCompleted(supabase, requestId, { steps = [] } = {}) {
  if (!requiredStepsComplete(steps)) {
    throw Object.assign(new Error('Cannot mark deletion complete while required steps remain unfinished.'), {
      status: 409
    });
  }
  await supabase(`account_deletion_requests?id=eq.${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'completed',
      completed_at: new Date().toISOString(),
      cleanup_completed_at: new Date().toISOString(),
      failure_reason: null,
      next_retry_at: null
    })
  });
  return { ok: true, status: 'completed' };
}

export async function retryDeletionCleanup(supabase, storageRemoveFn, requestId, { force = false } = {}) {
  const [request] = await supabase(
    `account_deletion_requests?id=eq.${encodeURIComponent(requestId)}&select=id,status,pending_storage_objects,steps,retry_count,next_retry_at`
  );
  if (!request) return { ok: false, reason: 'not_found' };
  if (request.status !== 'cleanup_pending') return { ok: false, reason: 'not_retryable', status: request.status };
  if (
    !force &&
    request.next_retry_at &&
    new Date(request.next_retry_at).getTime() > Date.now()
  ) {
    return { ok: false, reason: 'retry_not_due', next_retry_at: request.next_retry_at };
  }

  const objects = Array.isArray(request.pending_storage_objects)
    ? request.pending_storage_objects.map((item) => ({ ...item }))
    : [];
  const { objects: updatedObjects, failures } = await attemptPendingStorageCleanup(storageRemoveFn, objects);

  await supabase(`account_deletion_requests?id=eq.${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      pending_storage_objects: updatedObjects,
      retry_count: Number(request.retry_count || 0) + 1,
      next_retry_at: failures.length
        ? new Date(Date.now() + 3600000).toISOString()
        : null,
      failure_reason: failures.length
        ? 'Storage cleanup is still incomplete.'
        : null
    })
  });

  if (failures.length) {
    await appendDeletionStep(supabase, requestId, 'storage_cleanup_retry', 'failed', failures);
    return {
      ok: false,
      status: 'cleanup_pending',
      remaining: pendingStorageRemaining(updatedObjects).length,
      failures
    };
  }

  await appendDeletionStep(supabase, requestId, 'storage_cleanup_retry', 'completed');
  const steps = await appendDeletionStep(supabase, requestId, 'storage_cleanup', 'completed');
  await markDeletionCompleted(supabase, requestId, { steps });
  return { ok: true, status: 'completed', request_id: requestId };
}

export async function retryPendingDeletionCleanups(supabase, storageRemoveFn, { limit = 20 } = {}) {
  const due = await supabase(
    `account_deletion_requests?status=eq.cleanup_pending&select=id,next_retry_at&order=requested_at.asc&limit=${limit}`
  );
  const results = [];
  for (const row of due) {
    if (row.next_retry_at && new Date(row.next_retry_at).getTime() > Date.now()) {
      results.push({ request_id: row.id, ok: false, reason: 'retry_not_due' });
      continue;
    }
    results.push({ request_id: row.id, ...(await retryDeletionCleanup(supabase, storageRemoveFn, row.id)) });
  }
  return { processed: results.length, results };
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

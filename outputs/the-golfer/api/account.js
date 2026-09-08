import { json, requireUser, supabase, storageRemove } from '../lib/admin.js';
import {
  archiveModerationEvidence,
  deleteAuthUser,
  deleteStoragePaths,
  deleteUserOwnedDataStrict,
  appendDeletionStep,
  listUserStoragePaths,
  retentionDaysFromSettings,
  verifyUserPassword
} from '../lib/account-deletion.js';

async function loadAppSettings() {
  try {
    const [row] = await supabase(
      'app_settings?id=eq.true&select=account_deletion_enabled,moderation_evidence_retention_days'
    );
    return row || {};
  } catch {
    return {};
  }
}

async function markDeletionRequest(id, patch) {
  await supabase(`account_deletion_requests?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch)
  });
}

export default async function handler(req, res) {
  try {
    const auth = await requireUser(req);
    if (auth.error) return json(res, auth.error.status, auth.error.body);

    if (req.method === 'GET') {
      const settings = await loadAppSettings();
      const retentionDays = retentionDaysFromSettings(settings);
      const [latest] = await supabase(
        `account_deletion_requests?user_id=eq.${auth.user.id}&select=id,status,requested_at,completed_at,cleanup_completed_at,retry_count,next_retry_at,failure_reason,steps&order=requested_at.desc&limit=1`
      ).catch(() => []);
      return json(res, 200, {
        account_deletion_enabled: !!settings.account_deletion_enabled,
        retention_configured: retentionDays != null,
        retention_days: retentionDays,
        test_mode: process.env.GOLFOLIO_DELETION_TEST_MODE === 'true',
        latest_request: latest || null
      });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

    const action = req.body?.action;
    if (action === 'retry_cleanup') {
      const requestId = String(req.body?.request_id || '');
      const [request] = await supabase(
        `account_deletion_requests?id=eq.${encodeURIComponent(requestId)}&user_id=eq.${auth.user.id}&select=id,status`
      );
      if (!request || request.status !== 'cleanup_pending') {
        return json(res, 404, { error: 'No retryable cleanup request found.' });
      }
      const storageFailures = await deleteStoragePaths(storageRemove, await listUserStoragePaths(supabase, auth.user.id));
      if (storageFailures.length) {
        await appendDeletionStep(supabase, requestId, 'storage_cleanup_retry', 'failed', storageFailures);
        await markDeletionRequest(requestId, {
          failure_reason: 'Storage cleanup is still incomplete.',
          next_retry_at: new Date(Date.now() + 3600000).toISOString(),
          retry_count: Number(request.retry_count || 0) + 1
        });
        return json(res, 202, {
          ok: false,
          status: 'cleanup_pending',
          message: 'Storage cleanup is still incomplete. Retry later.'
        });
      }
      await appendDeletionStep(supabase, requestId, 'storage_cleanup_retry', 'completed');
      await markDeletionRequest(requestId, {
        status: 'completed',
        cleanup_completed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        failure_reason: null,
        next_retry_at: null
      });
      return json(res, 200, { ok: true, status: 'completed' });
    }

    if (action !== 'delete_account') return json(res, 400, { error: 'Unknown account action.' });

    const settings = await loadAppSettings();
    const testMode = process.env.GOLFOLIO_DELETION_TEST_MODE === 'true';
    if (!settings.account_deletion_enabled && !testMode) {
      return json(res, 403, {
        error: 'Account deletion is not enabled yet. Owner must configure retention and enable deletion in app settings.'
      });
    }

    const confirm = req.body?.confirm === true;
    const confirmText = String(req.body?.confirm_text || '').trim();
    const password = String(req.body?.password || '');
    if (!confirm || confirmText !== 'DELETE') {
      return json(res, 400, { error: 'Type DELETE and confirm to permanently delete your account.' });
    }

    const retentionDays = retentionDaysFromSettings(settings);
    if (retentionDays == null && !testMode) {
      return json(res, 503, {
        error: 'Retention configuration is unresolved. Account deletion cannot complete in production yet.'
      });
    }

    await verifyUserPassword(auth.user.email, password);

    const [profile] = await supabase(`profiles?id=eq.${auth.user.id}&select=id,username`);
    const [request] = await supabase('account_deletion_requests', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: auth.user.id, status: 'processing', steps: [] })
    });

    const reports = await supabase(
      `player_reports?reporter_id=eq.${auth.user.id}&select=id,category,details,reported_user_id,reported_listing_id,created_at`
    );
    const evidenceFailures = await archiveModerationEvidence(supabase, {
      userId: auth.user.id,
      username: profile?.username,
      reports,
      retentionDays
    });
    if (evidenceFailures.length) {
      await appendDeletionStep(supabase, request.id, 'moderation_evidence', 'failed', evidenceFailures);
      await markDeletionRequest(request.id, {
        status: 'failed',
        failure_reason: 'Could not archive required moderation evidence.'
      });
      return json(res, 500, {
        error: 'Account deletion failed while archiving moderation evidence.',
        request_id: request.id,
        status: 'failed'
      });
    }
    await appendDeletionStep(supabase, request.id, 'moderation_evidence', 'completed');

    const storagePaths = await listUserStoragePaths(supabase, auth.user.id);
    const storageFailures = await deleteStoragePaths(storageRemove, storagePaths);
    if (storageFailures.length) {
      await appendDeletionStep(supabase, request.id, 'storage_cleanup', 'failed', storageFailures);
    } else {
      await appendDeletionStep(supabase, request.id, 'storage_cleanup', 'completed');
    }

    const dataFailures = await deleteUserOwnedDataStrict(supabase, auth.user.id);
    if (dataFailures.length) {
      await appendDeletionStep(supabase, request.id, 'owned_data_cleanup', 'failed', dataFailures);
      await markDeletionRequest(request.id, {
        status: 'failed',
        failure_reason: 'Could not remove all account-owned data.'
      });
      return json(res, 500, {
        error: 'Account deletion failed while removing account-owned data.',
        request_id: request.id,
        status: 'failed',
        failures: dataFailures
      });
    }
    await appendDeletionStep(supabase, request.id, 'owned_data_cleanup', 'completed');

    await supabase(`profiles?id=eq.${auth.user.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        first_name: null,
        last_name: null,
        phone: null,
        avatar: null,
        bio: null,
        home_course: null,
        city: null,
        handicap: null,
        social_eligibility_status: 'unknown',
        social_attestation_at: null,
        social_attestation_policy_version: null,
        account_restricted: false,
        account_restriction_reason: null,
        account_restricted_at: null
      })
    });
    await appendDeletionStep(supabase, request.id, 'profile_scrub', 'completed');

    try {
      await deleteAuthUser(auth.user.id);
      await appendDeletionStep(supabase, request.id, 'auth_delete', 'completed');
    } catch (error) {
      await appendDeletionStep(supabase, request.id, 'auth_delete', 'failed', error.message);
      await markDeletionRequest(request.id, {
        status: 'failed',
        failure_reason: error.message || 'Could not remove authentication access.'
      });
      return json(res, 500, {
        error: error.message || 'Account deletion failed while removing authentication access.',
        request_id: request.id,
        status: 'failed'
      });
    }

    if (storageFailures.length) {
      await markDeletionRequest(request.id, {
        status: 'cleanup_pending',
        cleanup_completed_at: null,
        completed_at: new Date().toISOString(),
        failure_reason: 'Authentication access removed, but storage cleanup remains retryable.',
        next_retry_at: new Date(Date.now() + 3600000).toISOString()
      });
      return json(res, 202, {
        ok: true,
        status: 'cleanup_pending',
        request_id: request.id,
        message:
          'Authentication access was removed. Some private storage cleanup is still pending and can be retried.',
        retention_note:
          retentionDays == null
            ? 'Test-mode deletion completed without configured retention.'
            : `Moderation evidence may be retained for up to ${retentionDays} days before purge.`
      });
    }

    await markDeletionRequest(request.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      cleanup_completed_at: new Date().toISOString(),
      failure_reason: null
    });

    return json(res, 200, {
      ok: true,
      status: 'completed',
      request_id: request.id,
      message: 'Your account and ordinary profile data have been removed.',
      retention_note:
        retentionDays == null
          ? 'Test-mode deletion completed without configured retention.'
          : `Moderation evidence may be retained for up to ${retentionDays} days before purge.`
    });
  } catch (error) {
    const missing = /account_deletion|moderation_evidence|schema cache|does not exist/i.test(error.message || '');
    return json(res, error.status || (missing ? 503 : 500), {
      error: missing
        ? 'Account deletion is not ready yet. Run migrations 14 and 15 in Supabase, then try again.'
        : error.message || 'Account deletion failed.'
    });
  }
}

import { json, requireUser, supabase } from '../lib/admin.js';
import {
  deleteAuthUser,
  deleteUserOwnedData,
  moderationEvidenceSnapshot,
  purgeAfterFromRetention,
  retentionDaysFromSettings
} from '../lib/account-lifecycle.js';

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

export default async function handler(req, res) {
  try {
    const auth = await requireUser(req);
    if (auth.error) return json(res, auth.error.status, auth.error.body);

    if (req.method === 'GET') {
      const settings = await loadAppSettings();
      const retentionDays = retentionDaysFromSettings(settings);
      return json(res, 200, {
        account_deletion_enabled: !!settings.account_deletion_enabled,
        retention_configured: retentionDays != null,
        retention_days: retentionDays,
        test_mode: process.env.GOLFOLIO_DELETION_TEST_MODE === 'true'
      });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

    const action = req.body?.action;
    if (action !== 'delete_account') {
      return json(res, 400, { error: 'Unknown account action.' });
    }

    const settings = await loadAppSettings();
    const testMode = process.env.GOLFOLIO_DELETION_TEST_MODE === 'true';
    if (!settings.account_deletion_enabled && !testMode) {
      return json(res, 403, {
        error: 'Account deletion is not enabled yet. Owner must configure retention and enable deletion in app settings.'
      });
    }

    const confirm = req.body?.confirm === true;
    const confirmText = String(req.body?.confirm_text || '').trim();
    if (!confirm || confirmText !== 'DELETE') {
      return json(res, 400, { error: 'Type DELETE and confirm to permanently delete your account.' });
    }

    const retentionDays = retentionDaysFromSettings(settings);
    if (retentionDays == null && !testMode) {
      return json(res, 503, {
        error: 'Retention configuration is unresolved. Account deletion cannot complete in production yet.'
      });
    }

    const [profile] = await supabase(
      `profiles?id=eq.${auth.user.id}&select=id,username`
    );
    const reports = await supabase(
      `player_reports?reporter_id=eq.${auth.user.id}&select=id,category,details,reported_user_id,reported_listing_id,created_at`
    ).catch(() => []);

    const purgeAfter = purgeAfterFromRetention(retentionDays);
    for (const report of reports) {
      const snapshot = moderationEvidenceSnapshot({ report, username: profile?.username });
      await supabase('moderation_evidence', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          subject_user_id: auth.user.id,
          subject_username: snapshot.subject_username,
          report_id: snapshot.report_id,
          category: snapshot.category,
          summary: snapshot.summary,
          content_snapshot: snapshot.content_snapshot,
          purge_after: purgeAfter
        })
      }).catch(() => {});
    }

    await supabase('account_deletion_requests', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: auth.user.id, status: 'processing' })
    }).catch(() => {});

    await deleteUserOwnedData(supabase, auth.user.id);

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
        social_attestation_policy_version: null
      })
    }).catch(() => {});

    await deleteAuthUser(auth.user.id);

    await supabase(`account_deletion_requests?user_id=eq.${auth.user.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
    }).catch(() => {});

    return json(res, 200, {
      ok: true,
      message: 'Your account and ordinary profile data have been removed.',
      retention_note:
        retentionDays == null
          ? 'Test-mode deletion completed without configured retention.'
          : `Moderation evidence may be retained for up to ${retentionDays} days before purge.`
    });
  } catch (error) {
    const missing = /account_deletion|moderation_evidence|schema cache|does not exist/i.test(
      error.message || ''
    );
    return json(res, missing ? 503 : 500, {
      error: missing
        ? 'Account deletion is not ready yet. Run 14-account-lifecycle-migration.sql in Supabase, then try again.'
        : error.message || 'Account deletion failed.'
    });
  }
}

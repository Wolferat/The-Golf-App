import { randomUUID } from 'node:crypto';
import { json, requireUser, requireAdmin, supabase, serviceHeaders } from '../lib/admin.js';
import {
  SOCIAL_ELIGIBILITY_POLICY_VERSION,
  canUseSocialFeatures,
  canReportOrBlock,
  publicPlayerCard,
  REPORT_CATEGORIES,
  RATE_LIMITS
} from '../lib/social.js';

async function loadAppSettings() {
  try {
    const [row] = await supabase(
      'app_settings?id=eq.true&select=social_features_enabled,social_eligibility_policy_version,player_support_email,player_support_url,community_standards_url,safety_help_url'
    );
    return row || {};
  } catch {
    return {};
  }
}

async function loadProfile(userId) {
  const [row] = await supabase(
    `profiles?id=eq.${userId}&select=id,username,role,avatar,city,home_course,social_eligibility_status,social_attestation_at,social_attestation_policy_version`
  );
  return row || null;
}

async function blockedEitherWay(a, b) {
  const rows = await supabase(
    `player_blocks?or=(and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a}))&select=blocker_id`
  );
  return rows.length > 0;
}

async function eligibleDiscoveryProfiles(viewerId, appSettings, term = '') {
  const filter = term ? `&username=ilike.*${encodeURIComponent(term.replace(/[%_,]/g, '').slice(0, 24))}*` : '';
  const profiles = await supabase(
    `profiles?select=id,username,avatar,city,home_course,social_eligibility_status&social_eligibility_status=eq.eligible&order=username.asc&limit=30${filter}`
  );
  const blocks = await supabase(
    `player_blocks?or=(blocker_id.eq.${viewerId},blocked_id.eq.${viewerId})&select=blocker_id,blocked_id`
  );
  const blockedIds = new Set();
  for (const row of blocks) {
    blockedIds.add(row.blocker_id === viewerId ? row.blocked_id : row.blocker_id);
  }
  const gate = canUseSocialFeatures({ social_eligibility_status: 'eligible' }, appSettings);
  if (!gate.allowed) return [];
  return profiles
    .filter((row) => row.id !== viewerId && !blockedIds.has(row.id))
    .map((row) => publicPlayerCard(row, { eligible: true }));
}

export default async function handler(req, res) {
  try {
    const auth = await requireUser(req);
    if (auth.error) return json(res, auth.error.status, auth.error.body);
    const appSettings = await loadAppSettings();
    const profile = await loadProfile(auth.user.id);

    if (req.method === 'GET') {
      const view = String(req.query?.view || 'status');
      if (view === 'support') {
        return json(res, 200, {
          player_support_email: appSettings.player_support_email || null,
          player_support_url: appSettings.player_support_url || null,
          community_standards_url: appSettings.community_standards_url || null,
          safety_help_url: appSettings.safety_help_url || null
        });
      }
      if (view === 'discovery') {
        const gate = canUseSocialFeatures(profile, appSettings);
        if (!gate.allowed) {
          return json(res, 403, {
            error: 'Complete adult self-attestation before using social discovery.',
            reason: gate.reason,
            eligibility: gate.eligibility || null,
            social_features_enabled: !!appSettings.social_features_enabled
          });
        }
        const players = await eligibleDiscoveryProfiles(
          auth.user.id,
          appSettings,
          String(req.query?.q || '').trim()
        );
        return json(res, 200, { players });
      }
      if (view === 'requests') {
        const gate = canUseSocialFeatures(profile, appSettings);
        if (!gate.allowed) {
          return json(res, 403, { error: 'Social requests require adult self-attestation.', reason: gate.reason });
        }
        const rows = await supabase(
          `player_friendships?or=(requester_id.eq.${auth.user.id},addressee_id.eq.${auth.user.id})&status=in.(pending,accepted)&select=id,requester_id,addressee_id,status,created_at,responded_at&order=created_at.desc`
        );
        return json(res, 200, { friendships: rows });
      }
      return json(res, 200, {
        social_features_enabled: !!appSettings.social_features_enabled,
        policy_version: appSettings.social_eligibility_policy_version || SOCIAL_ELIGIBILITY_POLICY_VERSION,
        eligibility: {
          status: profile?.social_eligibility_status || 'unknown',
          attestation_at: profile?.social_attestation_at || null,
          policy_version: profile?.social_attestation_policy_version || null
        },
        report_categories: REPORT_CATEGORIES
      });
    }

    if (req.method === 'POST') {
      const action = req.body?.action;

      if (action === 'attest_adult') {
        const confirmed = req.body?.confirmed === true;
        if (!confirmed) {
          return json(res, 400, { error: 'Confirm that you are 18 or older to use social features.' });
        }
        const policyVersion =
          appSettings.social_eligibility_policy_version || SOCIAL_ELIGIBILITY_POLICY_VERSION;
        const now = new Date().toISOString();
        const [updated] = await supabase(`profiles?id=eq.${auth.user.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            social_eligibility_status: 'eligible',
            social_attestation_at: now,
            social_attestation_policy_version: policyVersion
          })
        });
        return json(res, 200, {
          ok: true,
          eligibility: {
            status: updated.social_eligibility_status,
            attestation_at: updated.social_attestation_at,
            policy_version: updated.social_attestation_policy_version
          }
        });
      }

      if (action === 'friend_request') {
        const gate = canUseSocialFeatures(profile, appSettings);
        if (!gate.allowed) return json(res, 403, { error: 'Social requests require adult self-attestation.', reason: gate.reason });
        const target = String(req.body?.user_id || '');
        if (!target || target === auth.user.id) return json(res, 400, { error: 'Choose another player.' });
        if (await blockedEitherWay(auth.user.id, target)) {
          return json(res, 403, { error: 'This request cannot be sent.' });
        }
        const recent = await supabase(
          `player_friendships?requester_id=eq.${auth.user.id}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 3600000).toISOString())}&select=id`
        );
        if (recent.length >= RATE_LIMITS.friend_request_per_hour) {
          return json(res, 429, { error: 'Too many friend requests. Try again later.' });
        }
        const [targetProfile] = await supabase(
          `profiles?id=eq.${target}&select=id,social_eligibility_status`
        );
        if (!targetProfile || targetProfile.social_eligibility_status !== 'eligible') {
          return json(res, 404, { error: 'That player is not available for social requests.' });
        }
        const [row] = await supabase('player_friendships', {
          method: 'POST',
          headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
          body: JSON.stringify({
            requester_id: auth.user.id,
            addressee_id: target,
            status: 'pending'
          })
        });
        return json(res, 201, { friendship: row });
      }

      if (action === 'respond_friendship') {
        const gate = canUseSocialFeatures(profile, appSettings);
        if (!gate.allowed) return json(res, 403, { error: 'Social responses require adult self-attestation.', reason: gate.reason });
        const id = String(req.body?.friendship_id || '');
        const decision = String(req.body?.decision || '');
        if (!id || !['accept', 'decline'].includes(decision)) {
          return json(res, 400, { error: 'Choose accept or decline.' });
        }
        const [row] = await supabase(
          `player_friendships?id=eq.${encodeURIComponent(id)}&addressee_id=eq.${auth.user.id}&status=eq.pending&select=id,status`
        );
        if (!row) return json(res, 404, { error: 'Friend request not found.' });
        const [updated] = await supabase(`player_friendships?id=eq.${row.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            status: decision === 'accept' ? 'accepted' : 'declined',
            responded_at: new Date().toISOString()
          })
        });
        return json(res, 200, { friendship: updated });
      }

      if (action === 'block') {
        if (!canReportOrBlock().allowed) return json(res, 403, { error: 'Sign in required.' });
        const target = String(req.body?.user_id || '');
        if (!target || target === auth.user.id) return json(res, 400, { error: 'Choose a player to block.' });
        await supabase('player_blocks', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ blocker_id: auth.user.id, blocked_id: target })
        });
        await supabase(
          `player_friendships?or=(and(requester_id.eq.${auth.user.id},addressee_id.eq.${target}),and(requester_id.eq.${target},addressee_id.eq.${auth.user.id}))`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ status: 'blocked', responded_at: new Date().toISOString() })
          }
        ).catch(() => {});
        return json(res, 200, { ok: true });
      }

      if (action === 'unblock') {
        const target = String(req.body?.user_id || '');
        await supabase(`player_blocks?blocker_id=eq.${auth.user.id}&blocked_id=eq.${target}`, {
          method: 'DELETE'
        });
        return json(res, 200, { ok: true });
      }

      if (action === 'report') {
        if (!canReportOrBlock().allowed) return json(res, 403, { error: 'Sign in required.' });
        const category = String(req.body?.category || '').trim();
        const details = String(req.body?.details || '').trim();
        if (!REPORT_CATEGORIES.includes(category)) {
          return json(res, 400, { error: 'Choose a report category.' });
        }
        const reportedUserId = req.body?.reported_user_id ? String(req.body.reported_user_id) : null;
        const reportedListingId = req.body?.reported_listing_id ? String(req.body.reported_listing_id) : null;
        if (!reportedUserId && !reportedListingId) {
          return json(res, 400, { error: 'Report a player or listing.' });
        }
        const recent = await supabase(
          `player_reports?reporter_id=eq.${auth.user.id}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 86400000).toISOString())}&select=id`
        );
        if (recent.length >= RATE_LIMITS.report_per_day) {
          return json(res, 429, { error: 'Too many reports today. Try again tomorrow.' });
        }
        const [row] = await supabase('player_reports', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            reporter_id: auth.user.id,
            reported_user_id: reportedUserId,
            reported_listing_id: reportedListingId,
            category,
            details: details || null
          })
        });
        return json(res, 201, { report: row });
      }

      return json(res, 400, { error: 'Unknown social action.' });
    }

    return json(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    const missing = /player_friendships|player_blocks|player_reports|social_eligibility|schema cache|does not exist/i.test(
      error.message || ''
    );
    return json(res, missing ? 503 : 500, {
      error: missing
        ? 'Social features are not ready yet. Run 12-social-foundation-migration.sql in Supabase, then try again.'
        : error.message || 'Social service failed.'
    });
  }
}

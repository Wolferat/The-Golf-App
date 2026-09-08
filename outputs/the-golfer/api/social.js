import { json, requireUser, supabase } from '../lib/admin.js';
import {
  SOCIAL_ELIGIBILITY_POLICY_VERSION,
  canUseSocialFeatures,
  canReportOrBlock,
  REPORT_CATEGORIES,
  RATE_LIMITS
} from '../lib/social.js';
import { lookupExactEligiblePlayer, normalizeExactUsername } from '../lib/social-discovery.js';
import { assertSocialAllowed } from '../lib/moderation.js';
import { enforceRateLimit } from '../lib/rate-limit.js';
import { createInvitationToken, hashInvitationToken } from '../lib/invitations.js';

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
    `profiles?id=eq.${userId}&select=id,username,role,avatar,city,home_course,social_eligibility_status,social_attestation_at,social_attestation_policy_version,account_restricted,account_restriction_reason`
  );
  return row || null;
}

async function blockedEitherWay(a, b) {
  const rows = await supabase(
    `player_blocks?or=(and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a}))&select=blocker_id`
  );
  return rows.length > 0;
}

async function existingFriendshipPair(a, b) {
  const [row] = await supabase(
    `player_friendships?or=(and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a}))&select=id,status,requester_id,addressee_id&order=created_at.desc&limit=1`
  );
  return row || null;
}

async function profileCards(ids) {
  if (!ids.length) return {};
  const rows = await supabase(
    `profiles?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,username,avatar,city,home_course`
  );
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

function enrichFriendships(rows, viewerId, cards) {
  return rows.map((row) => {
    const otherId = row.requester_id === viewerId ? row.addressee_id : row.requester_id;
    const other = cards[otherId] || null;
    return {
      ...row,
      other_user: other
        ? { id: other.id, username: other.username, avatar: other.avatar, city: other.city, home_course: other.home_course }
        : null,
      incoming: row.addressee_id === viewerId && row.status === 'pending',
      outgoing: row.requester_id === viewerId && row.status === 'pending'
    };
  });
}

export default async function handler(req, res) {
  try {
    const auth = await requireUser(req);
    if (auth.error) return json(res, auth.error.status, auth.error.body);
    const appSettings = await loadAppSettings();
    const profile = await loadProfile(auth.user.id);
    const socialGate = assertSocialAllowed(profile);

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
        const username = String(req.query?.q || req.query?.username || '').trim();
        if (!username) return json(res, 200, { players: [] });
        const result = await lookupExactEligiblePlayer(supabase, {
          viewerId: auth.user.id,
          username,
          appSettings,
          viewerProfile: profile
        });
        if (result.reason && result.reason !== 'exact_username_required') {
          return json(res, 403, {
            error: 'Social discovery is unavailable until requirements are met.',
            reason: result.reason,
            eligibility: result.gate?.eligibility || null
          });
        }
        return json(res, 200, { players: result.players });
      }
      if (view === 'requests') {
        const gate = canUseSocialFeatures(profile, appSettings);
        if (!gate.allowed) return json(res, 403, { error: 'Social requests require adult self-attestation.', reason: gate.reason });
        const rows = await supabase(
          `player_friendships?or=(requester_id.eq.${auth.user.id},addressee_id.eq.${auth.user.id})&status=in.(pending,accepted)&select=id,requester_id,addressee_id,status,created_at,responded_at&order=created_at.desc`
        );
        const ids = [...new Set(rows.flatMap((row) => [row.requester_id, row.addressee_id]))];
        return json(res, 200, { friendships: enrichFriendships(rows, auth.user.id, await profileCards(ids)) });
      }
      if (view === 'blocks') {
        const rows = await supabase(
          `player_blocks?blocker_id=eq.${auth.user.id}&select=blocked_id,created_at&order=created_at.desc`
        );
        const cards = await profileCards(rows.map((row) => row.blocked_id));
        return json(res, 200, {
          blocks: rows.map((row) => ({
            user_id: row.blocked_id,
            created_at: row.created_at,
            user: cards[row.blocked_id]
              ? {
                  id: cards[row.blocked_id].id,
                  username: cards[row.blocked_id].username,
                  avatar: cards[row.blocked_id].avatar
                }
              : null
          }))
        });
      }
      if (view === 'invitations') {
        const gate = canUseSocialFeatures(profile, appSettings);
        if (!gate.allowed) return json(res, 403, { error: 'Invitations require adult self-attestation.', reason: gate.reason });
        const rows = await supabase(
          `player_invitations?inviter_id=eq.${auth.user.id}&status=in.(active,accepted,revoked)&select=id,status,created_at,expires_at,accepted_at,revoked_at&order=created_at.desc`
        );
        return json(res, 200, { invitations: rows });
      }
      return json(res, 200, {
        social_features_enabled: !!appSettings.social_features_enabled,
        policy_version: appSettings.social_eligibility_policy_version || SOCIAL_ELIGIBILITY_POLICY_VERSION,
        account_restricted: !!profile?.account_restricted,
        account_restriction_reason: profile?.account_restriction_reason || null,
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
        if (!socialGate.allowed) {
          return json(res, 403, { error: 'Your account cannot use social features right now.', reason: socialGate.reason });
        }
        const confirmed = req.body?.confirmed === true;
        if (!confirmed) return json(res, 400, { error: 'Confirm that you are 18 or older to use social features.' });
        const policyVersion = appSettings.social_eligibility_policy_version || SOCIAL_ELIGIBILITY_POLICY_VERSION;
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
        const targetUsername = normalizeExactUsername(req.body?.username || '');
        let targetProfile = null;
        if (target) {
          [targetProfile] = await supabase(
            `profiles?id=eq.${encodeURIComponent(target)}&select=id,username,social_eligibility_status,account_restricted`
          );
        } else if (targetUsername) {
          [targetProfile] = await supabase(
            `profiles?username=eq.${encodeURIComponent(targetUsername)}&select=id,username,social_eligibility_status,account_restricted`
          );
        }
        if (!targetProfile || targetProfile.id === auth.user.id) {
          return json(res, 400, { error: 'Choose another eligible player.' });
        }
        if (targetProfile.social_eligibility_status !== 'eligible' || targetProfile.account_restricted) {
          return json(res, 404, { error: 'That player is not available for social requests.' });
        }
        if (await blockedEitherWay(auth.user.id, targetProfile.id)) {
          return json(res, 403, { error: 'This request cannot be sent.' });
        }
        const existing = await existingFriendshipPair(auth.user.id, targetProfile.id);
        if (existing && ['pending', 'accepted'].includes(existing.status)) {
          return json(res, 409, { error: 'A friend request or friendship already exists for this player.' });
        }
        await enforceRateLimit(supabase, auth.user.id, 'friend_request', {
          limit: RATE_LIMITS.friend_request_per_hour,
          windowMs: 3600000,
          message: 'Too many friend requests. Try again later.'
        });
        const [row] = await supabase('player_friendships', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            requester_id: auth.user.id,
            addressee_id: targetProfile.id,
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
          `player_friendships?id=eq.${encodeURIComponent(id)}&addressee_id=eq.${auth.user.id}&status=eq.pending&select=id,requester_id,addressee_id`
        );
        if (!row) return json(res, 404, { error: 'Friend request not found.' });
        if (decision === 'accept' && (await blockedEitherWay(auth.user.id, row.requester_id))) {
          return json(res, 403, { error: 'This request cannot be accepted.' });
        }
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

      if (action === 'cancel_friend_request') {
        const gate = canUseSocialFeatures(profile, appSettings);
        if (!gate.allowed) return json(res, 403, { error: 'Social actions require adult self-attestation.', reason: gate.reason });
        const id = String(req.body?.friendship_id || '');
        const [row] = await supabase(
          `player_friendships?id=eq.${encodeURIComponent(id)}&requester_id=eq.${auth.user.id}&status=eq.pending&select=id`
        );
        if (!row) return json(res, 404, { error: 'Pending request not found.' });
        await supabase(`player_friendships?id=eq.${row.id}`, { method: 'DELETE' });
        return json(res, 200, { ok: true });
      }

      if (action === 'remove_friend') {
        const gate = canUseSocialFeatures(profile, appSettings);
        if (!gate.allowed) return json(res, 403, { error: 'Social actions require adult self-attestation.', reason: gate.reason });
        const id = String(req.body?.friendship_id || '');
        const [row] = await supabase(
          `player_friendships?id=eq.${encodeURIComponent(id)}&status=eq.accepted&select=id,requester_id,addressee_id`
        );
        if (!row || ![row.requester_id, row.addressee_id].includes(auth.user.id)) {
          return json(res, 404, { error: 'Friendship not found.' });
        }
        await supabase(`player_friendships?id=eq.${row.id}`, { method: 'DELETE' });
        return json(res, 200, { ok: true });
      }

      if (action === 'create_invitation') {
        const gate = canUseSocialFeatures(profile, appSettings);
        if (!gate.allowed) return json(res, 403, { error: 'Invitations require adult self-attestation.', reason: gate.reason });
        const token = createInvitationToken();
        const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
        const [row] = await supabase('player_invitations', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            inviter_id: auth.user.id,
            token_hash: hashInvitationToken(token),
            status: 'active',
            expires_at: expiresAt
          })
        });
        return json(res, 201, {
          invitation: { id: row.id, expires_at: row.expires_at, status: row.status },
          token
        });
      }

      if (action === 'revoke_invitation') {
        const id = String(req.body?.invitation_id || '');
        const [row] = await supabase(
          `player_invitations?id=eq.${encodeURIComponent(id)}&inviter_id=eq.${auth.user.id}&status=eq.active&select=id`
        );
        if (!row) return json(res, 404, { error: 'Active invitation not found.' });
        const [updated] = await supabase(`player_invitations?id=eq.${row.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ status: 'revoked', revoked_at: new Date().toISOString() })
        });
        return json(res, 200, { invitation: updated });
      }

      if (action === 'accept_invitation') {
        const gate = canUseSocialFeatures(profile, appSettings);
        if (!gate.allowed) return json(res, 403, { error: 'Invitations require adult self-attestation.', reason: gate.reason });
        const token = String(req.body?.token || '').trim();
        if (!token) return json(res, 400, { error: 'Invitation token is required.' });
        const [invite] = await supabase(
          `player_invitations?token_hash=eq.${encodeURIComponent(hashInvitationToken(token))}&status=eq.active&select=id,inviter_id,expires_at`
        );
        if (!invite) return json(res, 404, { error: 'Invitation not found or no longer active.' });
        if (new Date(invite.expires_at).getTime() < Date.now()) {
          await supabase(`player_invitations?id=eq.${invite.id}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ status: 'expired' })
          });
          return json(res, 410, { error: 'Invitation has expired.' });
        }
        if (invite.inviter_id === auth.user.id) {
          return json(res, 400, { error: 'You cannot accept your own invitation.' });
        }
        if (await blockedEitherWay(auth.user.id, invite.inviter_id)) {
          return json(res, 403, { error: 'This invitation cannot be accepted.' });
        }
        const existing = await existingFriendshipPair(auth.user.id, invite.inviter_id);
        if (existing && existing.status === 'accepted') {
          return json(res, 409, { error: 'You are already friends with this player.' });
        }
        if (existing && existing.status === 'pending') {
          return json(res, 409, { error: 'A pending request already exists for this player.' });
        }
        let friendship = null;
        if (existing) {
          const [updated] = await supabase(`player_friendships?id=eq.${existing.id}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ status: 'accepted', responded_at: new Date().toISOString() })
          });
          friendship = updated;
        } else {
          const [created] = await supabase('player_friendships', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({
              requester_id: invite.inviter_id,
              addressee_id: auth.user.id,
              status: 'accepted',
              responded_at: new Date().toISOString()
            })
          });
          friendship = created;
        }
        await supabase(`player_invitations?id=eq.${invite.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            status: 'accepted',
            accepted_by: auth.user.id,
            accepted_at: new Date().toISOString()
          })
        });
        return json(res, 200, { friendship });
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
          `player_friendships?or=(and(requester_id.eq.${auth.user.id},addressee_id.eq.${target}),and(requester_id.eq.${target},addressee_id.eq.${auth.user.id}))&status=in.(pending,accepted)`,
          { method: 'DELETE' }
        ).catch(() => {});
        return json(res, 200, { ok: true });
      }

      if (action === 'unblock') {
        const target = String(req.body?.user_id || '');
        await supabase(`player_blocks?blocker_id=eq.${auth.user.id}&blocked_id=eq.${encodeURIComponent(target)}`, {
          method: 'DELETE'
        });
        return json(res, 200, { ok: true });
      }

      if (action === 'report') {
        if (!canReportOrBlock().allowed) return json(res, 403, { error: 'Sign in required.' });
        const category = String(req.body?.category || '').trim();
        const details = String(req.body?.details || '').trim();
        if (!REPORT_CATEGORIES.includes(category)) return json(res, 400, { error: 'Choose a report category.' });
        const reportedUserId = req.body?.reported_user_id ? String(req.body.reported_user_id) : null;
        const reportedListingId = req.body?.reported_listing_id ? String(req.body.reported_listing_id) : null;
        if (!reportedUserId && !reportedListingId) return json(res, 400, { error: 'Report a player or listing.' });
        await enforceRateLimit(supabase, auth.user.id, 'report', {
          limit: RATE_LIMITS.report_per_day,
          windowMs: 86400000,
          message: 'Too many reports today. Try again tomorrow.'
        });
        const [row] = await supabase('player_reports', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            reporter_id: auth.user.id,
            reported_user_id: reportedUserId,
            reported_listing_id: reportedListingId,
            category,
            details: details || null,
            status: 'open'
          })
        });
        return json(res, 201, { report: row });
      }

      return json(res, 400, { error: 'Unknown social action.' });
    }

    return json(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    const missing = /player_friendships|player_blocks|player_reports|player_invitations|social_rate_events|social_eligibility|schema cache|does not exist/i.test(
      error.message || ''
    );
    return json(res, error.status || (missing ? 503 : 500), {
      error: missing
        ? 'Social features are not ready yet. Run migrations 12 and 15 in Supabase, then try again.'
        : error.message || 'Social service failed.'
    });
  }
}

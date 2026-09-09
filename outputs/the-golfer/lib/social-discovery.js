import { canUseSocialFeatures, publicPlayerCard } from './social.js';
import { enforceRateLimit } from './rate-limit.js';

export const USERNAME_RE = /^[A-Za-z0-9_\-]{3,24}$/;

export function normalizeExactUsername(value) {
  const term = String(value || '').trim();
  if (!term || !USERNAME_RE.test(term)) return null;
  return term;
}

export function blockedIdsForViewer(blockRows = [], viewerId) {
  const blocked = new Set();
  for (const row of blockRows) {
    blocked.add(row.blocker_id === viewerId ? row.blocked_id : row.blocker_id);
  }
  return blocked;
}

export async function lookupExactEligiblePlayer(supabase, {
  viewerId,
  username,
  appSettings,
  viewerProfile
}) {
  const exact = normalizeExactUsername(username);
  if (!exact) return { players: [], reason: 'exact_username_required' };

  const gate = canUseSocialFeatures(viewerProfile, appSettings);
  if (!gate.allowed) {
    return { players: [], reason: gate.reason, gate };
  }

  await enforceRateLimit(supabase, viewerId, 'username_lookup', {
    limit: 30,
    windowMs: 3600000,
    message: 'Too many username lookups. Try again later.'
  });

  const [match] = await supabase(
    `profiles?username=eq.${encodeURIComponent(exact)}&social_eligibility_status=eq.eligible&select=id,username,avatar,city,home_course,social_eligibility_status,account_restricted`
  );
  if (!match || match.id === viewerId || match.account_restricted) {
    return { players: [] };
  }

  const blocks = await supabase(
    `player_blocks?or=(and(blocker_id.eq.${viewerId},blocked_id.eq.${match.id}),and(blocker_id.eq.${match.id},blocked_id.eq.${viewerId}))&select=blocker_id`
  );
  if (blocks.length) return { players: [] };

  const card = publicPlayerCard(match, { eligible: true });
  return { players: card ? [card] : [] };
}

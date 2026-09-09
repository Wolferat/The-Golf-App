import { canLogRoundAtListing } from '../lib/reviews.js';
import { lookupExactEligiblePlayer } from '../lib/social-discovery.js';
import {
  fetchRecentRounds,
  fetchRoundStats,
  loadOwnedRound,
  statsForRounds,
  validateRoundInput
} from '../lib/rounds.js';
import { assertSocialAllowed } from '../lib/moderation.js';

const json = (res, status, body) => res.status(status).json(body);

async function authenticatedUser(req) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!url || !anon || !token) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` }
  });
  return response.ok ? response.json() : null;
}

async function supabase(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error('Player service is not configured.');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || body.hint || 'The player service could not complete that request.');
  }
  return body;
}

async function loadAppSettings() {
  try {
    const [row] = await supabase('app_settings?id=eq.true&select=social_features_enabled,social_eligibility_policy_version');
    return row || {};
  } catch {
    return {};
  }
}

async function loadProfile(userId) {
  const [row] = await supabase(
    `profiles?id=eq.${userId}&select=id,username,role,first_name,last_name,phone,avatar,bio,city,home_course,handicap,created_at,social_eligibility_status,social_attestation_at,social_attestation_policy_version,account_restricted,account_restriction_reason`
  );
  return row || null;
}

async function loadListing(id) {
  const [listing] = await supabase(
    `listings?id=eq.${encodeURIComponent(id)}&select=id,title,kind,status,venue_name,city`
  );
  return listing || null;
}

export default async function handler(req, res) {
  try {
    const user = await authenticatedUser(req);
    if (!user) return json(res, 401, { error: 'Please sign in to use your player hub.' });
    const profile = await loadProfile(user.id);
    const restriction = assertSocialAllowed(profile);

    if (req.method === 'GET') {
      const view = req.query.view || 'me';
      if (view === 'players') {
        const username = String(req.query.q || req.query.username || '').trim();
        if (!username) {
          return json(res, 400, {
            error: 'Exact username lookup moved to /api/social?view=discovery. Empty searches do not return a directory.'
          });
        }
        const appSettings = await loadAppSettings();
        const result = await lookupExactEligiblePlayer(supabase, {
          viewerId: user.id,
          username,
          appSettings,
          viewerProfile: profile
        });
        return json(res, 200, { players: result.players });
      }
      if (view === 'venue') {
        const listingId = String(req.query.listing_id || '').trim();
        if (!listingId) return json(res, 400, { error: 'Listing id is required.' });
        const listing = await loadListing(listingId);
        if (!canLogRoundAtListing(listing)) {
          return json(res, 404, { error: 'Venue stats are only available for approved courses and simulators.' });
        }
        const mine = await fetchRecentRounds(user.id, {
          limit: 500,
          extraFilter: `&listing_id=eq.${encodeURIComponent(listingId)}`
        });
        const nine = statsForRounds(mine, 9);
        const eighteen = statsForRounds(mine, 18);
        return json(res, 200, {
          listing_id: listingId,
          listing_title: listing.title,
          stats: {
            rounds: mine.length,
            nine_average: nine.average,
            eighteen_average: eighteen.average
          },
          recent: mine.slice(0, 8).map((row) => ({
            id: row.id,
            course_name: row.course_name,
            played_on: row.played_on,
            holes: row.holes,
            score: row.score,
            par: row.par || null
          }))
        });
      }
      const [rounds, stats, follows] = await Promise.all([
        fetchRecentRounds(user.id, { limit: 50 }),
        fetchRoundStats(user.id),
        supabase(`player_follows?follower_id=eq.${user.id}&select=following_id`).catch(() => [])
      ]);
      return json(res, 200, {
        profile,
        rounds,
        followingCount: follows.length,
        stats: {
          rounds: stats.all.rounds,
          average: stats.eighteen.average,
          best: stats.eighteen.best ?? stats.nine.best ?? stats.all.best,
          all: stats.all,
          nine: stats.nine,
          eighteen: stats.eighteen
        },
        account_restricted: !!profile?.account_restricted
      });
    }

    if (req.method === 'POST') {
      const action = req.body?.action;
      if (action === 'round') {
        if (!restriction.allowed) {
          return json(res, 403, {
            error: 'Your account is restricted.',
            reason: restriction.reason
          });
        }
        const input = req.body.round || {};
        const validated = validateRoundInput(input);
        let listing_id = null;
        let course_name = validated.course_name;
        if (input.listing_id) {
          const listing = await loadListing(String(input.listing_id));
          if (!canLogRoundAtListing(listing)) {
            return json(res, 400, { error: 'You can only log rounds at approved courses and simulators.' });
          }
          listing_id = listing.id;
          if (!course_name) course_name = listing.title || listing.venue_name || '';
        }
        const payload = {
          player_id: user.id,
          course_name,
          played_on: validated.played_on || new Date().toISOString().slice(0, 10),
          score: validated.score,
          holes: validated.holes,
          par: validated.par,
          putts: validated.putts,
          fairways_hit: validated.fairways_hit,
          greens_hit: validated.greens_hit,
          notes: validated.notes,
          visibility: 'private'
        };
        if (listing_id) payload.listing_id = listing_id;
        try {
          const rows = await supabase('rounds', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(payload)
          });
          return json(res, 201, { round: rows[0] });
        } catch (error) {
          if (listing_id && /listing_id|schema cache|does not exist|not ready/i.test(error.message || '')) {
            return json(res, 503, {
              error: 'Venue round links are not ready yet. Run venue-community-migration.sql in Supabase, then try again.'
            });
          }
          throw error;
        }
      }
      if (action === 'update_round') {
        if (!restriction.allowed) {
          return json(res, 403, { error: 'Your account is restricted.', reason: restriction.reason });
        }
        const input = req.body.round || {};
        const roundId = String(input.id || '');
        const owned = await loadOwnedRound(supabase, user.id, roundId);
        if (!owned) return json(res, 404, { error: 'Round not found.' });
        const validated = validateRoundInput({ ...owned, ...input }, { requireId: true });
        const payload = {};
        for (const key of [
          'course_name',
          'played_on',
          'score',
          'holes',
          'par',
          'putts',
          'fairways_hit',
          'greens_hit',
          'notes'
        ]) {
          if (validated[key] !== undefined) payload[key] = validated[key];
        }
        payload.visibility = 'private';
        const [updated] = await supabase(`rounds?id=eq.${encodeURIComponent(roundId)}&player_id=eq.${user.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(payload)
        });
        return json(res, 200, { round: updated });
      }
      if (action === 'delete_round') {
        if (!restriction.allowed) {
          return json(res, 403, { error: 'Your account is restricted.', reason: restriction.reason });
        }
        const roundId = String(req.body?.round_id || req.body?.id || '');
        const owned = await loadOwnedRound(supabase, user.id, roundId);
        if (!owned) return json(res, 404, { error: 'Round not found.' });
        await supabase(`rounds?id=eq.${encodeURIComponent(roundId)}&player_id=eq.${user.id}`, { method: 'DELETE' });
        return json(res, 200, { ok: true });
      }
      if (action === 'follow' || action === 'unfollow') {
        return json(res, 410, {
          error: 'Follow actions are retired. Use /api/social for friend requests after completing adult self-attestation.'
        });
      }
      return json(res, 400, { error: 'Unknown player action.' });
    }
    return json(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Player service failed.' });
  }
}

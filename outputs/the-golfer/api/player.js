import { canLogRoundAtListing } from '../lib/reviews.js';

const json = (res, status, body) => res.status(status).json(body);

async function authenticatedUser(req) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!url || !anon || !token) return null;
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  return response.ok ? response.json() : null;
}

async function supabase(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error('Player service is not configured.');
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.hint || 'The player service could not complete that request.');
  return body;
}

function statsFor(rounds, holes) {
  const selected = holes ? rounds.filter((row) => row.holes === holes) : rounds;
  return {
    rounds: selected.length,
    average: selected.length
      ? Math.round((selected.reduce((sum, row) => sum + row.score, 0) / selected.length) * 10) / 10
      : null,
    best: selected.length ? Math.min(...selected.map((row) => row.score)) : null
  };
}

async function fetchOwnRounds(userId, extraFilter = '') {
  const select = 'id,course_name,played_on,holes,score,par,putts,fairways_hit,greens_hit,notes,visibility,listing_id';
  try {
    return await supabase(
      `rounds?player_id=eq.${userId}${extraFilter}&select=${select}&order=played_on.desc&limit=50`
    );
  } catch (error) {
    if (!/listing_id|schema cache|does not exist|not ready/i.test(error.message || '')) throw error;
    if (extraFilter.includes('listing_id=')) return [];
    return await supabase(
      `rounds?player_id=eq.${userId}&select=id,course_name,played_on,holes,score,par,putts,fairways_hit,greens_hit,notes,visibility&order=played_on.desc&limit=50`
    );
  }
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

    if (req.method === 'GET') {
      const view = req.query.view || 'me';
      if (view === 'players') {
        const term = String(req.query.q || '').replace(/[%_,]/g, '').slice(0, 24);
        const filter = term ? `&username=ilike.*${encodeURIComponent(term)}*` : '';
        const players = await supabase(`profiles?select=id,username,avatar,bio,city,home_course,handicap&order=username.asc&limit=30${filter}`);
        const follows = await supabase(`player_follows?follower_id=eq.${user.id}&select=following_id`);
        const following = new Set(follows.map(x => x.following_id));
        return json(res, 200, { players: players.filter(x => x.id !== user.id).map(x => ({ ...x, following: following.has(x.id) })) });
      }
      if (view === 'venue') {
        const listingId = String(req.query.listing_id || '').trim();
        if (!listingId) return json(res, 400, { error: 'Listing id is required.' });
        const listing = await loadListing(listingId);
        if (!canLogRoundAtListing(listing)) {
          return json(res, 404, { error: 'Venue stats are only available for approved courses and simulators.' });
        }
        const rounds = await fetchOwnRounds(user.id, `&listing_id=eq.${encodeURIComponent(listingId)}`);
        const mine = (rounds || []).filter((row) => row.listing_id === listingId);
        const nine = statsFor(mine, 9);
        const eighteen = statsFor(mine, 18);
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
      const [profileRows, rounds, follows] = await Promise.all([
        supabase(`profiles?id=eq.${user.id}&select=id,username,role,first_name,last_name,phone,avatar,bio,city,home_course,handicap,created_at`),
        fetchOwnRounds(user.id),
        supabase(`player_follows?follower_id=eq.${user.id}&select=following_id`)
      ]);
      const nine = statsFor(rounds, 9), eighteen = statsFor(rounds, 18), all = statsFor(rounds);
      return json(res, 200, { profile: profileRows[0] || null, rounds, followingCount: follows.length, stats: { rounds:all.rounds, average:eighteen.average, best:all.best, all, nine, eighteen } });
    }

    if (req.method === 'POST') {
      const action = req.body?.action;
      if (action === 'round') {
        const input = req.body.round || {};
        const score = Number(input.score), holes = Number(input.holes || 18), par = input.par === '' || input.par == null ? null : Number(input.par);
        let listing_id = null;
        let course_name = String(input.course_name || '').trim();
        if (input.listing_id) {
          const listing = await loadListing(String(input.listing_id));
          if (!canLogRoundAtListing(listing)) {
            return json(res, 400, { error: 'You can only log rounds at approved courses and simulators.' });
          }
          listing_id = listing.id;
          if (!course_name) course_name = listing.title || listing.venue_name || '';
        }
        if (!course_name || !Number.isInteger(score) || score < 20 || score > 200 || ![9,18].includes(holes)) return json(res, 400, { error: 'Add a course, a valid score, and either 9 or 18 holes.' });
        const payload = { player_id: user.id, course_name, played_on: input.played_on || new Date().toISOString().slice(0,10), score, holes, par, putts: input.putts === '' ? null : Number(input.putts), fairways_hit: input.fairways_hit === '' ? null : Number(input.fairways_hit), greens_hit: input.greens_hit === '' ? null : Number(input.greens_hit), notes: String(input.notes || '').trim() || null, visibility: ['private','connections','public'].includes(input.visibility) ? input.visibility : 'private' };
        if (listing_id) payload.listing_id = listing_id;
        try {
          const rows = await supabase('rounds', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
          return json(res, 201, { round: rows[0] });
        } catch (error) {
          if (listing_id && /listing_id|schema cache|does not exist|not ready/i.test(error.message || '')) {
            return json(res, 503, { error: 'Venue round links are not ready yet. Run venue-community-migration.sql in Supabase, then try again.' });
          }
          throw error;
        }
      }
      if (action === 'follow') {
        const target = String(req.body.following_id || '');
        if (!target || target === user.id) return json(res, 400, { error: 'Choose another player to follow.' });
        await supabase('player_follows', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ follower_id: user.id, following_id: target }) });
        return json(res, 200, { ok: true });
      }
      if (action === 'unfollow') {
        const target = String(req.body.following_id || '');
        await supabase(`player_follows?follower_id=eq.${user.id}&following_id=eq.${target}`, { method: 'DELETE' });
        return json(res, 200, { ok: true });
      }
      return json(res, 400, { error: 'Unknown player action.' });
    }
    return json(res, 405, { error: 'Method not allowed.' });
  } catch (error) { return json(res, 500, { error: error.message || 'Player service failed.' }); }
}


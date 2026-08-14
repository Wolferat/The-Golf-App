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
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(body.message || body.hint || 'The player service could not complete that request.');
  return body;
}

function publicPlayerCard(player, following, roundCount) {
  // Strict privacy: never expose city or distance — state code only.
  return {
    id: player.id,
    username: player.username,
    avatar: player.avatar,
    bio: player.bio,
    home_course: player.home_course,
    handicap: player.handicap,
    state: player.state ? String(player.state).toUpperCase().slice(0, 2) : null,
    rounds: roundCount,
    following
  };
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
        let players;
        try {
          players = await supabase(
            `profiles?select=id,username,avatar,bio,home_course,handicap,state&order=username.asc&limit=30${filter}`
          );
        } catch {
          // Fallback before mission-control-migration.sql adds state.
          players = await supabase(
            `profiles?select=id,username,avatar,bio,home_course,handicap&order=username.asc&limit=30${filter}`
          );
        }
        const follows = await supabase(`player_follows?follower_id=eq.${user.id}&select=following_id`);
        const following = new Set(follows.map((x) => x.following_id));
        const ids = players.map((p) => p.id).filter((id) => id !== user.id);
        let roundMap = {};
        if (ids.length) {
          const rounds = await supabase(`rounds?player_id=in.(${ids.join(',')})&select=player_id`);
          roundMap = rounds.reduce((acc, row) => {
            acc[row.player_id] = (acc[row.player_id] || 0) + 1;
            return acc;
          }, {});
        }
        return json(res, 200, {
          players: players
            .filter((x) => x.id !== user.id)
            .map((x) => publicPlayerCard(x, following.has(x.id), roundMap[x.id] || 0))
        });
      }

      const [profileRows, rounds, follows] = await Promise.all([
        supabase(
          `profiles?id=eq.${user.id}&select=id,username,role,first_name,last_name,phone,avatar,bio,city,state,home_course,handicap,created_at`
        ),
        supabase(
          `rounds?player_id=eq.${user.id}&select=id,course_name,played_on,holes,score,par,putts,fairways_hit,greens_hit,notes,visibility&order=played_on.desc&limit=50`
        ),
        supabase(`player_follows?follower_id=eq.${user.id}&select=following_id`)
      ]);
      const completed18 = rounds.filter((x) => x.holes === 18);
      const average = completed18.length
        ? Math.round((completed18.reduce((sum, x) => sum + x.score, 0) / completed18.length) * 10) / 10
        : null;
      return json(res, 200, {
        profile: profileRows[0] || null,
        rounds,
        followingCount: follows.length,
        stats: { rounds: rounds.length, average, best: rounds.length ? Math.min(...rounds.map((x) => x.score)) : null }
      });
    }

    if (req.method === 'POST') {
      const action = req.body?.action;
      if (action === 'round') {
        const input = req.body.round || {};
        const score = Number(input.score);
        const holes = Number(input.holes || 18);
        const par = input.par === '' || input.par == null ? null : Number(input.par);
        if (
          !String(input.course_name || '').trim() ||
          !Number.isInteger(score) ||
          score < 20 ||
          score > 200 ||
          ![9, 18].includes(holes)
        ) {
          return json(res, 400, { error: 'Add a course, a valid score, and either 9 or 18 holes.' });
        }
        const rows = await supabase('rounds', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            player_id: user.id,
            course_name: String(input.course_name).trim(),
            played_on: input.played_on || new Date().toISOString().slice(0, 10),
            score,
            holes,
            par,
            putts: input.putts === '' ? null : Number(input.putts),
            fairways_hit: input.fairways_hit === '' ? null : Number(input.fairways_hit),
            greens_hit: input.greens_hit === '' ? null : Number(input.greens_hit),
            notes: String(input.notes || '').trim() || null,
            visibility: ['private', 'connections', 'public'].includes(input.visibility) ? input.visibility : 'private'
          })
        });
        return json(res, 201, { round: rows[0] });
      }
      if (action === 'follow') {
        const target = String(req.body.following_id || '');
        if (!target || target === user.id) return json(res, 400, { error: 'Choose another player to follow.' });
        await supabase('player_follows', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ follower_id: user.id, following_id: target })
        });
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
  } catch (error) {
    return json(res, 500, { error: error.message || 'Player service failed.' });
  }
}

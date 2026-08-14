const json = (res, status, body) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
};

async function authProfile(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,role,username`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  const [profile] = await response.json();
  return profile || null;
}

async function service(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Admin service is not configured.');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(body.message || body.hint || 'Admin request failed.');
  return body;
}

async function authAdminUsers(query) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const response = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!response.ok) return [];
  const data = await response.json();
  const users = data.users || data || [];
  const q = String(query || '').toLowerCase();
  if (!q) return users.slice(0, 40);
  return users.filter((u) => String(u.email || '').toLowerCase().includes(q)).slice(0, 40);
}

export default async function handler(req, res) {
  try {
    const profile = await authProfile(req);
    if (!profile) return json(res, 401, { error: 'Sign in required.' });
    if (profile.role !== 'admin') return json(res, 403, { error: 'Admin access required.' });

    if (req.method === 'GET') {
      const view = req.query.view || 'listings';
      if (view === 'listings') {
        const listings = await service(
          'listings?status=eq.pending&select=id,title,kind,city,price_note,source_name,source_url,created_at&order=created_at.desc'
        );
        return json(res, 200, { listings });
      }
      if (view === 'settings') {
        let rows;
        try {
          rows = await service(
            'app_settings?id=eq.true&select=company_name,support_email,launch_boundary_name,review_mode,geofence_west,geofence_east,geofence_south,geofence_north,proximity_miles'
          );
        } catch {
          rows = await service(
            'app_settings?id=eq.true&select=company_name,support_email,launch_boundary_name,review_mode'
          );
        }
        return json(res, 200, { settings: rows[0] || null });
      }
      if (view === 'users') {
        const q = String(req.query.q || '').replace(/[%_,]/g, '').slice(0, 80);
        let profiles = [];
        if (q.includes('@')) {
          const authUsers = await authAdminUsers(q);
          const ids = authUsers.map((u) => u.id).filter(Boolean);
          if (ids.length) {
            profiles = await service(
              `profiles?id=in.(${ids.join(',')})&select=id,username,role,state,avatar,created_at`
            );
          }
        } else if (q) {
          profiles = await service(
            `profiles?username=ilike.*${encodeURIComponent(q)}*&select=id,username,role,state,avatar,created_at&order=username.asc&limit=40`
          );
        } else {
          profiles = await service(
            'profiles?select=id,username,role,state,avatar,created_at&order=created_at.desc&limit=40'
          );
        }
        const authUsers = await authAdminUsers('');
        const emailById = Object.fromEntries(authUsers.map((u) => [u.id, u.email || null]));
        const ids = profiles.map((p) => p.id);
        let roundMap = {};
        if (ids.length) {
          const rounds = await service(`rounds?player_id=in.(${ids.join(',')})&select=player_id`);
          roundMap = rounds.reduce((acc, row) => {
            acc[row.player_id] = (acc[row.player_id] || 0) + 1;
            return acc;
          }, {});
        }
        return json(res, 200, {
          users: profiles.map((p) => ({
            ...p,
            email: emailById[p.id] || null,
            rounds: roundMap[p.id] || 0
          }))
        });
      }
      return json(res, 400, { error: 'Unknown admin view.' });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

    const action = req.body?.action;
    if (action === 'approve' || action === 'reject') {
      const id = req.body.id;
      if (!id) return json(res, 400, { error: 'Listing id required.' });
      await service(`listings?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({
          status: action === 'approve' ? 'approved' : 'rejected',
          reviewed_by: profile.id,
          reviewed_at: new Date().toISOString()
        })
      });
      return json(res, 200, { ok: true });
    }

    if (action === 'update_listing') {
      const id = req.body.id;
      const listing = req.body.listing || {};
      if (!id) return json(res, 400, { error: 'Listing id required.' });
      await service(`listings?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({
          title: String(listing.title || '').trim(),
          city: listing.city || null,
          price_note: listing.price_note || null
        })
      });
      return json(res, 200, { ok: true });
    }

    if (action === 'set_role') {
      const userId = req.body.user_id;
      const role = req.body.role;
      if (!userId || !['player', 'organizer', 'admin'].includes(role)) {
        return json(res, 400, { error: 'Valid user_id and role required.' });
      }
      if (userId === profile.id && role !== 'admin') {
        return json(res, 400, { error: 'You cannot remove your own admin role.' });
      }
      await service(`profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ role })
      });
      return json(res, 200, { ok: true });
    }

    if (action === 'reset_stats') {
      const userId = req.body.user_id;
      if (!userId) return json(res, 400, { error: 'user_id required.' });
      await service(`rounds?player_id=eq.${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        prefer: 'return=minimal'
      });
      return json(res, 200, { ok: true });
    }

    if (action === 'save_geofence') {
      const s = req.body.settings || {};
      await service('app_settings?id=eq.true', {
        method: 'PATCH',
        body: JSON.stringify({
          launch_boundary_name: String(s.launch_boundary_name || '').trim() || 'DFW launch boundary',
          geofence_west: Number(s.geofence_west),
          geofence_east: Number(s.geofence_east),
          geofence_south: Number(s.geofence_south),
          geofence_north: Number(s.geofence_north),
          proximity_miles: Number(s.proximity_miles),
          updated_at: new Date().toISOString()
        })
      });
      return json(res, 200, { ok: true });
    }

    if (action === 'save_company') {
      const s = req.body.settings || {};
      await service('app_settings?id=eq.true', {
        method: 'PATCH',
        body: JSON.stringify({
          company_name: String(s.company_name || '').trim() || 'Golfolio',
          support_email: s.support_email || null,
          review_mode: s.review_mode === 'community' ? 'community' : 'admin',
          updated_at: new Date().toISOString()
        })
      });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'Unknown admin action.' });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Admin service failed.' });
  }
}

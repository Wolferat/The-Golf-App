const json = (res, status, body) => res.status(status).json(body);

function approvedEmailRedirect(requestedUrl) {
  const configuredOrigin = String(process.env.GOLFOLIO_APP_URL || '').replace(/\/+$/, '');
  const allowedOrigins = new Set([
    'https://the-golf-app-eight.vercel.app',
    configuredOrigin
  ].filter(Boolean));

  try {
    const redirect = new URL(String(requestedUrl || ''));
    if (!allowedOrigins.has(redirect.origin)) return null;
    return `${redirect.origin}/settings`;
  } catch {
    return null;
  }
}

const DEFAULTS = {
  notify_nearby_events: true,
  notify_followed_activity: true,
  notify_product_updates: false,
  use_location: false,
  nearby_radius_miles: 15,
  show_tournaments: true,
  show_courses: true,
  show_training: true,
  show_simulators: true
};

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
  if (!url || !service) throw new Error('Settings service is not configured.');
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
  if (!response.ok) throw new Error(body.message || body.hint || 'Settings request failed.');
  return body;
}

function normalizeSettings(row) {
  return {
    notify_nearby_events: row?.notify_nearby_events ?? DEFAULTS.notify_nearby_events,
    notify_followed_activity: row?.notify_followed_activity ?? DEFAULTS.notify_followed_activity,
    notify_product_updates: row?.notify_product_updates ?? DEFAULTS.notify_product_updates,
    use_location: row?.use_location ?? DEFAULTS.use_location,
    nearby_radius_miles: Number(row?.nearby_radius_miles ?? DEFAULTS.nearby_radius_miles),
    show_tournaments: row?.show_tournaments ?? DEFAULTS.show_tournaments,
    show_courses: row?.show_courses ?? DEFAULTS.show_courses,
    show_training: row?.show_training ?? DEFAULTS.show_training,
    show_simulators: row?.show_simulators ?? DEFAULTS.show_simulators
  };
}

function pickSettings(body = {}) {
  const next = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (body[key] === undefined) continue;
    if (key === 'nearby_radius_miles') {
      const miles = Number(body[key]);
      if (!Number.isInteger(miles) || miles < 1 || miles > 100) {
        throw new Error('Nearby radius must be a whole number between 1 and 100 miles.');
      }
      next[key] = miles;
      continue;
    }
    next[key] = Boolean(body[key]);
  }
  return next;
}

async function ensureSettings(userId) {
  const existing = await supabase(
    `user_settings?user_id=eq.${userId}&select=*`
  );
  if (existing[0]) return normalizeSettings(existing[0]);
  const created = await supabase('user_settings', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: userId, ...DEFAULTS })
  });
  return normalizeSettings(created[0] || { user_id: userId, ...DEFAULTS });
}

export default async function handler(req, res) {
  try {
    const user = await authenticatedUser(req);
    if (!user) return json(res, 401, { error: 'Please sign in to manage settings.' });

    if (req.method === 'GET') {
      const [settings, profileRows] = await Promise.all([
        ensureSettings(user.id),
        supabase(
          `profiles?id=eq.${user.id}&select=id,username,role,first_name,last_name,phone,avatar`
        )
      ]);
      return json(res, 200, {
        email: user.email || null,
        newEmail: user.new_email || null,
        emailChangeSentAt: user.email_change_sent_at || null,
        profile: profileRows[0] || null,
        settings
      });
    }

    if (req.method === 'POST') {
      const action = req.body?.action;
      if (action === 'email_change') {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return json(res, 400, { error: 'Enter a valid email address.' });
        }
        if (email === String(user.email || '').toLowerCase()) {
          return json(res, 400, { error: 'That is already your current email.' });
        }
        const url = process.env.SUPABASE_URL;
        const anon = process.env.SUPABASE_ANON_KEY;
        const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
        const redirectTo = approvedEmailRedirect(req.body?.redirectTo);
        if (!redirectTo) {
          return json(res, 400, { error: 'Email confirmation must return to an approved Golfolio address.' });
        }
        const response = await fetch(`${url}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            apikey: anon,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(redirectTo ? { email, email_redirect_to: redirectTo } : { email })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          return json(res, response.status, {
            error: data.error_description || data.msg || data.message || 'Could not start email change.'
          });
        }
        return json(res, 200, {
          ok: true,
          pending: true,
          message: 'Check your inbox to verify the new email. Your current email stays active until you confirm.'
        });
      }
      return json(res, 400, { error: 'Unknown settings action.' });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      await ensureSettings(user.id);
      const next = pickSettings(req.body || {});
      if (!Object.keys(next).length) {
        return json(res, 400, { error: 'No settings changes were provided.' });
      }
      const rows = await supabase(`user_settings?user_id=eq.${user.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(next)
      });
      return json(res, 200, { settings: normalizeSettings(rows[0]) });
    }

    return json(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    const message = error.message || 'Settings service failed.';
    const missingTable = /user_settings|schema cache|does not exist/i.test(message);
    return json(res, missingTable ? 503 : 500, {
      error: missingTable
        ? 'Settings are not ready yet. Run user-settings-migration.sql in Supabase, then try again.'
        : message
    });
  }
}

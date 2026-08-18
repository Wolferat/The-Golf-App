const json = (res, status, body) => res.status(status).json(body);

export { json };

export async function requireAdmin(req) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!url || !anon || !token) return { error: { status: 401, body: { error: 'Sign in required.' } } };
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return { error: { status: 401, body: { error: 'Sign in required.' } } };
  const user = await response.json();
  const profileRes = await fetch(`${url}/rest/v1/profiles?id=eq.${user.id}&select=id,role,username`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` }
  });
  const [profile] = await profileRes.json().catch(() => []);
  if (!profile) return { error: { status: 401, body: { error: 'Sign in required.' } } };
  if (profile.role !== 'admin') return { error: { status: 403, body: { error: 'Admin access required.' } } };
  return { user, profile, token };
}

export function serviceHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) throw new Error('Golfolio admin services are not configured.');
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
}

export async function supabase(path, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...serviceHeaders(), ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.message || body.hint || body.error || 'Database request failed.';
    const missing = /column|schema cache|does not exist/i.test(JSON.stringify(body));
    const err = new Error(
      missing
        ? 'Listing controls are not ready yet. Run listing-control-migration.sql in Supabase, then try again.'
        : message
    );
    err.status = missing ? 503 : 502;
    throw err;
  }
  return body;
}

export async function writeAudit({ listingId = null, proposalId = null, action, actorId, details = {} }) {
  await supabase('listing_audit', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      listing_id: listingId,
      proposal_id: proposalId,
      action,
      actor_id: actorId,
      details
    })
  });
}

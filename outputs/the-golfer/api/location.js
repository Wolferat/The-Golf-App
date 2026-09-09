import { json, requireUser, supabase } from '../lib/admin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  const auth = await requireUser(req);
  if (auth.error) return json(res, auth.error.status, auth.error.body);

  const query = String(req.query?.q || req.query?.query || '').trim();
  if (!query) return json(res, 400, { error: 'Enter a US city and state or ZIP code.' });

  let betaArea = null;
  try {
    const [settings] = await supabase(
      'app_settings?id=eq.true&select=beta_area_label,beta_area_latitude,beta_area_longitude,beta_area_radius_miles'
    );
    betaArea = settings || null;
  } catch {
    betaArea = null;
  }

  const { resolveUsLocation } = await import('../lib/us-location.js');
  const result = await resolveUsLocation(query, { betaArea });
  res.setHeader('Cache-Control', 'private, no-store');
  if (!result.ok) return json(res, 404, result);
  return json(res, 200, result);
}

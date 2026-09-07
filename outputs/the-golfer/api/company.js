import { DEFAULT_BETA_AREA, normalizeBetaArea, parseCoordinate } from '../lib/listings.js';

const json = (res, status, body) => res.status(status).json(body);

const SELECT_FIELDS = [
  'company_name',
  'support_email',
  'launch_boundary_name',
  'launch_description',
  'location_radius_default',
  'launch_enabled',
  'discovery_enabled',
  'admin_approval_required',
  'pending_queue_max',
  'community_submissions_enabled',
  'ops_admin_emails',
  'notify_listing_entered_queue',
  'notify_queue_at_max',
  'support_message',
  'privacy_guidelines',
  'review_mode',
  'ai_manual_search_enabled',
  'ai_research_enabled',
  'auto_expire_events_enabled',
  'beta_area_label',
  'beta_area_latitude',
  'beta_area_longitude',
  'beta_area_radius_miles',
  'updated_at'
].join(',');

const DEFAULTS = {
  company_name: 'Golfolio',
  support_email: null,
  launch_boundary_name: 'Sherman area',
  launch_description:
    'Golf around Sherman: a 30-mile service area centered on Sherman, Texas. Admins can change the center and radius in Company Settings.',
  location_radius_default: 15,
  launch_enabled: true,
  discovery_enabled: false,
  admin_approval_required: true,
  pending_queue_max: 25,
  community_submissions_enabled: false,
  ops_admin_emails: null,
  notify_listing_entered_queue: true,
  notify_queue_at_max: true,
  support_message: null,
  privacy_guidelines: null,
  review_mode: 'admin',
  ai_manual_search_enabled: false,
  ai_research_enabled: false,
  auto_expire_events_enabled: true,
  beta_area_label: DEFAULT_BETA_AREA.label,
  beta_area_latitude: DEFAULT_BETA_AREA.latitude,
  beta_area_longitude: DEFAULT_BETA_AREA.longitude,
  beta_area_radius_miles: DEFAULT_BETA_AREA.radiusMiles
};

async function profileFor(token) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !token) return null;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,role,username`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  const [profile] = await response.json();
  return profile || null;
}

function serviceHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) throw new Error('Company settings are not configured.');
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
}

function normalize(row = {}) {
  const area = normalizeBetaArea(row);
  return {
    company_name: row.company_name || DEFAULTS.company_name,
    support_email: row.support_email || null,
    launch_boundary_name: row.launch_boundary_name || 'Sherman area',
    launch_description:
      row.launch_description ||
      `Golf around Sherman: a ${area.radiusMiles}-mile service area centered on ${area.label}.`,
    location_radius_default: Number(row.location_radius_default ?? DEFAULTS.location_radius_default),
    launch_enabled: row.launch_enabled != null ? Boolean(row.launch_enabled) : DEFAULTS.launch_enabled,
    discovery_enabled: row.discovery_enabled != null ? Boolean(row.discovery_enabled) : DEFAULTS.discovery_enabled,
    admin_approval_required: true,
    pending_queue_max: Number(row.pending_queue_max ?? DEFAULTS.pending_queue_max),
    community_submissions_enabled:
      row.community_submissions_enabled != null
        ? Boolean(row.community_submissions_enabled)
        : DEFAULTS.community_submissions_enabled,
    ops_admin_emails: row.ops_admin_emails || null,
    notify_listing_entered_queue:
      row.notify_listing_entered_queue != null
        ? Boolean(row.notify_listing_entered_queue)
        : DEFAULTS.notify_listing_entered_queue,
    notify_queue_at_max:
      row.notify_queue_at_max != null ? Boolean(row.notify_queue_at_max) : DEFAULTS.notify_queue_at_max,
    support_message: row.support_message || null,
    privacy_guidelines: row.privacy_guidelines || null,
    review_mode: 'admin',
    ai_manual_search_enabled: Boolean(row.ai_manual_search_enabled),
    ai_research_enabled: Boolean(row.ai_research_enabled),
    auto_expire_events_enabled:
      row.auto_expire_events_enabled != null ? Boolean(row.auto_expire_events_enabled) : true,
    beta_area_label: area.label,
    beta_area_latitude: area.latitude,
    beta_area_longitude: area.longitude,
    beta_area_radius_miles: area.radiusMiles,
    updated_at: row.updated_at || null,
    boundary_note:
      `Sherman service area: a ${area.radiusMiles}-mile radius centered on ${area.label} (${area.latitude}, ${area.longitude}). Change these values in Company Settings when the active area moves.`
  };
}

function cleanText(value, { required = false, max = 500 } = {}) {
  if (value == null) return required ? null : null;
  const text = String(value).trim();
  if (!text) return required ? null : null;
  if (text.length > max) throw new Error(`Text must be ${max} characters or fewer.`);
  return text;
}

function cleanEmailList(value) {
  if (value == null || String(value).trim() === '') return null;
  const parts = String(value)
    .split(/[,\n;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) return null;
  for (const email of parts) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`Invalid admin email: ${email}`);
    }
  }
  return parts.join(', ');
}

function pickUpdates(body = {}) {
  const next = {};

  if (body.company_name !== undefined) {
    const company_name = cleanText(body.company_name, { required: true, max: 80 });
    if (!company_name) throw new Error('Company name is required.');
    next.company_name = company_name;
  }
  if (body.support_email !== undefined) {
    const email = cleanText(body.support_email, { max: 160 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Support email is invalid.');
    next.support_email = email;
  }
  if (body.launch_boundary_name !== undefined) {
    const launch_boundary_name = cleanText(body.launch_boundary_name, { required: true, max: 120 });
    if (!launch_boundary_name) throw new Error('Launch region name is required.');
    next.launch_boundary_name = launch_boundary_name;
  }
  if (body.launch_description !== undefined) {
    next.launch_description = cleanText(body.launch_description, { max: 1000 });
  }
  if (body.location_radius_default !== undefined) {
    const miles = Number(body.location_radius_default);
    if (!Number.isInteger(miles) || miles < 1 || miles > 100) {
      throw new Error('Location radius default must be a whole number between 1 and 100.');
    }
    next.location_radius_default = miles;
  }
  if (body.launch_enabled !== undefined) next.launch_enabled = Boolean(body.launch_enabled);
  if (body.discovery_enabled !== undefined) next.discovery_enabled = Boolean(body.discovery_enabled);
  if (body.admin_approval_required === false || body.review_mode === 'community') {
    throw new Error('Manual admin approval is required during the current Golfolio phase.');
  }
  if (body.admin_approval_required !== undefined || body.review_mode !== undefined) {
    next.admin_approval_required = true;
    next.review_mode = 'admin';
  }
  if (body.pending_queue_max !== undefined) {
    const max = Number(body.pending_queue_max);
    if (!Number.isInteger(max) || max < 1 || max > 25) {
      throw new Error('Pending queue max must be a whole number between 1 and 25.');
    }
    next.pending_queue_max = max;
  }
  if (body.community_submissions_enabled !== undefined) {
    next.community_submissions_enabled = Boolean(body.community_submissions_enabled);
  }
  if (body.ops_admin_emails !== undefined) next.ops_admin_emails = cleanEmailList(body.ops_admin_emails);
  if (body.notify_listing_entered_queue !== undefined) {
    next.notify_listing_entered_queue = Boolean(body.notify_listing_entered_queue);
  }
  if (body.notify_queue_at_max !== undefined) {
    next.notify_queue_at_max = Boolean(body.notify_queue_at_max);
  }
  if (body.support_message !== undefined) {
    next.support_message = cleanText(body.support_message, { max: 1000 });
  }
  if (body.privacy_guidelines !== undefined) {
    next.privacy_guidelines = cleanText(body.privacy_guidelines, { max: 2000 });
  }
  if (body.ai_manual_search_enabled !== undefined) {
    next.ai_manual_search_enabled = Boolean(body.ai_manual_search_enabled);
  }
  if (body.ai_research_enabled !== undefined) {
    next.ai_research_enabled = Boolean(body.ai_research_enabled);
  }
  if (body.auto_expire_events_enabled !== undefined) {
    next.auto_expire_events_enabled = Boolean(body.auto_expire_events_enabled);
  }
  if (body.beta_area_label !== undefined) {
    const beta_area_label = cleanText(body.beta_area_label, { required: true, max: 120 });
    if (!beta_area_label) throw new Error('Service area label is required.');
    next.beta_area_label = beta_area_label;
  }
  if (body.beta_area_latitude !== undefined) {
    const latitude = parseCoordinate(body.beta_area_latitude, { min: -90, max: 90 });
    if (latitude == null) throw new Error('Service area latitude must be a number between -90 and 90.');
    next.beta_area_latitude = latitude;
  }
  if (body.beta_area_longitude !== undefined) {
    const longitude = parseCoordinate(body.beta_area_longitude, { min: -180, max: 180 });
    if (longitude == null) throw new Error('Service area longitude must be a number between -180 and 180.');
    next.beta_area_longitude = longitude;
  }
  if (body.beta_area_radius_miles !== undefined) {
    const miles = Number(body.beta_area_radius_miles);
    if (!Number.isInteger(miles) || miles < 1 || miles > 250) {
      throw new Error('Service area radius must be a whole number of miles between 1 and 250.');
    }
    next.beta_area_radius_miles = miles;
  }

  return next;
}

async function loadSettings(headers) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/app_settings?id=eq.true&select=${SELECT_FIELDS}`;
  let response = await fetch(url, { headers });
  let rows = await response.json().catch(() => []);
  if (!response.ok) {
    const missing = /column|schema cache|does not exist/i.test(JSON.stringify(rows));
    if (missing) {
      const fallbackSelect = SELECT_FIELDS.replace(
        ',beta_area_label,beta_area_latitude,beta_area_longitude,beta_area_radius_miles',
        ''
      );
      response = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/app_settings?id=eq.true&select=${fallbackSelect}`,
        { headers }
      );
      rows = await response.json().catch(() => []);
    }
    if (!response.ok) {
      const stillMissing = /column|schema cache|does not exist/i.test(JSON.stringify(rows));
      throw new Error(
        stillMissing
          ? 'Company settings are not ready yet. Run company-settings-migration.sql and sherman-beta-area-migration.sql in Supabase, then try again.'
          : rows.message || 'Could not load company settings.'
      );
    }
  }
  return normalize(rows[0] || DEFAULTS);
}

export default async function handler(req, res) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return json(res, 401, { error: 'Sign in required.' });
    const profile = await profileFor(token);
    if (!profile) return json(res, 401, { error: 'Sign in required.' });
    if (profile.role !== 'admin') return json(res, 403, { error: 'Admin access required.' });

    const headers = serviceHeaders();

    if (req.method === 'GET') {
      const settings = await loadSettings(headers);
      return json(res, 200, { settings, profile: { id: profile.id, username: profile.username, role: profile.role } });
    }

    if (req.method !== 'PUT' && req.method !== 'PATCH') {
      return json(res, 405, { error: 'Method not allowed.' });
    }

    const updates = pickUpdates(req.body || {});
    if (!Object.keys(updates).length) return json(res, 400, { error: 'No company settings changes were provided.' });
    updates.updated_at = new Date().toISOString();

    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/app_settings?id=eq.true`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(updates)
    });
    const rows = await response.json().catch(() => []);
    if (!response.ok) {
      const missing = /column|schema cache|does not exist/i.test(JSON.stringify(rows));
      return json(res, missing ? 503 : 502, {
        error: missing
          ? 'Company settings are not ready yet. Run company-settings-migration.sql and sherman-beta-area-migration.sql in Supabase, then try again.'
          : rows.message || 'Could not save company settings.'
      });
    }
    return json(res, 200, { settings: normalize(rows[0] || updates) });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Company settings failed.' });
  }
}

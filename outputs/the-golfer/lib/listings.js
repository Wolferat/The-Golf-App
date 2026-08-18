export const KINDS = ['tournament', 'course', 'training', 'simulator', 'charity', 'corporate'];
export const PUBLIC_KINDS = KINDS;
export const EVENT_KINDS = ['tournament', 'training', 'simulator', 'charity', 'corporate'];
export const ADMIN_STATUSES = ['pending', 'approved', 'rejected', 'expired', 'archived', 'deleted'];
export const PENDING_QUEUE_MAX = 25;

export const DEFAULT_BETA_AREA = {
  label: 'Sherman, Texas',
  latitude: 33.6357,
  longitude: -96.6089,
  radiusMiles: 30
};

export function parseCoordinate(value, { min, max } = { min: -90, max: 90 }) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export function milesBetween(aLat, aLng, bLat, bLng) {
  const lat1 = Number(aLat);
  const lng1 = Number(aLng);
  const lat2 = Number(bLat);
  const lng2 = Number(bLng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthMiles = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function normalizeBetaArea(row = {}) {
  const latitude =
    parseCoordinate(row.beta_area_latitude ?? row.latitude, { min: -90, max: 90 }) ??
    DEFAULT_BETA_AREA.latitude;
  const longitude =
    parseCoordinate(row.beta_area_longitude ?? row.longitude, { min: -180, max: 180 }) ??
    DEFAULT_BETA_AREA.longitude;
  const radiusRaw = Number(row.beta_area_radius_miles ?? row.radiusMiles ?? row.radius_miles);
  const radiusMiles = Number.isFinite(radiusRaw)
    ? Math.min(Math.max(Math.trunc(radiusRaw), 1), 250)
    : DEFAULT_BETA_AREA.radiusMiles;
  const label = String(row.beta_area_label || row.label || DEFAULT_BETA_AREA.label).trim() || DEFAULT_BETA_AREA.label;
  return { label, latitude, longitude, radiusMiles };
}

export function areaSearchPrompt(area = DEFAULT_BETA_AREA) {
  const next = normalizeBetaArea({
    beta_area_label: area.label,
    beta_area_latitude: area.latitude,
    beta_area_longitude: area.longitude,
    beta_area_radius_miles: area.radiusMiles
  });
  return `Golfolio beta listing area: a ${next.radiusMiles}-mile straight-line radius centered on ${next.label} (latitude ${next.latitude}, longitude ${next.longitude}), Texas, United States`;
}

export function withinBetaArea(lat, lng, area = DEFAULT_BETA_AREA) {
  const miles = milesBetween(lat, lng, area.latitude, area.longitude);
  return miles != null && miles <= area.radiusMiles;
}

export function leadDistanceMiles(lead, area = DEFAULT_BETA_AREA) {
  const miles = milesBetween(lead?.latitude, lead?.longitude, area.latitude, area.longitude);
  return miles == null ? null : Math.round(miles * 10) / 10;
}

export function filterLeadsInBetaArea(leads, area = DEFAULT_BETA_AREA) {
  const kept = [];
  const omitted = [];
  for (const lead of Array.isArray(leads) ? leads : []) {
    if (!lead?.title || !isHttpUrl(lead.source_url || lead.official_website || lead.registration_url)) {
      omitted.push({ title: lead?.title || null, reason: 'incomplete' });
      continue;
    }
    if (!withinBetaArea(lead.latitude, lead.longitude, area)) {
      omitted.push({
        title: lead.title,
        reason: 'missing_coordinates_or_outside_radius',
        latitude: lead.latitude ?? null,
        longitude: lead.longitude ?? null
      });
      continue;
    }
    kept.push({ ...lead, distance_miles: leadDistanceMiles(lead, area) });
  }
  return { kept, omitted };
}

export function isHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function cleanText(value, max = 500) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

export function cleanPhone(value) {
  const text = cleanText(value, 40);
  if (!text) return null;
  if (!/^[0-9+().\-\s]{7,40}$/.test(text)) throw new Error('Phone number format is invalid.');
  return text;
}

export function cleanUrl(value) {
  const text = cleanText(value, 500);
  if (!text) return null;
  if (!isHttpUrl(text)) throw new Error('URLs must start with http:// or https://.');
  return text;
}

export function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function cleanReviews(list = []) {
  const rows = Array.isArray(list) ? list.slice(0, 3) : [];
  return rows.map((row) => {
    const excerpt = cleanText(row.excerpt || row.quote, 400);
    const source_name = cleanText(row.source_name, 160);
    const source_url = cleanUrl(row.source_url);
    if (!excerpt || !source_name || !source_url) {
      throw new Error('Each review excerpt needs text, a source name, and a source URL.');
    }
    if (wordCount(excerpt) > 25) throw new Error('Review excerpts may be at most 25 words.');
    return { excerpt, source_name, source_url };
  });
}

export function cleanPhotos(list = []) {
  const rows = Array.isArray(list) ? list.slice(0, 3) : [];
  return rows.map((row) => {
    const url = cleanUrl(row.url || row.image_url);
    const source_url = cleanUrl(row.source_url || row.url);
    const source_name = cleanText(row.source_name, 160);
    if (!url || !source_url || !source_name) {
      throw new Error('Each photo needs an image URL, source URL, and source name.');
    }
    return { url, source_url, source_name };
  });
}

export function chicagoDate(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

export function shouldExpire(listing, now = new Date()) {
  if (!EVENT_KINDS.includes(listing.kind)) return false;
  if (listing.status !== 'approved') return false;
  if (listing.ends_at) return new Date(listing.ends_at).getTime() < now.getTime();
  if (listing.starts_at) return chicagoDate(now) > chicagoDate(listing.starts_at);
  return false;
}

export const LISTING_SELECT = [
  'id','title','kind','status','description','city','venue_name','address','phone',
  'official_website','registration_url','source_url','source_name','price_note',
  'starts_at','ends_at','expires_at','expire_reason','archived_at','deleted_at',
  'photos','reviews','field_sources','latitude','longitude','discovered_by',
  'discovery_notes','created_at','updated_at','reviewed_at','reviewed_by'
].join(',');

export function publicListing(row) {
  if (!row || row.status !== 'approved') return null;
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    description: row.description || null,
    city: row.city || null,
    venue_name: row.venue_name || null,
    address: row.address || null,
    phone: row.phone || null,
    official_website: row.official_website || null,
    registration_url: row.registration_url || row.source_url || null,
    source_url: row.source_url,
    source_name: row.source_name || null,
    price_note: row.price_note || null,
    starts_at: row.starts_at || null,
    ends_at: row.ends_at || null,
    photos: Array.isArray(row.photos) ? row.photos.slice(0, 3) : [],
    reviews: Array.isArray(row.reviews) ? row.reviews.slice(0, 3) : [],
    latitude: parseCoordinate(row.latitude, { min: -90, max: 90 }),
    longitude: parseCoordinate(row.longitude, { min: -180, max: 180 })
  };
}

const EDITABLE = {
  title: (v) => {
    const title = cleanText(v, 200);
    if (!title) throw new Error('Title is required.');
    return title;
  },
  kind: (v) => {
    if (!KINDS.includes(v)) throw new Error('Invalid listing type.');
    return v;
  },
  status: (v) => {
    if (!['pending', 'approved', 'rejected'].includes(v)) throw new Error('Invalid listing status.');
    return v;
  },
  description: (v) => cleanText(v, 2000),
  venue_name: (v) => cleanText(v, 200),
  city: (v) => cleanText(v, 120),
  address: (v) => cleanText(v, 300),
  phone: (v) => (v ? cleanPhone(v) : null),
  official_website: (v) => (v ? cleanUrl(v) : null),
  registration_url: (v) => (v ? cleanUrl(v) : null),
  source_url: (v) => {
    const url = cleanUrl(v);
    if (!url) throw new Error('Source URL is required.');
    return url;
  },
  source_name: (v) => cleanText(v, 160),
  price_note: (v) => cleanText(v, 300),
  starts_at: (v) => (v ? new Date(v).toISOString() : null),
  ends_at: (v) => (v ? new Date(v).toISOString() : null),
  photos: (v) => cleanPhotos(v || []),
  reviews: (v) => cleanReviews(v || []),
  field_sources: (v) => (v && typeof v === 'object' ? v : {}),
  discovery_notes: (v) => cleanText(v, 1000)
};

export function pickListingFields(body = {}, { allowStatus = true } = {}) {
  const next = {};
  for (const [key, fn] of Object.entries(EDITABLE)) {
    if (body[key] === undefined) continue;
    if (key === 'status' && !allowStatus) continue;
    next[key] = fn(body[key]);
  }
  if (next.starts_at === 'Invalid Date' || next.ends_at === 'Invalid Date') {
    throw new Error('Event dates must be valid.');
  }
  return next;
}

export function leadToListing(lead, { discoveredBy = 'ai' } = {}) {
  const kind = KINDS.includes(lead.kind) ? lead.kind : null;
  const title = cleanText(lead.title, 200);
  const source_url = lead.source_url || lead.official_website || lead.registration_url;
  if (!title || !kind || !cleanText(lead.city, 120) || !isHttpUrl(source_url)) return null;
  return {
    title,
    kind,
    city: cleanText(lead.city, 120),
    venue_name: cleanText(lead.venue_name || lead.course_name, 200),
    description: cleanText(lead.description, 2000),
    starts_at: lead.starts_at ? new Date(lead.starts_at).toISOString() : null,
    ends_at: lead.ends_at ? new Date(lead.ends_at).toISOString() : null,
    price_note: cleanText(lead.price_note || lead.fee_note, 300),
    official_website: isHttpUrl(lead.official_website) ? lead.official_website : null,
    registration_url: isHttpUrl(lead.registration_url) ? lead.registration_url : null,
    phone: lead.phone ? String(lead.phone).trim() : null,
    source_name: cleanText(lead.source_name, 160),
    source_url,
    status: 'pending',
    discovered_by: discoveredBy,
    discovery_notes: cleanText([lead.relevance_note, lead.missing_note, lead.confidence].filter(Boolean).join(' · '), 1000),
    photos: [],
    reviews: [],
    latitude: parseCoordinate(lead.latitude, { min: -90, max: 90 }),
    longitude: parseCoordinate(lead.longitude, { min: -180, max: 180 })
  };
}

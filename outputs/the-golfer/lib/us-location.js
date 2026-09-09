import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { milesBetween, withinBetaArea, normalizeBetaArea } from './listings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let zipIndex = null;

function loadZipIndex() {
  if (zipIndex) return zipIndex;
  try {
    const raw = readFileSync(join(__dirname, '../data/us-zip-centroids-tx.json'), 'utf8');
    zipIndex = JSON.parse(raw);
  } catch {
    zipIndex = {};
  }
  return zipIndex;
}

const geocodeCache = new Map();
const GEOCODE_CACHE_MAX = 500;

export function parseLocationQuery(input = '') {
  const text = String(input || '').trim();
  if (!text) return { type: 'empty', query: '' };
  const zipMatch = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) return { type: 'zip', query: zipMatch[1], label: zipMatch[1] };
  const cityState = text.match(/^([^,]+),\s*([A-Za-z]{2})$/);
  if (cityState) {
    return {
      type: 'city',
      query: `${cityState[1].trim()}, ${cityState[2].toUpperCase()}`,
      label: `${cityState[1].trim()}, ${cityState[2].toUpperCase()}`
    };
  }
  return { type: 'text', query: text.slice(0, 120), label: text.slice(0, 120) };
}

function lookupZip(zip) {
  const row = loadZipIndex()[zip];
  if (!row) return null;
  return {
    latitude: Number(row.lat),
    longitude: Number(row.lng),
    city: row.city || null,
    state: row.state || 'TX',
    source: 'local_zip_index'
  };
}

function lookupCity(cityState) {
  const needle = cityState.toLowerCase();
  for (const row of Object.values(loadZipIndex())) {
    const label = `${row.city || ''}, ${row.state || ''}`.toLowerCase();
    if (label === needle) {
      return {
        latitude: Number(row.lat),
        longitude: Number(row.lng),
        city: row.city || null,
        state: row.state || null,
        source: 'local_city_index'
      };
    }
  }
  return null;
}

async function geocodeWithGoogle(query) {
  const key = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!key) return null;
  const cacheKey = `google:${query.toLowerCase()}`;
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('components', 'country:US');
  url.searchParams.set('key', key);
  const response = await fetch(url.toString());
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  const location = data?.results?.[0]?.geometry?.location;
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;
  const resolved = {
    latitude: location.lat,
    longitude: location.lng,
    city: null,
    state: 'US',
    source: 'google_geocoding'
  };
  if (geocodeCache.size >= GEOCODE_CACHE_MAX) {
    const first = geocodeCache.keys().next().value;
    geocodeCache.delete(first);
  }
  geocodeCache.set(cacheKey, resolved);
  return resolved;
}

export async function resolveUsLocation(input, { betaArea } = {}) {
  const parsed = parseLocationQuery(input);
  if (parsed.type === 'empty') {
    return { ok: false, error: 'Enter a US city and state or ZIP code.' };
  }

  let resolved = null;
  if (parsed.type === 'zip') resolved = lookupZip(parsed.query);
  else if (parsed.type === 'city') resolved = lookupCity(parsed.query);
  if (!resolved) resolved = await geocodeWithGoogle(parsed.query);
  if (!resolved) {
    return {
      ok: false,
      error: 'Could not resolve that location from local data.',
      dependency: process.env.GOOGLE_GEOCODING_API_KEY ? null : 'GOOGLE_GEOCODING_API_KEY'
    };
  }

  const area = normalizeBetaArea(betaArea || {});
  const distanceMiles = milesBetween(resolved.latitude, resolved.longitude, area.latitude, area.longitude);
  const withinLaunchArea = withinBetaArea(resolved.latitude, resolved.longitude, area);

  return {
    ok: true,
    label: parsed.label,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    city: resolved.city,
    state: resolved.state,
    source: resolved.source,
    distance_miles: distanceMiles == null ? null : Math.round(distanceMiles * 10) / 10,
    within_launch_area: withinLaunchArea,
    launch_area_label: area.label
  };
}

export function filterListingsNearPoint(listings, point, radiusMiles) {
  if (!point?.latitude || !point?.longitude || !radiusMiles) return listings;
  return listings.filter((row) => {
    const miles = milesBetween(point.latitude, point.longitude, row.latitude, row.longitude);
    return miles != null && miles <= radiusMiles;
  });
}

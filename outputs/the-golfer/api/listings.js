import { publicListing, KINDS } from '../lib/listings.js';
import { json, requireUser } from '../lib/admin.js';

const CARD_SELECT = 'id,title,kind,city,starts_at,price_note,latitude,longitude,status';
const CARD_SELECT_MIN = 'id,title,kind,city,starts_at,price_note,status';

async function fetchApproved(url, key, select, kindFilter = '') {
  return fetch(
    `${url}/rest/v1/listings?status=eq.approved${kindFilter}&select=${select}&order=starts_at.asc.nullslast`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
}

async function coverPhotosByListing(url, key, ids) {
  if (!ids.length) return {};
  const response = await fetch(
    `${url}/rest/v1/venue_photos?listing_id=in.(${ids.join(',')})&status=eq.approved&select=listing_id,image_url,created_at&order=created_at.asc`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!response.ok) return {};
  const rows = await response.json().catch(() => []);
  const first = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.listing_id || !row?.image_url || first[row.listing_id]) continue;
    if (!/^https:\/\//i.test(row.image_url)) continue;
    first[row.listing_id] = row.image_url;
  }
  return first;
}

export default async function handler(req, res) {
  const auth = await requireUser(req);
  if (auth.error) {
    res.setHeader('Cache-Control', 'no-store');
    return json(res, auth.error.status, { ...auth.error.body, gate: true });
  }
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return json(res, 200, { listings: [] });
  const kind = String(req.query?.kind || '').trim();
  const kinds = String(req.query?.kinds || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => KINDS.includes(item));
  const kindFilter = kinds.length
    ? `&kind=in.(${kinds.map(encodeURIComponent).join(',')})`
    : KINDS.includes(kind)
      ? `&kind=eq.${encodeURIComponent(kind)}`
      : '';
  let response = await fetchApproved(url, key, CARD_SELECT, kindFilter);
  if (!response.ok) response = await fetchApproved(url, key, CARD_SELECT_MIN, kindFilter);
  if (!response.ok) return json(res, 502, { error: 'Could not load listings.' });
  const rows = await response.json();
  const listings = rows.map((row) => publicListing({ ...row, status: 'approved' })).filter(Boolean);
  const covers = await coverPhotosByListing(url, key, listings.map((row) => row.id)).catch(() => ({}));
  res.setHeader('Cache-Control', 'private, no-store');
  return json(res, 200, {
    listings: listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      kind: listing.kind,
      city: listing.city,
      starts_at: listing.starts_at,
      price_note: listing.price_note,
      latitude: listing.latitude,
      longitude: listing.longitude,
      cover_photo_url: covers[listing.id] || null
    }))
  });
}

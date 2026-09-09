import {displayPhotoUrl} from '../lib/imported-photos.js';
import { publicListing, KINDS } from '../lib/listings.js';
import { kindsForBoardCategory } from '../lib/catalog-categories.js';
import { json, requireUser } from '../lib/admin.js';

const CARD_SELECT = 'id,title,kind,city,starts_at,price_note,latitude,longitude,status';
const CARD_SELECT_MIN = 'id,title,kind,city,starts_at,price_note,status';

function userHeaders(anonKey, accessToken) {
  return { apikey: anonKey, Authorization: `Bearer ${accessToken}` };
}

async function fetchApproved(url, headers, select, kindFilter = '') {
  return fetch(
    `${url}/rest/v1/listings?status=eq.approved${kindFilter}&select=${select}&order=starts_at.asc.nullslast`,
    { headers }
  );
}

async function coverPhotosByListing(url, headers, ids) {
  if (!ids.length) return {};
  const response = await fetch(
    `${url}/rest/v1/venue_photos?listing_id=in.(${ids.join(',')})&status=eq.approved&select=id,listing_id,image_url,source_url,created_at&order=created_at.asc`,
    { headers }
  );
  if (!response.ok) return {};
  const rows = await response.json().catch(() => []);
  const first = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.listing_id || !row?.image_url || first[row.listing_id]) continue;
    first[row.listing_id] = await displayPhotoUrl(row);
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
  const headers = userHeaders(key, auth.token);
  const boardCategory = String(req.query?.category || req.query?.kind || '').trim();
  const kinds = String(req.query?.kinds || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => KINDS.includes(item));
  const categoryKinds = kindsForBoardCategory(boardCategory);
  const effectiveKinds = kinds.length ? kinds : categoryKinds.length < KINDS.length ? categoryKinds : [];
  const kindFilter = effectiveKinds.length
    ? `&kind=in.(${effectiveKinds.map(encodeURIComponent).join(',')})`
    : '';
  let response = await fetchApproved(url, headers, CARD_SELECT, kindFilter);
  if (!response.ok) response = await fetchApproved(url, headers, CARD_SELECT_MIN, kindFilter);
  if (!response.ok) return json(res, 502, { error: 'Could not load listings.' });
  const rows = await response.json();
  const listings = rows.map((row) => publicListing({ ...row, status: 'approved' })).filter(Boolean);
  const covers = await coverPhotosByListing(url, headers, listings.map((row) => row.id)).catch(() => ({}));
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

import { publicListing } from '../lib/listings.js';

const FULL_SELECT = [
  'id','title','kind','status','description','city','venue_name','address','phone',
  'official_website','registration_url','source_url','source_name','price_note',
  'starts_at','ends_at','photos','reviews','latitude','longitude'
].join(',');
const BASIC_SELECT = 'id,title,kind,city,starts_at,price_note,latitude,longitude,source_url,source_name,status';

async function fetchApproved(url, key, select) {
  return fetch(`${url}/rest/v1/listings?status=eq.approved&select=${select}&order=starts_at.asc.nullslast`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(200).json({ listings: [] });
  let response = await fetchApproved(url, key, FULL_SELECT);
  if (!response.ok) response = await fetchApproved(url, key, BASIC_SELECT);
  if (!response.ok) return res.status(502).json({ error: 'Could not load listings.' });
  const rows = await response.json();
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).json({ listings: rows.map((row) => publicListing({ ...row, status: 'approved' })).filter(Boolean) });
}

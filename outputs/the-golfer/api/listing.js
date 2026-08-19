import { publicListing } from '../lib/listings.js';

const FULL_SELECT = [
  'id','title','kind','status','description','city','venue_name','address','phone',
  'official_website','registration_url','source_url','source_name','price_note',
  'starts_at','ends_at','photos','reviews'
].join(',');
const BASIC_SELECT = 'id,title,kind,city,starts_at,price_note,source_url,source_name,status';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const id = String(req.query.id || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).json({ error: 'That listing is not available.' });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(404).json({ error: 'That listing is not available.' });
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  let response = await fetch(`${url}/rest/v1/listings?id=eq.${encodeURIComponent(id)}&status=eq.approved&select=${FULL_SELECT}`, { headers });
  if (!response.ok) {
    response = await fetch(`${url}/rest/v1/listings?id=eq.${encodeURIComponent(id)}&status=eq.approved&select=${BASIC_SELECT}`, { headers });
  }
  const rows = await response.json().catch(() => []);
  const listing = publicListing(rows[0]);
  if (!response.ok || !listing) {
    return res.status(404).json({ error: 'That listing is not available.' });
  }
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).json({ listing });
}

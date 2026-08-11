export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(200).json({ listings: [] });
  const response = await fetch(`${url}/rest/v1/listings?status=eq.approved&select=id,title,kind,city,starts_at,price_note,latitude,longitude&order=starts_at.asc.nullslast`, { headers: { apikey:key, Authorization:`Bearer ${key}` } });
  if (!response.ok) return res.status(502).json({ error:'Could not load listings.' });
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).json({ listings: await response.json() });
}

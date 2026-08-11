export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed.' });
  const { email, password, username } = req.body || {};
  if (!email || !password || !username) return res.status(400).json({ message: 'Email, password, and username are required.' });
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return res.status(503).json({ message: 'Account setup is not connected yet.' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const upstream = await fetch(base + '/auth/v1/signup', {
      method: 'POST',
      signal: controller.signal,
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, data: { username } })
    });
    const payload = await upstream.json();
    return res.status(upstream.status).json(payload);
  } catch (error) {
    return res.status(502).json({ message: error.name === 'AbortError' ? 'Account service timed out. Please try again.' : 'Could not reach the account service.' });
  } finally {
    clearTimeout(timeout);
  }
}

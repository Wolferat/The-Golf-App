import { supabase } from '../lib/admin.js';
import { purgeExpiredEvidence } from '../lib/account-deletion.js';

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const result = await purgeExpiredEvidence(supabase);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Evidence purge failed.' });
  }
}

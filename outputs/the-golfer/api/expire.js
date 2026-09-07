import { supabase } from '../lib/admin.js';
import { shouldExpire, LISTING_SELECT } from '../lib/listings.js';

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const [settings] = await supabase(
      'app_settings?id=eq.true&select=auto_expire_events_enabled'
    );
    if (settings && settings.auto_expire_events_enabled === false) {
      return res.status(200).json({ expired: 0, message: 'Automatic event expiration is paused in Company Settings.' });
    }

    const listings = await supabase(
      `listings?status=eq.approved&select=${LISTING_SELECT}&limit=500`
    );
    const now = new Date();
    const due = (listings || []).filter((row) => shouldExpire(row, now));
    let expired = 0;
    for (const listing of due) {
      const reason = listing.ends_at
        ? 'Event end date has passed.'
        : 'Event start date has passed the end of the America/Chicago calendar day.';
      await supabase(`listings?id=eq.${encodeURIComponent(listing.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'expired',
          expires_at: now.toISOString(),
          expire_reason: reason
        })
      });
      await supabase('listing_audit', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          listing_id: listing.id,
          action: 'expire',
          details: { reason }
        })
      });
      expired += 1;
    }

    res.status(200).json({
      expired,
      message: expired
        ? `Expired ${expired} dated event listing${expired === 1 ? '' : 's'}. OpenAI was not called.`
        : 'No dated events were due to expire. OpenAI was not called.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Expiration failed.' });
  }
}

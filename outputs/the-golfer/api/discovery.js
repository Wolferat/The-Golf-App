const area = 'inside the Golfolio North Texas launch area: west of Weatherford, east of Royse City, south of the Oklahoma border, and north of Midlothian.';

function outputText(response) {
  if (response.output_text) return response.output_text;
  return (response.output || []).flatMap(x => x.content || []).map(x => x.text || '').join('');
}

async function loadCompanyControls(url, serviceKey) {
  const response = await fetch(
    `${url}/rest/v1/app_settings?id=eq.true&select=discovery_enabled,pending_queue_max,admin_approval_required`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    // If migration has not been run yet, keep discovery paused.
    return { discovery_enabled: false, pending_queue_max: 25, admin_approval_required: true };
  }
  const row = rows[0] || {};
  return {
    discovery_enabled: Boolean(row.discovery_enabled),
    pending_queue_max: Number(row.pending_queue_max || 25),
    admin_approval_required: row.admin_approval_required != null ? Boolean(row.admin_approval_required) : true
  };
}

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Discovery is not configured.' });
  }

  try {
    const controls = await loadCompanyControls(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    if (!controls.discovery_enabled) {
      return res.status(503).json({
        paused: true,
        message: 'AI discovery is paused in Company Settings.'
      });
    }

    const queueMax = Math.min(Math.max(Number(controls.pending_queue_max) || 25, 1), 25);
    const queueResponse = await fetch(`${SUPABASE_URL}/rest/v1/listings?status=eq.pending&select=id`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
    });
    const queue = await queueResponse.json();
    if (!queueResponse.ok) throw Error('Could not check the review queue.');
    if (queue.length >= queueMax) {
      return res.status(200).json({
        queued: 0,
        message: `Discovery stopped: the ${queueMax}-item review queue is full.`
      });
    }

    const ai = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.6-terra',
        tools: [{ type: 'web_search' }],
        input: `Search for upcoming public golf tournaments, charity golf events, corporate golf events open to the public, public training sessions, and simulator events ${area} United States. Return JSON only: an array named listings. Every item must have title, kind (tournament|training|simulator|course), city, starts_at (ISO date or null), price_note (or null), source_url, source_name, latitude (number or null), longitude (number or null), and discovery_notes. Exclude professional events unless the source is the official organizer page. Never invent data; omit an item when its official source URL, title, and city cannot be confirmed.`
      })
    });
    const result = await ai.json();
    if (!ai.ok) throw Error(result.error?.message || 'OpenAI search failed');
    const text = outputText(result).replace(/^```json\s*|\s*```$/g, '');
    const candidates = JSON.parse(text).listings || [];
    const listings = candidates
      .filter(x => x.title && x.kind && x.city && x.source_url)
      .slice(0, queueMax - queue.length)
      .map(x => ({ ...x, status: 'pending', discovered_by: 'ai' }));

    if (listings.length) {
      const saved = await fetch(`${SUPABASE_URL}/rest/v1/listings?on_conflict=source_url`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=representation'
        },
        body: JSON.stringify(listings)
      });
      if (!saved.ok) throw Error('Could not save discovery leads');
    }

    res.status(200).json({
      queued: listings.length,
      message: controls.admin_approval_required
        ? 'All AI discoveries are pending admin approval and will not publish automatically.'
        : 'Discovery leads were saved.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

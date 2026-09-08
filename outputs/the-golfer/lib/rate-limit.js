export async function countRecentEvents(supabase, userId, eventType, windowMs) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const rows = await supabase(
    `social_rate_events?user_id=eq.${encodeURIComponent(userId)}&event_type=eq.${encodeURIComponent(eventType)}&created_at=gte.${encodeURIComponent(since)}&select=id`
  );
  return rows.length;
}

export async function recordRateEvent(supabase, userId, eventType) {
  await supabase('social_rate_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, event_type: eventType })
  });
}

export async function enforceRateLimit(supabase, userId, eventType, { limit, windowMs, message }) {
  const count = await countRecentEvents(supabase, userId, eventType, windowMs);
  if (count >= limit) {
    const err = new Error(message || 'Too many requests. Try again later.');
    err.status = 429;
    throw err;
  }
  await recordRateEvent(supabase, userId, eventType);
}

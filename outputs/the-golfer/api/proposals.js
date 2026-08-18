import { json, requireAdmin, supabase, writeAudit } from '../lib/admin.js';
import { PENDING_QUEUE_MAX, leadToListing, pickListingFields, cleanPhotos, cleanReviews, cleanText, isHttpUrl, normalizeBetaArea, withinBetaArea, DEFAULT_BETA_AREA } from '../lib/listings.js';

async function pendingCount() {
  const rows = await supabase('listings?status=eq.pending&select=id');
  return Array.isArray(rows) ? rows.length : 0;
}

async function pendingQueueMax() {
  const rows = await supabase('app_settings?id=eq.true&select=pending_queue_max');
  const n = Number(rows[0]?.pending_queue_max);
  const fallback = Number.isFinite(n) ? n : PENDING_QUEUE_MAX;
  return Math.min(Math.max(Math.trunc(fallback), 1), PENDING_QUEUE_MAX);
}

async function loadBetaArea() {
  try {
    const rows = await supabase(
      'app_settings?id=eq.true&select=beta_area_label,beta_area_latitude,beta_area_longitude,beta_area_radius_miles'
    );
    return normalizeBetaArea(rows[0] || DEFAULT_BETA_AREA);
  } catch {
    return normalizeBetaArea(DEFAULT_BETA_AREA);
  }
}

function proposedFieldValue(field) {
  if (field == null) return undefined;
  if (typeof field === 'object' && 'value' in field) return field.value;
  return field;
}

export default async function handler(req, res) {
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return json(res, auth.error.status, auth.error.body);

    if (req.method === 'GET') {
      const id = String(req.query.id || '').trim();
      if (id) {
        const [proposal] = await supabase(`listing_proposals?id=eq.${encodeURIComponent(id)}&select=*`);
        if (!proposal) return json(res, 404, { error: 'Proposal not found.' });
        return json(res, 200, { proposal });
      }
      const proposals = await supabase(
        'listing_proposals?status=eq.pending&select=id,listing_id,kind,status,query,payload,created_at&order=created_at.desc&limit=50'
      );
      return json(res, 200, { proposals, pendingCount: await pendingCount() });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
    const action = req.body?.action;
    const id = String(req.body?.id || '').trim();
    const [proposal] = await supabase(`listing_proposals?id=eq.${encodeURIComponent(id)}&select=*`);
    if (!proposal) return json(res, 404, { error: 'Proposal not found.' });

    if (action === 'reject') {
      await supabase(`listing_proposals?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'rejected',
          resolved_by: auth.profile.id,
          resolved_at: new Date().toISOString()
        })
      });
      await writeAudit({
        listingId: proposal.listing_id,
        proposalId: proposal.id,
        action: 'proposal_reject',
        actorId: auth.profile.id
      });
      return json(res, 200, { ok: true });
    }

    if (action === 'approve_lead') {
      if (proposal.kind !== 'search') return json(res, 400, { error: 'This proposal is not a search lead.' });
      const pending = await pendingCount();
      const pendingMax = await pendingQueueMax();
      if (pending >= pendingMax) {
        return json(res, 409, {
          error: `The pending-review queue is full (${pendingMax}).`,
          pendingCount: pending,
          pendingMax
        });
      }
      const index = Number(req.body?.index);
      const edited = req.body?.lead;
      const lead = edited || proposal.payload?.leads?.[index];
      const area = await loadBetaArea();
      if (!withinBetaArea(lead?.latitude, lead?.longitude, area)) {
        return json(res, 400, {
          error: `That lead is missing coordinates or sits outside the ${area.radiusMiles}-mile ${area.label} beta area.`,
          area
        });
      }
      const listing = leadToListing(lead || {}, { discoveredBy: 'ai' });
      if (!listing) return json(res, 400, { error: 'That lead is missing a title, kind, city, or official source URL.' });
      const rows = await supabase('listings?on_conflict=source_url', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(listing)
      });
      await supabase(`listing_proposals?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'approved',
          listing_id: rows[0]?.id || proposal.listing_id,
          resolved_by: auth.profile.id,
          resolved_at: new Date().toISOString()
        })
      });
      await writeAudit({
        listingId: rows[0]?.id,
        proposalId: proposal.id,
        action: 'approve_lead',
        actorId: auth.profile.id,
        details: { title: listing.title }
      });
      return json(res, 201, {
        listing: rows[0] || null,
        duplicate: !rows[0],
        message: rows[0]
          ? 'Lead saved as pending. It will not appear publicly until you approve it.'
          : 'A listing with that source URL already exists, so this lead was not duplicated.'
      });
    }

    if (action === 'apply') {
      if (proposal.kind !== 'enrichment' || !proposal.listing_id) {
        return json(res, 400, { error: 'This proposal is not an enrichment for an existing listing.' });
      }
      const fields = proposal.payload?.fields || {};
      const requested = Array.isArray(req.body?.fields) && req.body.fields.length
        ? req.body.fields
        : Object.keys(fields);
      const patch = {};
      const sources = {};
      for (const key of requested) {
        const proposed = proposedFieldValue(fields[key]);
        if (proposed == null || proposed === '') continue;
        patch[key] = proposed;
        if (fields[key]?.source_url) {
          sources[key] = {
            source_name: fields[key].source_name || null,
            source_url: fields[key].source_url,
            evidence: fields[key].evidence || null
          };
        }
      }
      if (req.body?.photos === true && Array.isArray(proposal.payload?.photos) && proposal.payload.photos.length) {
        patch.photos = proposal.payload.photos;
      }
      if (req.body?.reviews === true && Array.isArray(proposal.payload?.reviews) && proposal.payload.reviews.length) {
        patch.reviews = proposal.payload.reviews;
      }
      const updates = pickListingFields({ ...patch, field_sources: sources }, { allowStatus: false });
      if (patch.photos) updates.photos = cleanPhotos(proposal.payload.photos.filter((x) => isHttpUrl(x.url)));
      if (patch.reviews) updates.reviews = cleanReviews(proposal.payload.reviews.filter((x) => cleanText(x.excerpt, 400)));
      if (!Object.keys(updates).length) return json(res, 400, { error: 'No verified fields were selected to apply.' });
      const rows = await supabase(`listings?id=eq.${encodeURIComponent(proposal.listing_id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(updates)
      });
      await supabase(`listing_proposals?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'applied',
          resolved_by: auth.profile.id,
          resolved_at: new Date().toISOString()
        })
      });
      await writeAudit({
        listingId: proposal.listing_id,
        proposalId: proposal.id,
        action: 'proposal_apply',
        actorId: auth.profile.id,
        details: { fields: Object.keys(updates) }
      });
      return json(res, 200, { listing: rows[0], ok: true });
    }

    return json(res, 400, { error: 'Unknown proposal action.' });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Proposal request failed.' });
  }
}

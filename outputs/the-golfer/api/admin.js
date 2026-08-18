import { json, requireAdmin, supabase, writeAudit } from '../lib/admin.js';
import { LISTING_SELECT, PENDING_QUEUE_MAX, pickListingFields } from '../lib/listings.js';

async function pendingCount() {
  const rows = await supabase('listings?status=eq.pending&select=id');
  return Array.isArray(rows) ? rows.length : 0;
}

export default async function handler(req, res) {
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return json(res, auth.error.status, auth.error.body);
    const { profile } = auth;

    if (req.method === 'GET') {
      const id = String(req.query.id || '').trim();
      if (id) {
        const [listing] = await supabase(`listings?id=eq.${encodeURIComponent(id)}&select=${LISTING_SELECT}`);
        if (!listing || listing.status === 'deleted') return json(res, 404, { error: 'Listing not found.' });
        const proposals = await supabase(
          `listing_proposals?listing_id=eq.${encodeURIComponent(id)}&select=id,kind,status,query,payload,created_at,resolved_at&order=created_at.desc&limit=20`
        );
        return json(res, 200, { listing, proposals, pendingCount: await pendingCount() });
      }
      const view = String(req.query.view || 'active');
      const filter =
        view === 'archived'
          ? 'status=in.(archived,expired)'
          : view === 'all'
            ? 'status=in.(pending,approved,rejected,expired,archived)'
            : 'status=in.(pending,approved)';
      let listings;
      try {
        listings = await supabase(
          `listings?${filter}&select=${LISTING_SELECT}&order=created_at.desc&limit=200`
        );
      } catch {
        listings = await supabase(
          `listings?status=in.(pending,approved)&select=id,title,kind,city,source_name,source_url,starts_at,status,created_at,reviewed_at&order=created_at.desc&limit=200`
        );
      }
      return json(res, 200, { listings, pendingCount: await pendingCount(), pendingMax: PENDING_QUEUE_MAX });
    }

    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
      return json(res, 405, { error: 'Method not allowed.' });
    }

    const action = req.body?.action;
    const id = String(req.body?.id || req.query.id || '').trim();
    if (!id) return json(res, 400, { error: 'Listing id is required.' });
    const [current] = await supabase(`listings?id=eq.${encodeURIComponent(id)}&select=${LISTING_SELECT}`);
    if (!current || current.status === 'deleted') return json(res, 404, { error: 'Listing not found.' });

    if (action === 'approve' || action === 'reject') {
      const status = action === 'approve' ? 'approved' : 'rejected';
      const rows = await supabase(`listings?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status, reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
      });
      await writeAudit({ listingId: id, action, actorId: profile.id, details: { from: current.status, to: status } });
      return json(res, 200, { listing: rows[0], ok: true });
    }

    if (action === 'archive') {
      const rows = await supabase(`listings?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'archived', archived_at: new Date().toISOString() })
      });
      await writeAudit({ listingId: id, action: 'archive', actorId: profile.id, details: { from: current.status } });
      return json(res, 200, { listing: rows[0], ok: true });
    }

    if (action === 'restore') {
      if (!['archived', 'expired'].includes(current.status)) {
        return json(res, 400, { error: 'Only archived or expired listings can be restored.' });
      }
      const rows = await supabase(`listings?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          status: 'approved',
          archived_at: null,
          expires_at: null,
          expire_reason: null,
          reviewed_by: profile.id,
          reviewed_at: new Date().toISOString()
        })
      });
      await writeAudit({ listingId: id, action: 'restore', actorId: profile.id, details: { from: current.status } });
      return json(res, 200, { listing: rows[0], ok: true });
    }

    if (action === 'delete') {
      if (req.body?.confirm !== true && req.body?.confirm !== 'DELETE') {
        return json(res, 400, { error: 'Delete from Golfolio requires a separate confirmation.' });
      }
      const rows = await supabase(`listings?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'deleted', deleted_at: new Date().toISOString() })
      });
      await writeAudit({ listingId: id, action: 'delete', actorId: profile.id, details: { from: current.status } });
      return json(res, 200, { listing: rows[0], ok: true });
    }

    if (action === 'update' || req.method === 'PUT' || req.method === 'PATCH') {
      const updates = pickListingFields(req.body?.listing || req.body || {}, { allowStatus: true });
      if (!Object.keys(updates).length) return json(res, 400, { error: 'No listing changes were provided.' });
      if (updates.status === 'approved' && current.status === 'pending') {
        updates.reviewed_by = profile.id;
        updates.reviewed_at = new Date().toISOString();
      }
      const rows = await supabase(`listings?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(updates)
      });
      await writeAudit({ listingId: id, action: 'update', actorId: profile.id, details: { fields: Object.keys(updates) } });
      return json(res, 200, { listing: rows[0], ok: true });
    }

    return json(res, 400, { error: 'Unknown admin listing action.' });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Admin listing request failed.' });
  }
}

import { randomUUID } from 'node:crypto';
import { json, requireUser, requireAdmin, supabase, storageUpload } from '../lib/admin.js';
import { cleanText } from '../lib/listings.js';

const BUCKET = 'player-contributions';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extForMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const auth = await requireUser(req);
      if (auth.error) return json(res, auth.error.status, auth.error.body);
      const listingId = String(req.query?.listing_id || '').trim();
      if (!listingId) return json(res, 400, { error: 'Listing id is required.' });
      const rows = await supabase(
        `listing_photo_contributions?listing_id=eq.${encodeURIComponent(listingId)}&contributor_id=eq.${auth.user.id}&select=id,status,caption,created_at,storage_path&order=created_at.desc`
      );
      return json(res, 200, { contributions: rows });
    }

    if (req.method === 'POST') {
      const auth = await requireUser(req);
      if (auth.error) return json(res, auth.error.status, auth.error.body);
      const action = req.body?.action || 'submit';
      if (action === 'review') {
        const admin = await requireAdmin(req);
        if (admin.error) return json(res, admin.error.status, admin.error.body);
        const id = String(req.body?.contribution_id || '');
        const decision = String(req.body?.decision || '');
        if (!id || !['approve', 'reject'].includes(decision)) {
          return json(res, 400, { error: 'Choose approve or reject.' });
        }
        const [updated] = await supabase(`listing_photo_contributions?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            status: decision === 'approve' ? 'approved' : 'rejected',
            reviewed_by: admin.user.id,
            reviewed_at: new Date().toISOString()
          })
        });
        return json(res, 200, { contribution: updated });
      }

      const listingId = String(req.body?.listing_id || '').trim();
      const mime = String(req.body?.mime || '').trim();
      const dataUrl = String(req.body?.data_url || '');
      const caption = cleanText(req.body?.caption, 300);
      if (!listingId || !ALLOWED.has(mime) || !dataUrl.startsWith('data:')) {
        return json(res, 400, { error: 'Provide a JPEG, PNG, or WebP photo under 5 MB.' });
      }
      const [listing] = await supabase(
        `listings?id=eq.${encodeURIComponent(listingId)}&select=id,status`
      );
      if (!listing || listing.status !== 'approved') {
        return json(res, 404, { error: 'Contributions are only accepted for approved listings.' });
      }
      const base64 = dataUrl.split(',')[1] || '';
      const buffer = Buffer.from(base64, 'base64');
      if (!buffer.length || buffer.length > MAX_BYTES) {
        return json(res, 400, { error: 'Photo must be under 5 MB.' });
      }
      const id = randomUUID();
      const path = `${auth.user.id}/${listingId}/${id}.${extForMime(mime)}`;
      await storageUpload(BUCKET, path, buffer, mime);
      const [row] = await supabase('listing_photo_contributions', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          id,
          listing_id: listingId,
          contributor_id: auth.user.id,
          storage_path: path,
          caption,
          status: 'pending'
        })
      });
      return json(res, 201, { contribution: row });
    }

    return json(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    const missing = /listing_photo_contributions|player-contributions|schema cache|does not exist/i.test(
      error.message || ''
    );
    return json(res, missing ? 503 : 500, {
      error: missing
        ? 'Photo contributions are not ready yet. Run 13-photo-contributions-migration.sql in Supabase, then try again.'
        : error.message || 'Photo contribution service failed.'
    });
  }
}

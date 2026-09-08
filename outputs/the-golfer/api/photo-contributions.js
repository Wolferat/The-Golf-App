import { randomUUID } from 'node:crypto';
import { json, requireUser, requireAdmin, supabase, storageUpload, storageSignedUrl, storageRemove } from '../lib/admin.js';
import { cleanText } from '../lib/listings.js';
import {
  CONTRIBUTION_BUCKET,
  decodeDataUrl,
  normalizeContributionPhoto
} from '../lib/contribution-photos.js';
import { assertSocialAllowed } from '../lib/moderation.js';

async function contributionPreview(row) {
  if (!row?.storage_path) return null;
  return storageSignedUrl(CONTRIBUTION_BUCKET, row.storage_path, 900);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const auth = await requireUser(req);
      if (auth.error) return json(res, auth.error.status, auth.error.body);
      const view = String(req.query?.view || 'mine');
      if (view === 'admin_queue') {
        const admin = await requireAdmin(req);
        if (admin.error) return json(res, admin.error.status, admin.error.body);
        const status = String(req.query?.status || 'pending');
        const rows = await supabase(
          `listing_photo_contributions?status=eq.${encodeURIComponent(status)}&select=id,listing_id,contributor_id,storage_path,caption,status,created_at,reviewed_by,reviewed_at&order=created_at.asc&limit=100`
        );
        const enriched = [];
        for (const row of rows) {
          enriched.push({
            ...row,
            preview_url: await contributionPreview(row)
          });
        }
        return json(res, 200, { contributions: enriched });
      }
      const listingId = String(req.query?.listing_id || '').trim();
      const filter = listingId ? `&listing_id=eq.${encodeURIComponent(listingId)}` : '';
      const rows = await supabase(
        `listing_photo_contributions?contributor_id=eq.${auth.user.id}${filter}&select=id,listing_id,status,caption,created_at,storage_path,reviewed_at&order=created_at.desc`
      );
      const contributions = [];
      for (const row of rows) {
        contributions.push({
          id: row.id,
          listing_id: row.listing_id,
          status: row.status,
          caption: row.caption,
          created_at: row.created_at,
          reviewed_at: row.reviewed_at,
          preview_url: row.status === 'removed' ? null : await contributionPreview(row)
        });
      }
      return json(res, 200, { contributions });
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
        if (!id || !['approve', 'reject', 'remove'].includes(decision)) {
          return json(res, 400, { error: 'Choose approve, reject, or remove.' });
        }
        const status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'removed';
        const [updated] = await supabase(`listing_photo_contributions?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            status,
            reviewed_by: admin.user.id,
            reviewed_at: new Date().toISOString()
          })
        });
        if (status === 'removed' && updated?.storage_path) {
          await storageRemove(CONTRIBUTION_BUCKET, updated.storage_path);
        }
        return json(res, 200, {
          contribution: {
            ...updated,
            preview_url: status === 'removed' ? null : await contributionPreview(updated)
          }
        });
      }

      const listingId = String(req.body?.listing_id || '').trim();
      const caption = cleanText(req.body?.caption, 300);
      const dataUrl = String(req.body?.data_url || '');
      if (!listingId || !dataUrl.startsWith('data:')) {
        return json(res, 400, { error: 'Provide a JPEG, PNG, or WebP photo under 5 MB.' });
      }
      const [profile] = await supabase(
        `profiles?id=eq.${auth.user.id}&select=id,account_restricted,account_restriction_reason`
      );
      const restriction = assertSocialAllowed(profile || {});
      if (!restriction.allowed) {
        return json(res, 403, { error: 'Your account is restricted.', reason: restriction.reason });
      }
      const [listing] = await supabase(
        `listings?id=eq.${encodeURIComponent(listingId)}&select=id,status`
      );
      if (!listing || listing.status !== 'approved') {
        return json(res, 404, { error: 'Contributions are only accepted for approved listings.' });
      }

      const { buffer: rawBuffer } = decodeDataUrl(dataUrl);
      const normalized = await normalizeContributionPhoto(rawBuffer);
      const id = randomUUID();
      const path = `${auth.user.id}/${listingId}/${id}.${normalized.ext}`;

      try {
        await storageUpload(CONTRIBUTION_BUCKET, path, normalized.buffer, normalized.mime);
      } catch (error) {
        return json(res, error.status || 500, { error: error.message || 'Could not store that photo.' });
      }

      try {
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
        return json(res, 201, {
          contribution: {
            ...row,
            preview_url: await contributionPreview(row)
          }
        });
      } catch (error) {
        await storageRemove(CONTRIBUTION_BUCKET, path);
        throw error;
      }
    }

    return json(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    const missing = /listing_photo_contributions|player-contributions|schema cache|does not exist/i.test(
      error.message || ''
    );
    return json(res, error.status || (missing ? 503 : 500), {
      error: missing
        ? 'Photo contributions are not ready yet. Run 13-photo-contributions-migration.sql in Supabase, then try again.'
        : error.message || 'Photo contribution service failed.'
    });
  }
}

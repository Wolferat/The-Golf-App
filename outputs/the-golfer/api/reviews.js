import { json, requireAdmin, requireUser, supabase, writeAudit, storageUpload, storageSignedUrl, storageRemove } from '../lib/admin.js';
import {
  REVIEW_PHOTO_BUCKET,
  ADMIN_REVIEW_ACTIONS,
  canModerateCommunity,
  canReviewListing,
  cleanReviewInput,
  decodeReviewPhoto,
  publicReview
} from '../lib/reviews.js';

const REVIEW_SELECT = 'id,listing_id,player_id,rating,title,body,visited_on,photo_path,photo_status,status,created_at,updated_at';

async function loadListing(id) {
  const [listing] = await supabase(
    `listings?id=eq.${encodeURIComponent(id)}&select=id,title,kind,status,official_website,source_url`
  );
  return listing || null;
}

async function attachProfiles(rows) {
  const ids = [...new Set((rows || []).map((row) => row.player_id).filter(Boolean))];
  if (!ids.length) return rows || [];
  const profiles = await supabase(
    `profiles?id=in.(${ids.join(',')})&select=id,username,avatar`
  );
  const byId = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  return (rows || []).map((row) => ({
    ...row,
    username: byId[row.player_id]?.username || 'Golfolio player',
    avatar: byId[row.player_id]?.avatar || byId[row.player_id]?.username || 'G'
  }));
}

async function attachListings(rows) {
  const ids = [...new Set((rows || []).map((row) => row.listing_id).filter(Boolean))];
  if (!ids.length) return rows || [];
  const listings = await supabase(`listings?id=in.(${ids.join(',')})&select=id,title,kind,city`);
  const byId = Object.fromEntries((listings || []).map((row) => [row.id, row]));
  return (rows || []).map((row) => ({
    ...row,
    listing_title: byId[row.listing_id]?.title || 'Listing',
    listing_kind: byId[row.listing_id]?.kind || null
  }));
}

async function withPhotoUrls(rows, { viewerId = null, admin = false } = {}) {
  const out = [];
  for (const row of rows || []) {
    const includePrivate = admin || row.player_id === viewerId;
    const publicApproved = row.status === 'approved' && row.photo_status === 'approved';
    let photoUrl = null;
    if (row.photo_path && (publicApproved || includePrivate)) {
      photoUrl = await storageSignedUrl(REVIEW_PHOTO_BUCKET, row.photo_path);
    }
    out.push(publicReview(row, { includePrivate, photoUrl, viewerId }));
  }
  return out;
}

async function savePhoto(review, playerId, payload) {
  const photo = decodeReviewPhoto(payload);
  if (!photo) return review;
  const path = `${playerId}/${review.id}.${photo.ext}`;
  await storageUpload(REVIEW_PHOTO_BUCKET, path, photo.buffer, photo.mime);
  if (review.photo_path && review.photo_path !== path) await storageRemove(REVIEW_PHOTO_BUCKET, review.photo_path);
  const [updated] = await supabase(`listing_reviews?id=eq.${encodeURIComponent(review.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      photo_path: path,
      photo_status: 'pending',
      photo_reviewed_by: null,
      photo_reviewed_at: null
    })
  });
  return updated || review;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const view = String(req.query.view || '').trim();
      if (view === 'pending') {
        const auth = await requireAdmin(req);
        if (auth.error) return json(res, auth.error.status, auth.error.body);
        const reviews = await supabase(
          `listing_reviews?or=(status.eq.pending,photo_status.eq.pending)&select=${REVIEW_SELECT}&order=created_at.desc&limit=100`
        );
        const withPeople = await attachListings(await attachProfiles(reviews));
        return json(res, 200, { reviews: await withPhotoUrls(withPeople, { admin: true, viewerId: auth.profile.id }) });
      }

      const auth = await requireUser(req);
      if (auth.error) return json(res, auth.error.status, { ...auth.error.body, gate: true });
      const listingId = String(req.query.listing_id || req.query.id || '').trim();
      if (!listingId) return json(res, 400, { error: 'Listing id is required.' });
      const listing = await loadListing(listingId);
      if (!listing || listing.status !== 'approved') {
        return json(res, 404, { error: 'That listing is not available.' });
      }

      const viewer = auth.profile;
      const approved = await supabase(
        `listing_reviews?listing_id=eq.${encodeURIComponent(listingId)}&status=eq.approved&select=${REVIEW_SELECT}&order=created_at.desc&limit=50`
      );
      let mine = [];
      if (viewer) {
        mine = await supabase(
          `listing_reviews?listing_id=eq.${encodeURIComponent(listingId)}&player_id=eq.${viewer.id}&select=${REVIEW_SELECT}`
        );
      }
      const combined = [...mine.filter((row) => row.status !== 'approved'), ...approved];
      const withPeople = await attachProfiles(combined);
      const ratings = (approved || []).map((row) => Number(row.rating)).filter((n) => n >= 1 && n <= 5);
      const average = ratings.length
        ? Math.round((ratings.reduce((sum, n) => sum + n, 0) / ratings.length) * 10) / 10
        : null;
      return json(res, 200, {
        listing_id: listingId,
        reviewable: canReviewListing(listing),
        average,
        count: ratings.length,
        mine: mine[0] ? (await withPhotoUrls(await attachProfiles(mine), { viewerId: viewer.id }))[0] : null,
        reviews: await withPhotoUrls(withPeople.filter((row) => row.status === 'approved' || row.player_id === viewer?.id), {
          viewerId: viewer?.id
        })
      });
    }

    if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'DELETE') {
      return json(res, 405, { error: 'Method not allowed.' });
    }

    const action = req.body?.action || (req.method === 'DELETE' ? 'delete' : 'create');

    if (ADMIN_REVIEW_ACTIONS.includes(action)) {
      const auth = await requireAdmin(req);
      if (auth.error) return json(res, auth.error.status, auth.error.body);
      if (!canModerateCommunity(auth.profile)) {
        return json(res, 403, { error: 'Admin access required.' });
      }
      const id = String(req.body?.id || '').trim();
      const [review] = await supabase(`listing_reviews?id=eq.${encodeURIComponent(id)}&select=${REVIEW_SELECT}`);
      if (!review) return json(res, 404, { error: 'Review not found.' });
      if (action === 'approve') {
        const listing = await loadListing(review.listing_id);
        if (!canReviewListing(listing)) {
          return json(res, 400, {
            error: 'This listing cannot have public reviews. Event and expired listings stay unreviewed.'
          });
        }
      }
      const now = new Date().toISOString();
      const patch =
        action === 'approve'
          ? { status: 'approved', reviewed_by: auth.profile.id, reviewed_at: now }
          : action === 'reject'
            ? { status: 'rejected', reviewed_by: auth.profile.id, reviewed_at: now }
            : action === 'approve_photo'
              ? { photo_status: 'approved', photo_reviewed_by: auth.profile.id, photo_reviewed_at: now }
              : { photo_status: 'rejected', photo_reviewed_by: auth.profile.id, photo_reviewed_at: now };
      if ((action === 'approve_photo' || action === 'reject_photo') && !review.photo_path) {
        return json(res, 400, { error: 'This review has no attached photo.' });
      }
      const [updated] = await supabase(`listing_reviews?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch)
      });
      await writeAudit({
        listingId: review.listing_id,
        action: `review_${action}`,
        actorId: auth.profile.id,
        details: { review_id: id }
      });
      return json(res, 200, { review: updated, ok: true });
    }

    const auth = await requireUser(req);
    if (auth.error) return json(res, auth.error.status, auth.error.body);
    if (ADMIN_REVIEW_ACTIONS.includes(action) || action === 'find') {
      return json(res, 403, { error: 'Admin access required.' });
    }

    if (action === 'create') {
      const listingId = String(req.body?.listing_id || '').trim();
      const listing = await loadListing(listingId);
      if (!canReviewListing(listing)) {
        return json(res, 400, {
          error: 'Reviews are only for approved courses and simulators. Event listings cannot be reviewed.'
        });
      }
      const fields = cleanReviewInput(req.body);
      const existing = await supabase(
        `listing_reviews?listing_id=eq.${encodeURIComponent(listingId)}&player_id=eq.${auth.profile.id}&select=id`
      );
      if (existing[0]) {
        return json(res, 409, { error: 'You already reviewed this venue. You can edit your existing review.' });
      }
      const [created] = await supabase('listing_reviews', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          listing_id: listingId,
          player_id: auth.profile.id,
          ...fields,
          status: 'pending',
          photo_status: null
        })
      });
      const withPhoto = req.body?.photo ? await savePhoto(created, auth.profile.id, req.body) : created;
      await writeAudit({
        listingId,
        action: 'review_create',
        actorId: auth.profile.id,
        details: { review_id: withPhoto.id }
      });
      const [shaped] = await withPhotoUrls(await attachProfiles([withPhoto]), { viewerId: auth.profile.id });
      return json(res, 201, {
        review: shaped,
        message: 'Review submitted for admin approval. It will not appear publicly until approved.'
      });
    }

    const id = String(req.body?.id || req.query.id || '').trim();
    const [current] = await supabase(`listing_reviews?id=eq.${encodeURIComponent(id)}&select=${REVIEW_SELECT}`);
    if (!current) return json(res, 404, { error: 'Review not found.' });
    if (current.player_id !== auth.profile.id) return json(res, 403, { error: 'You can only change your own review.' });

    if (action === 'delete') {
      if (current.photo_path) await storageRemove(REVIEW_PHOTO_BUCKET, current.photo_path);
      await supabase(`listing_reviews?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      await writeAudit({
        listingId: current.listing_id,
        action: 'review_delete',
        actorId: auth.profile.id,
        details: { review_id: id }
      });
      return json(res, 200, { ok: true });
    }

    if (action === 'update' || action === 'photo') {
      const listing = await loadListing(current.listing_id);
      if (!canReviewListing(listing)) {
        return json(res, 400, {
          error: 'Reviews are only for approved courses and simulators. Event listings cannot be reviewed.'
        });
      }
      let next = current;
      if (action === 'update') {
        const fields = cleanReviewInput(req.body);
        const [updated] = await supabase(`listing_reviews?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            ...fields,
            status: 'pending',
            reviewed_by: null,
            reviewed_at: null
          })
        });
        next = updated || current;
      }
      if (req.body?.photo || action === 'photo') {
        next = await savePhoto(next, auth.profile.id, req.body);
        const [reset] = await supabase(`listing_reviews?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ status: 'pending', reviewed_by: null, reviewed_at: null })
        });
        next = reset || next;
      }
      const [shaped] = await withPhotoUrls(await attachProfiles([next]), { viewerId: auth.profile.id });
      return json(res, 200, {
        review: shaped,
        message: 'Your review was updated and sent back to admin approval.'
      });
    }

    return json(res, 400, { error: 'Unknown review action.' });
  } catch (error) {
    const missing = /listing_reviews|schema cache|does not exist/i.test(error.message || '');
    return json(
      res,
      error.status || (missing ? 503 : 500),
      {
        error: missing
          ? 'Venue reviews are not ready yet. Run venue-community-migration.sql in Supabase, then try again.'
          : error.message || 'Review request failed.'
      }
    );
  }
}

import { json, requireAdmin, requireUser, supabase, writeAudit } from '../lib/admin.js';
import { runListingAi } from '../lib/ai.js';
import { isHttpUrl, cleanText } from '../lib/listings.js';
import {
  REVIEWABLE_KINDS,
  OFFICIAL_VENUE_PHOTO_MAX,
  ADMIN_VENUE_PHOTO_ACTIONS,
  BACKFILL_VENUE_PHOTO_ACTION,
  canModerateCommunity,
  canReceiveOfficialVenuePhotos,
  canReviewListing
} from '../lib/reviews.js';
import { verifyOfficialVenuePhoto } from '../lib/official-photos.js';

const PHOTO_SELECT = 'id,listing_id,image_url,source_url,source_name,status,created_at,reviewed_at';

const VENUE_PHOTO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['photos'],
  properties: {
    photos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['url', 'source_url', 'source_name'],
        properties: {
          url: { type: ['string', 'null'] },
          source_url: { type: ['string', 'null'] },
          source_name: { type: ['string', 'null'] }
        }
      }
    }
  }
};

async function loadListing(id) {
  const [listing] = await supabase(
    `listings?id=eq.${encodeURIComponent(id)}&select=id,title,kind,status,official_website,source_url,source_name,venue_name,city`
  );
  return listing || null;
}

function publicPhoto(row) {
  return {
    id: row.id,
    listing_id: row.listing_id,
    listing_title: row.listing_title || null,
    listing_kind: row.listing_kind || null,
    image_url: row.image_url,
    source_url: row.source_url,
    source_name: row.source_name || 'Official venue website',
    status: row.status,
    created_at: row.created_at
  };
}

async function approvedPhotoCount(listingId) {
  const rows = await supabase(
    `venue_photos?listing_id=eq.${encodeURIComponent(listingId)}&status=eq.approved&select=id`
  );
  return (rows || []).length;
}

function photoSearchPrompt(listing) {
  const official = listing.official_website;
  return `Find up to three existing photograph URLs that appear on this venue's own official website.
Venue JSON: ${JSON.stringify({
    title: listing.title,
    kind: listing.kind,
    city: listing.city,
    venue_name: listing.venue_name,
    official_website: listing.official_website
  })}

Return JSON only. Rules:
- source_url must be a page on the venue's official website (${official}) or a subdomain of that official site.
- The image file may be hosted on that official domain/subdomain, or on a legitimate site-builder/CDN used by that official page (for example Wix, Squarespace, or Cloudflare), but only if that official page actually references the image.
- Never use Google, Bing, map tiles, directories, review platforms, social-media posts, news articles, stock-photo sites, or any other unrelated third-party image host.
- Do not generate, download, copy, or re-host images. Return the remote image URL as it exists.
- Every item needs url (the image file), source_url (the official website page that displays it), and source_name.
- If you cannot verify an official-page image, return [].
- Do not publish anything. These are private proposals for admin review.`;
}

// Shared discovery for both the manual `find` action and the one-time admin
// backfill. Every candidate still passes verifyOfficialVenuePhoto; autoApprove
// only decides the stored status, never whether a photo is trusted.
async function discoverOfficialPhotos({ listing, adminId, autoApprove = false, remainingSlots }) {
  const parsed = await runListingAi({
    adminId,
    schemaName: 'official_venue_photos',
    schema: VENUE_PHOTO_SCHEMA,
    input: photoSearchPrompt(listing)
  });
  const existing = await supabase(
    `venue_photos?listing_id=eq.${encodeURIComponent(listing.id)}&select=image_url`
  );
  const have = new Set((existing || []).map((row) => row.image_url));
  const limit = Math.max(0, Math.min(OFFICIAL_VENUE_PHOTO_MAX, remainingSlots ?? OFFICIAL_VENUE_PHOTO_MAX));
  const saved = [];
  const omitted = [];
  const pageCache = new Map();
  const reviewedAt = new Date().toISOString();
  for (const photo of parsed.photos || []) {
    if (saved.length >= limit) break;
    const image_url = isHttpUrl(photo?.url) ? photo.url : null;
    const source_url = isHttpUrl(photo?.source_url) ? photo.source_url : listing.official_website;
    const source_name = cleanText(photo?.source_name, 160) || 'Official venue website';
    if (!image_url || have.has(image_url)) {
      omitted.push({ url: photo?.url || null, reason: 'missing_or_duplicate' });
      continue;
    }
    let verified;
    try {
      verified = await verifyOfficialVenuePhoto({ imageUrl: image_url, sourceUrl: source_url, listing, pageCache });
    } catch {
      omitted.push({ url: image_url, source_url, reason: 'verification_failed' });
      continue;
    }
    if (!verified.ok) {
      omitted.push({ url: image_url, source_url, reason: verified.reason || 'not_official_domain' });
      continue;
    }
    const [row] = await supabase('venue_photos', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        listing_id: listing.id,
        image_url,
        source_url,
        source_name,
        status: autoApprove ? 'approved' : 'pending',
        created_by: adminId,
        ...(autoApprove ? { reviewed_by: adminId, reviewed_at: reviewedAt } : {})
      })
    });
    if (row) {
      saved.push(publicPhoto(row));
      have.add(image_url);
    }
  }
  return { saved, omitted };
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

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const listingId = String(req.query.listing_id || req.query.id || '').trim();
      const view = String(req.query.view || '');
      if (view === 'backfill_targets') {
        const auth = await requireAdmin(req);
        if (auth.error) return json(res, auth.error.status, auth.error.body);
        const listings = await supabase(
          'listings?status=eq.approved&select=id,title,kind,official_website&order=created_at.asc&limit=500'
        );
        const eligible = (listings || []).filter((row) =>
          canReceiveOfficialVenuePhotos({ ...row, status: 'approved' })
        );
        const approvedPhotos = eligible.length
          ? await supabase(
              `venue_photos?status=eq.approved&listing_id=in.(${eligible.map((row) => row.id).join(',')})&select=listing_id`
            )
          : [];
        const counts = {};
        for (const row of approvedPhotos || []) {
          counts[row.listing_id] = (counts[row.listing_id] || 0) + 1;
        }
        return json(res, 200, {
          listings: eligible.map((row) => ({
            id: row.id,
            title: row.title,
            kind: row.kind,
            approved_photos: counts[row.id] || 0,
            full: (counts[row.id] || 0) >= OFFICIAL_VENUE_PHOTO_MAX
          })),
          max_per_listing: OFFICIAL_VENUE_PHOTO_MAX
        });
      }
      const pending = view === 'pending' || req.query.pending === '1';
      if (pending && !listingId) {
        const auth = await requireAdmin(req);
        if (auth.error) return json(res, auth.error.status, auth.error.body);
        const photos = await supabase(
          `venue_photos?status=eq.pending&select=${PHOTO_SELECT}&order=created_at.desc&limit=100`
        );
        return json(res, 200, { photos: (await attachListings(photos || [])).map(publicPhoto) });
      }
      if (pending) {
        const auth = await requireAdmin(req);
        if (auth.error) return json(res, auth.error.status, auth.error.body);
      } else {
        const auth = await requireUser(req);
        if (auth.error) return json(res, auth.error.status, { ...auth.error.body, gate: true });
      }
      if (!listingId) return json(res, 400, { error: 'Listing id is required.' });
      const listing = await loadListing(listingId);
      if (!listing || listing.status !== 'approved') {
        return json(res, 404, { error: 'That listing is not available.' });
      }
      const filter = pending
        ? `listing_id=eq.${encodeURIComponent(listingId)}`
        : `listing_id=eq.${encodeURIComponent(listingId)}&status=eq.approved`;
      const photos = await supabase(
        `venue_photos?${filter}&select=${PHOTO_SELECT}&order=created_at.desc&limit=20`
      );
      const visible = pending ? photos : (photos || []).slice(0, OFFICIAL_VENUE_PHOTO_MAX);
      return json(res, 200, { photos: (visible || []).map(publicPhoto), listing_id: listingId });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
    const auth = await requireAdmin(req);
    if (auth.error) return json(res, auth.error.status, auth.error.body);
    if (!canModerateCommunity(auth.profile)) return json(res, 403, { error: 'Admin access required.' });
    if (!ADMIN_VENUE_PHOTO_ACTIONS.includes(req.body?.action)) {
      return json(res, 400, { error: 'Unknown venue photo action.' });
    }

    const action = req.body?.action;
    const listingId = String(req.body?.listing_id || req.body?.id || '').trim();

    if (action === 'find') {
      const listing = await loadListing(listingId);
      if (!canReviewListing(listing) || !REVIEWABLE_KINDS.includes(listing.kind)) {
        return json(res, 400, { error: 'Official venue photos are only for approved courses and simulators.' });
      }
      if (!isHttpUrl(listing.official_website)) {
        return json(res, 400, { error: 'This listing needs an official website before photos can be found.' });
      }
      const { saved, omitted } = await discoverOfficialPhotos({
        listing,
        adminId: auth.profile.id,
        autoApprove: false
      });
      await writeAudit({
        listingId: listing.id,
        action: 'venue_photo_find',
        actorId: auth.profile.id,
        details: { saved: saved.length, omitted: omitted.length }
      });
      return json(res, 200, {
        photos: saved,
        omitted,
        message: saved.length
          ? 'Official photo leads were saved as pending. They are not public until you approve them.'
          : 'No official venue photos could be verified on the venue website. Nothing was published.'
      });
    }

    if (action === BACKFILL_VENUE_PHOTO_ACTION) {
      const listing = await loadListing(listingId);
      if (!canReceiveOfficialVenuePhotos(listing)) {
        return json(res, 200, {
          listing_id: listingId,
          skipped: true,
          reason: 'no_official_website',
          approved: 0,
          message: 'Skipped: this listing is not approved or has no official website.'
        });
      }
      const already = await approvedPhotoCount(listing.id);
      if (already >= OFFICIAL_VENUE_PHOTO_MAX) {
        return json(res, 200, {
          listing_id: listing.id,
          skipped: true,
          reason: 'already_full',
          approved: 0,
          message: `Skipped: this listing already has ${OFFICIAL_VENUE_PHOTO_MAX} approved official photos.`
        });
      }
      const { saved, omitted } = await discoverOfficialPhotos({
        listing,
        adminId: auth.profile.id,
        autoApprove: true,
        remainingSlots: OFFICIAL_VENUE_PHOTO_MAX - already
      });
      await writeAudit({
        listingId: listing.id,
        action: 'venue_photo_backfill_autoapprove',
        actorId: auth.profile.id,
        details: { approved: saved.length, omitted: omitted.length, already }
      });
      return json(res, 200, {
        listing_id: listing.id,
        photos: saved,
        omitted,
        approved: saved.length,
        skipped: saved.length === 0,
        reason: saved.length ? null : 'no_verified_official_photo',
        message: saved.length
          ? `Approved ${saved.length} verified official photo${saved.length === 1 ? '' : 's'} from the venue website.`
          : 'Skipped: no photo could be verified on this venue’s official website.'
      });
    }

    const id = String(req.body?.photo_id || req.body?.id || '').trim();
    const [photo] = await supabase(`venue_photos?id=eq.${encodeURIComponent(id)}&select=${PHOTO_SELECT}`);
    if (!photo) return json(res, 404, { error: 'Venue photo not found.' });

    if (action === 'approve') {
      const approved = await supabase(
        `venue_photos?listing_id=eq.${encodeURIComponent(photo.listing_id)}&status=eq.approved&select=id`
      );
      if ((approved || []).length >= OFFICIAL_VENUE_PHOTO_MAX) {
        return json(res, 409, {
          error: `This listing already has ${OFFICIAL_VENUE_PHOTO_MAX} approved official photos.`
        });
      }
      const listing = await loadListing(photo.listing_id);
      let verified;
      try {
        verified = await verifyOfficialVenuePhoto({
          imageUrl: photo.image_url,
          sourceUrl: photo.source_url,
          listing
        });
      } catch {
        verified = { ok: false };
      }
      if (!verified.ok) {
        return json(res, 400, { error: 'That photo is not verified on the venue’s official website.' });
      }
      const [updated] = await supabase(`venue_photos?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          status: 'approved',
          reviewed_by: auth.profile.id,
          reviewed_at: new Date().toISOString()
        })
      });
      await writeAudit({
        listingId: photo.listing_id,
        action: 'venue_photo_approve',
        actorId: auth.profile.id,
        details: { photo_id: id }
      });
      return json(res, 200, { photo: publicPhoto(updated), ok: true });
    }

    if (action === 'reject' || action === 'remove') {
      if (action === 'reject') {
        const [updated] = await supabase(`venue_photos?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            status: 'rejected',
            reviewed_by: auth.profile.id,
            reviewed_at: new Date().toISOString()
          })
        });
        await writeAudit({
          listingId: photo.listing_id,
          action: 'venue_photo_reject',
          actorId: auth.profile.id,
          details: { photo_id: id }
        });
        return json(res, 200, { photo: publicPhoto(updated), ok: true });
      }
      await supabase(`venue_photos?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      await writeAudit({
        listingId: photo.listing_id,
        action: 'venue_photo_remove',
        actorId: auth.profile.id,
        details: { photo_id: id }
      });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'Unknown venue photo action.' });
  } catch (error) {
    const missing = /venue_photos|schema cache|does not exist/i.test(error.message || '');
    return json(
      res,
      error.status || (missing ? 503 : 500),
      {
        error: missing
          ? 'Official venue photos are not ready yet. Run venue-community-migration.sql in Supabase, then try again.'
          : error.message || 'Venue photo request failed.'
      }
    );
  }
}

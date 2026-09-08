import { json, requireUser, supabase } from '../lib/admin.js';
import { publicListing } from '../lib/listings.js';

export default async function handler(req, res) {
  try {
    const auth = await requireUser(req);
    if (auth.error) return json(res, auth.error.status, auth.error.body);

    if (req.method === 'GET') {
      const rows = await supabase(
        `saved_listings?user_id=eq.${auth.user.id}&select=listing_id,created_at&order=created_at.desc`
      );
      if (!rows.length) return json(res, 200, { saved: [] });
      const ids = rows.map((row) => row.listing_id);
      const listings = await supabase(
        `listings?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,title,kind,city,status,starts_at,price_note,latitude,longitude,archived_at,deleted_at`
      );
      const byId = new Map(listings.map((row) => [row.id, row]));
      const saved = rows.map((row) => {
        const listing = byId.get(row.listing_id);
        if (!listing || listing.status !== 'approved' || listing.deleted_at) {
          return {
            listing_id: row.listing_id,
            created_at: row.created_at,
            available: false,
            reason: listing?.deleted_at ? 'deleted' : listing?.archived_at ? 'archived' : 'unavailable'
          };
        }
        return {
          listing_id: row.listing_id,
          created_at: row.created_at,
          available: true,
          listing: publicListing(listing)
        };
      });
      return json(res, 200, { saved });
    }

    if (req.method === 'POST') {
      const listingId = String(req.body?.listing_id || '').trim();
      if (!listingId) return json(res, 400, { error: 'Listing id is required.' });
      const [listing] = await supabase(
        `listings?id=eq.${encodeURIComponent(listingId)}&select=id,status,deleted_at`
      );
      if (!listing || listing.status !== 'approved' || listing.deleted_at) {
        return json(res, 404, { error: 'That listing is not available to save.' });
      }
      const [row] = await supabase('saved_listings', {
        method: 'POST',
        headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify({ user_id: auth.user.id, listing_id: listingId })
      });
      return json(res, 201, { saved: row });
    }

    if (req.method === 'DELETE') {
      const listingId = String(req.query?.listing_id || req.body?.listing_id || '').trim();
      if (!listingId) return json(res, 400, { error: 'Listing id is required.' });
      await supabase(
        `saved_listings?user_id=eq.${auth.user.id}&listing_id=eq.${encodeURIComponent(listingId)}`,
        { method: 'DELETE' }
      );
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    const missing = /saved_listings|schema cache|does not exist/i.test(error.message || '');
    return json(res, missing ? 503 : 500, {
      error: missing
        ? 'Saved listings are not ready yet. Run 10-saved-listings-migration.sql in Supabase, then try again.'
        : error.message || 'Saved listings service failed.'
    });
  }
}

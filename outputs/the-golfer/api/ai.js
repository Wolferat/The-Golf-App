import { json, requireAdmin, supabase, writeAudit } from '../lib/admin.js';
import { runListingAi, LAUNCH_AREA, PENDING_QUEUE_MAX } from '../lib/ai.js';
import { KINDS, leadToListing } from '../lib/listings.js';

const SEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['leads'],
  properties: {
    leads: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title','kind','city','venue_name','starts_at','ends_at','price_note',
          'official_website','registration_url','phone','source_name','source_url',
          'description','relevance_note','missing_note','confidence'
        ],
        properties: {
          title: { type: ['string', 'null'] },
          kind: { type: ['string', 'null'] },
          city: { type: ['string', 'null'] },
          venue_name: { type: ['string', 'null'] },
          starts_at: { type: ['string', 'null'] },
          ends_at: { type: ['string', 'null'] },
          price_note: { type: ['string', 'null'] },
          official_website: { type: ['string', 'null'] },
          registration_url: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] },
          source_name: { type: ['string', 'null'] },
          source_url: { type: ['string', 'null'] },
          description: { type: ['string', 'null'] },
          relevance_note: { type: ['string', 'null'] },
          missing_note: { type: ['string', 'null'] },
          confidence: { type: ['string', 'null'] }
        }
      }
    }
  }
};

const RESEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['fields', 'photos', 'reviews'],
  properties: {
    fields: {
      type: 'object',
      additionalProperties: false,
      required: [
        'title','description','venue_name','city','address','phone','official_website',
        'registration_url','source_url','source_name','price_note','starts_at','ends_at'
      ],
      properties: Object.fromEntries([
        'title','description','venue_name','city','address','phone','official_website',
        'registration_url','source_url','source_name','price_note','starts_at','ends_at'
      ].map((name) => [name, {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['value', 'source_name', 'source_url', 'evidence'],
        properties: {
          value: { type: ['string', 'null'] },
          source_name: { type: ['string', 'null'] },
          source_url: { type: ['string', 'null'] },
          evidence: { type: ['string', 'null'] }
        }
      }]))
    },
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
    },
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['excerpt', 'source_name', 'source_url'],
        properties: {
          excerpt: { type: ['string', 'null'] },
          source_name: { type: ['string', 'null'] },
          source_url: { type: ['string', 'null'] }
        }
      }
    }
  }
};

async function pendingCount() {
  const rows = await supabase('listings?status=eq.pending&select=id');
  return Array.isArray(rows) ? rows.length : 0;
}

async function companyAiFlags() {
  const rows = await supabase(
    'app_settings?id=eq.true&select=ai_manual_search_enabled,ai_research_enabled,pending_queue_max,admin_approval_required'
  );
  const row = rows[0] || {};
  return {
    ai_manual_search_enabled: Boolean(row.ai_manual_search_enabled),
    ai_research_enabled: Boolean(row.ai_research_enabled),
    pending_queue_max: Math.min(Number(row.pending_queue_max || PENDING_QUEUE_MAX), PENDING_QUEUE_MAX),
    admin_approval_required: true
  };
}

export default async function handler(req, res) {
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return json(res, auth.error.status, auth.error.body);
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

    const action = req.body?.action;
    const flags = await companyAiFlags();
    const pending = await pendingCount();

    if (action === 'search') {
      if (pending >= flags.pending_queue_max) {
        return json(res, 409, {
          error: `The pending-review queue is at its ${flags.pending_queue_max} listing maximum. Approve or reject existing leads before searching for more. Research on existing listings is still available.`,
          pendingCount: pending,
          pendingMax: flags.pending_queue_max
        });
      }
      if (!flags.ai_manual_search_enabled) {
        return json(res, 403, { error: 'Manual AI listing search is turned off in Company Settings.' });
      }
      const query = String(req.body?.query || '').trim();
      if (query.length < 8) return json(res, 400, { error: 'Enter a more specific search, at least 8 characters.' });
      const parsed = await runListingAi({
        adminId: auth.profile.id,
        schemaName: 'listing_leads',
        schema: SEARCH_SCHEMA,
        input: `Search for public golf listings ${LAUNCH_AREA}. Admin search: ${query}

Return JSON only. Rules:
- Stay inside the launch boundary unless the query is clearly outside, in which case return no leads.
- Prefer official organizer, course, venue, or registration websites.
- Exclude professional tour events unless the official organizer page is used and the listing only links out.
- Never invent titles, prices, phones, websites, dates, or quotes. Use null when unknown.
- Every factual value must include source_url and source_name.
- kind must be one of: ${KINDS.join(', ')}.
- Do not publish anything. These are private leads for admin review.`
      });
      const leads = (parsed.leads || []).filter((x) => x?.title && x?.source_url);
      const [proposal] = await supabase('listing_proposals', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          kind: 'search',
          status: 'pending',
          query,
          payload: { leads },
          created_by: auth.profile.id
        })
      });
      await writeAudit({
        proposalId: proposal.id,
        action: 'ai_search',
        actorId: auth.profile.id,
        details: { query, count: leads.length }
      });
      return json(res, 200, { proposal, leads, pendingCount: pending, pendingMax: flags.pending_queue_max });
    }

    if (action === 'research') {
      if (!flags.ai_research_enabled) {
        return json(res, 403, { error: 'AI research / refresh is turned off in Company Settings.' });
      }
      const id = String(req.body?.id || '').trim();
      const [listing] = await supabase(`listings?id=eq.${encodeURIComponent(id)}&select=id,title,kind,city,venue_name,source_url,source_name,official_website,status`);
      if (!listing || listing.status === 'deleted') return json(res, 404, { error: 'Listing not found.' });
      const parsed = await runListingAi({
        adminId: auth.profile.id,
        schemaName: 'listing_enrichment',
        schema: RESEARCH_SCHEMA,
        input: `Research and refresh this existing Golfolio listing using official sources ${LAUNCH_AREA}.
Current listing JSON: ${JSON.stringify(listing)}

Return JSON only. Rules:
- Use the existing title, city, kind, venue, and source URL to find better official information.
- Never invent photos, quotes, phones, websites, prices, or dates. Use null when unverified.
- Photos: at most 3 image URLs from official venue/event pages or legitimately reusable sources. Do not generate images.
- Reviews: at most 3 excerpts, max 25 words each, only from sources that clearly allow short quotation. Include source name and URL. If none, return [].
- Every field value must include source_name, source_url, and a short evidence note.
- Do not overwrite public data. This is a private proposal for admin review.`
      });
      const [proposal] = await supabase('listing_proposals', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          listing_id: listing.id,
          kind: 'enrichment',
          status: 'pending',
          query: listing.title,
          payload: parsed,
          created_by: auth.profile.id
        })
      });
      await writeAudit({
        listingId: listing.id,
        proposalId: proposal.id,
        action: 'ai_research',
        actorId: auth.profile.id,
        details: { title: listing.title }
      });
      return json(res, 200, { proposal, listing, pendingCount: pending });
    }

    return json(res, 400, { error: 'Unknown AI action.' });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'AI listing request failed.' });
  }
}

export { leadToListing };

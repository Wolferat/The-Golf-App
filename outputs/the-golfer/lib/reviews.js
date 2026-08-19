import { isHttpUrl, cleanText } from './listings.js';

export const REVIEWABLE_KINDS = ['course', 'simulator'];
export const EVENT_REVIEW_BLOCKED_KINDS = ['tournament', 'training', 'charity', 'corporate'];
export const REVIEW_PHOTO_BUCKET = 'review-photos';
export const REVIEW_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const OFFICIAL_VENUE_PHOTO_MAX = 3;

const BLOCKED_PHOTO_HOSTS = [
  'google.com', 'googleusercontent.com', 'gstatic.com', 'ggpht.com', 'blogspot.com',
  'bing.com', 'yahoo.com', 'duckduckgo.com',
  'yelp.com', 'yelpcdn.com', 'tripadvisor.com', 'tripadvisor.com.mx',
  'facebook.com', 'fbcdn.net', 'instagram.com', 'cdninstagram.com',
  'twitter.com', 'x.com', 'twimg.com', 'pinterest.com', 'pinimg.com',
  'tiktok.com', 'reddit.com', 'redd.it', 'youtube.com', 'ytimg.com',
  'unsplash.com', 'images.unsplash.com', 'shutterstock.com', 'gettyimages.com',
  'flickr.com', 'staticflickr.com', 'wikipedia.org', 'wikimedia.org', 'wikimedia.org',
  'maps.googleapis.com', 'lh3.googleusercontent.com', 'streetviewpixels-pa.googleapis.com',
  'opentable.com', 'foursquare.com', 'timeout.com', 'nextdoor.com'
];

export function hostnameOf(value) {
  try {
    return new URL(String(value)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

export function hostMatchesOfficial(candidateHost, officialHost) {
  if (!candidateHost || !officialHost) return false;
  return candidateHost === officialHost || candidateHost.endsWith('.' + officialHost);
}

export function isBlockedPhotoHost(host) {
  return BLOCKED_PHOTO_HOSTS.some((blocked) => host === blocked || host.endsWith('.' + blocked));
}

export function officialHostsForListing(listing = {}) {
  const officialWebsite = isHttpUrl(listing.official_website) ? listing.official_website : null;
  return officialWebsite ? [hostnameOf(officialWebsite)].filter(Boolean) : [];
}

export function isOfficialVenuePhoto({ imageUrl, sourceUrl, listing }) {
  if (!isHttpUrl(imageUrl) || !isHttpUrl(sourceUrl)) return false;
  const imageHost = hostnameOf(imageUrl);
  const sourceHost = hostnameOf(sourceUrl);
  if (!imageHost || !sourceHost) return false;
  if (isBlockedPhotoHost(imageHost) || isBlockedPhotoHost(sourceHost)) return false;
  const officialHosts = officialHostsForListing(listing);
  if (!officialHosts.length) return false;
  return officialHosts.some((host) => hostMatchesOfficial(imageHost, host) && hostMatchesOfficial(sourceHost, host));
}

export function canReviewListing(listing) {
  if (!listing || listing.status !== 'approved') return false;
  if (!REVIEWABLE_KINDS.includes(listing.kind)) return false;
  if (EVENT_REVIEW_BLOCKED_KINDS.includes(listing.kind)) return false;
  return true;
}

export function canLogRoundAtListing(listing) {
  return canReviewListing(listing);
}

export function canModerateCommunity(profile) {
  return Boolean(profile) && profile.role === 'admin';
}

export const ADMIN_REVIEW_ACTIONS = ['approve', 'reject', 'approve_photo', 'reject_photo'];
export const ADMIN_VENUE_PHOTO_ACTIONS = ['find', 'approve', 'reject', 'remove'];

export function publicReview(row, { includePrivate = false, photoUrl = null, viewerId = null } = {}) {
  if (!row) return null;
  const photoApproved = row.photo_status === 'approved' && row.status === 'approved';
  const showPhoto = photoApproved || (includePrivate && row.photo_path);
  return {
    id: row.id,
    listing_id: row.listing_id,
    listing_title: row.listing_title || null,
    listing_kind: row.listing_kind || null,
    rating: row.rating,
    title: row.title || null,
    body: row.body,
    visited_on: row.visited_on || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    username: row.username || row.profiles?.username || 'Golfolio player',
    avatar: String(row.avatar || row.profiles?.avatar || row.username || 'G').slice(0, 1).toUpperCase(),
    photo_url: showPhoto ? photoUrl : null,
    photo_status: includePrivate ? row.photo_status || null : photoApproved ? 'approved' : null,
    status: includePrivate ? row.status : 'approved',
    mine: Boolean(viewerId && row.player_id === viewerId)
  };
}

export function cleanReviewInput(body = {}) {
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('Choose a rating from 1 to 5.');
  }
  const title = cleanText(body.title, 80);
  const text = cleanText(body.body || body.review, 2000);
  if (!text || text.length < 8) throw new Error('Write a short review, at least 8 characters.');
  let visited_on = null;
  if (body.visited_on) {
    const date = String(body.visited_on).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Visit date must be a valid date.');
    visited_on = date;
  }
  return { rating, title, body: text, visited_on };
}

export function decodeReviewPhoto(payload = {}) {
  const raw = String(payload.photo || payload.data || '').trim();
  if (!raw) return null;
  const match = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
  const mime = match ? match[1].toLowerCase() : String(payload.contentType || payload.type || '').toLowerCase();
  const b64 = match ? match[2] : raw.replace(/\s/g, '');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    throw new Error('Review photos must be JPEG, PNG, or WebP.');
  }
  const buffer = Buffer.from(b64, 'base64');
  if (!buffer.length) throw new Error('That review photo was empty.');
  if (buffer.length > REVIEW_PHOTO_MAX_BYTES) throw new Error('Review photos must be 2 MB or smaller.');
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return { buffer, mime, ext };
}

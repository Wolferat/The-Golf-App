import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  ADMIN_REVIEW_ACTIONS,
  ADMIN_VENUE_PHOTO_ACTIONS,
  BACKFILL_VENUE_PHOTO_ACTION,
  OFFICIAL_VENUE_PHOTO_MAX,
  canLogRoundAtListing,
  canModerateCommunity,
  canReceiveOfficialVenuePhotos,
  canReviewListing,
  isOfficialVenuePhoto,
  officialHostsForListing
} from '../lib/reviews.js';
import {
  DEFAULT_BETA_AREA,
  filterLeadsInBetaArea,
  hasOfficialListingSource,
  publicListing
} from '../lib/listings.js';
import { isPrivateOrLocalIp, parsePublicHttpsUrl } from '../lib/safe-fetch.js';
import { pageReferencesImage } from '../lib/page-images.js';
import listingsHandler from '../api/listings.js';
import listingHandler from '../api/listing.js';
import reviewsHandler from '../api/reviews.js';
import venuePhotosHandler from '../api/venue-photos.js';
import playerHandler from '../api/player.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const approvedCourse = { status: 'approved', kind: 'course', official_website: 'https://www.pga.com/sherman' };
const approvedSim = { status: 'approved', kind: 'simulator', official_website: 'https://indoor.golf' };
assert(canReviewListing(approvedCourse) === true, 'Approved course should be reviewable');
assert(canReviewListing(approvedSim) === true, 'Approved simulator should be reviewable');
assert(canLogRoundAtListing(approvedCourse) === true, 'Approved course should accept rounds');

for (const kind of ['tournament', 'charity', 'corporate', 'training']) {
  assert(
    canReviewListing({ status: 'approved', kind }) === false,
    `Approved ${kind} listing must not be reviewable`
  );
  assert(
    canLogRoundAtListing({ status: 'approved', kind }) === false,
    `Approved ${kind} listing must not accept venue rounds`
  );
}

assert(canReviewListing({ status: 'expired', kind: 'course' }) === false, 'Expired course must not be reviewable');
assert(canReviewListing({ status: 'pending', kind: 'course' }) === false, 'Pending course must not be reviewable');
assert(canReviewListing({ status: 'archived', kind: 'simulator' }) === false, 'Archived simulator must not be reviewable');

assert(canModerateCommunity({ role: 'player' }) === false, 'Normal players must not moderate');
assert(canModerateCommunity({ role: 'user' }) === false, 'User role must not moderate');
assert(canModerateCommunity(null) === false, 'Signed-out users must not moderate');
assert(canModerateCommunity({ role: 'admin' }) === true, 'Admins may moderate');

const listing = {
  status: 'approved',
  kind: 'course',
  official_website: 'https://www.cedarcreekgolf.com/',
  source_url: 'https://cedarcreekgolf.com/rates'
};
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://cedarcreekgolf.com/images/clubhouse.jpg',
    sourceUrl: 'https://cedarcreekgolf.com/gallery',
    listing
  }) === true,
  'Same-domain official website image should be accepted'
);
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://cdn.cedarcreekgolf.com/hero.jpg',
    sourceUrl: 'https://www.cedarcreekgolf.com/about',
    listing
  }) === true,
  'Official subdomain image should be accepted'
);
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://lh3.googleusercontent.com/photo.jpg',
    sourceUrl: 'https://cedarcreekgolf.com/gallery',
    listing
  }) === false,
  'Google-hosted images must be rejected'
);
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://s3-media0.fl.yelpcdn.com/bphoto.jpg',
    sourceUrl: 'https://www.yelp.com/biz/cedar-creek',
    listing
  }) === false,
  'Yelp photos must be rejected'
);
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://media-cdn.tripadvisor.com/media/photo.jpg',
    sourceUrl: 'https://www.tripadvisor.com/Attraction',
    listing
  }) === false,
  'Tripadvisor photos must be rejected'
);
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://scontent.cdninstagram.com/v/photo.jpg',
    sourceUrl: 'https://www.instagram.com/p/abc',
    listing
  }) === false,
  'Instagram photos must be rejected'
);
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://images.unsplash.com/photo.jpg',
    sourceUrl: 'https://cedarcreekgolf.com/gallery',
    listing
  }) === false,
  'Stock-photo hosts must be rejected even if the source page is official'
);
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://cedarcreekgolf.com/hero.jpg',
    sourceUrl: 'https://www.facebook.com/cedarcreek',
    listing
  }) === false,
  'Social source pages must be rejected'
);
assert(
  officialHostsForListing({
    official_website: 'https://www.cedarcreekgolf.com/',
    source_url: 'https://www.google.com/maps?q=cedar'
  }).join() === 'cedarcreekgolf.com',
  'Official photo hosts must come from official_website only'
);
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://maps.google.com/photo.jpg',
    sourceUrl: 'https://www.google.com/maps',
    listing: { official_website: null, source_url: 'https://www.google.com/maps' }
  }) === false,
  'source_url must not be an official-photo fallback'
);
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://directory.example/img.jpg',
    sourceUrl: 'https://directory.example/page',
    listing: { official_website: 'https://cedarcreekgolf.com', source_url: 'https://directory.example' }
  }) === false,
  'A listing source_url host must not authorize venue photos'
);

const wixHtml = `
  <html><head>
    <meta property="og:image" content="https://static.wixstatic.com/media/hero.jpg">
  </head><body>
    <img src="https://static.wixstatic.com/media/hero.jpg" alt="Clubhouse">
  </body></html>
`;
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://static.wixstatic.com/media/hero.jpg',
    sourceUrl: 'https://cedarcreekgolf.com/',
    listing,
    pageHtml: wixHtml
  }) === true,
  'A CDN image referenced by the official venue page should be accepted'
);
assert(
  pageReferencesImage(wixHtml, 'https://static.wixstatic.com/media/hero.jpg', 'https://cedarcreekgolf.com/') === true,
  'Official-page HTML must be treated as referencing that CDN image'
);
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://static.wixstatic.com/media/other.jpg',
    sourceUrl: 'https://cedarcreekgolf.com/',
    listing,
    pageHtml: wixHtml
  }) === false,
  'An unreferenced CDN image must be rejected'
);
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://static.wixstatic.com/media/hero.jpg',
    sourceUrl: 'https://cedarcreekgolf.com/',
    listing
  }) === false,
  'A CDN image must not be trusted from the URL alone'
);
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://lh3.googleusercontent.com/photo.jpg',
    sourceUrl: 'https://cedarcreekgolf.com/',
    listing,
    pageHtml: '<img src="https://lh3.googleusercontent.com/photo.jpg">'
  }) === false,
  'Google images stay rejected even if an official page mentions them'
);
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://images.unsplash.com/photo.jpg',
    sourceUrl: 'https://cedarcreekgolf.com/',
    listing,
    pageHtml: '<meta property="og:image" content="https://images.unsplash.com/photo.jpg">'
  }) === false,
  'Stock-photo hosts stay rejected even when referenced'
);
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://scontent.cdninstagram.com/v/photo.jpg',
    sourceUrl: 'https://cedarcreekgolf.com/',
    listing,
    pageHtml: '<img src="https://scontent.cdninstagram.com/v/photo.jpg">'
  }) === false,
  'Social-media images stay rejected even when referenced'
);
assert(
  isOfficialVenuePhoto({
    imageUrl: 'https://media.cnn.com/course.jpg',
    sourceUrl: 'https://cedarcreekgolf.com/',
    listing,
    pageHtml: '<img src="https://media.cnn.com/course.jpg">'
  }) === false,
  'News-site images stay rejected even when referenced'
);
assert(!parsePublicHttpsUrl('https://127.0.0.1/x'), 'Loopback IPv4 URLs must be rejected');
assert(!parsePublicHttpsUrl('https://localhost/gallery'), 'Localhost URLs must be rejected');
assert(!parsePublicHttpsUrl('http://cedarcreekgolf.com/hero.jpg'), 'HTTP image URLs must be rejected');
assert(!parsePublicHttpsUrl('https://10.0.0.1/img.jpg'), 'Private-network IP hosts must be rejected');
assert(!parsePublicHttpsUrl('https://192.168.1.20/img.jpg'), 'RFC1918 hosts must be rejected');
assert(!parsePublicHttpsUrl('https://[::1]/img.jpg'), 'Loopback IPv6 URLs must be rejected');
assert(isPrivateOrLocalIp('10.0.0.1') === true, '10.x addresses are private');
assert(isPrivateOrLocalIp('169.254.1.1') === true, 'Link-local addresses are private');
assert(isPrivateOrLocalIp('8.8.8.8') === false, 'Public IPv4 addresses are allowed');

assert(hasOfficialListingSource({
  source_url: 'https://cedarcreekgolf.com/rates',
  official_website: 'https://www.cedarcreekgolf.com'
}) === true, 'Matching official website domain is a valid listing source');
assert(hasOfficialListingSource({
  source_url: 'https://www.google.com/search?q=cedar+creek',
  official_website: 'https://cedarcreekgolf.com'
}) === false, 'Google must not be an official listing source');
assert(hasOfficialListingSource({
  source_url: 'https://www.yelp.com/biz/cedar-creek',
  official_website: 'https://cedarcreekgolf.com'
}) === false, 'Directory/review sites must not be official listing sources');

const publicRow = publicListing({
  status: 'approved',
  title: 'Cedar Creek',
  kind: 'course',
  official_website: 'https://cedarcreekgolf.com',
  registration_url: 'https://cedarcreekgolf.com/register',
  source_url: 'https://secret-research.example/page',
  source_name: 'Research note'
});
assert(publicRow && !('source_url' in publicRow) && !('source_name' in publicRow), 'Public listing data must not expose source_url or source_name');
assert(publicRow.registration_url === 'https://cedarcreekgolf.com/register', 'Public registration must come from registration_url');
assert(publicRow.official_website === 'https://cedarcreekgolf.com', 'Public website must come from official_website');

const insideUnlocated = filterLeadsInBetaArea([
  {
    title: 'Needs address review',
    official_website: 'https://cedarcreekgolf.com',
    registration_url: null,
    source_url: 'https://cedarcreekgolf.com/about'
  }
], DEFAULT_BETA_AREA);
assert(insideUnlocated.kept.length === 1 && insideUnlocated.kept[0].area_review_required === true, 'Source-backed lead without coordinates is retained for admin review');

const outside = filterLeadsInBetaArea([
  {
    title: 'Too far',
    official_website: 'https://far.example',
    source_url: 'https://far.example',
    latitude: 29.4241,
    longitude: -98.4936
  }
], DEFAULT_BETA_AREA);
assert(outside.kept.length === 0 && outside.omitted.length === 1, 'A lead with known coordinates outside the Sherman radius is rejected');

const reviewsApi = readFileSync(join(root, 'api/reviews.js'), 'utf8');
const venueApi = readFileSync(join(root, 'api/venue-photos.js'), 'utf8');
const listingPage = readFileSync(join(root, 'listing-page.js'), 'utf8');
const listingsLib = readFileSync(join(root, 'lib/listings.js'), 'utf8');
const listingsApi = readFileSync(join(root, 'api/listings.js'), 'utf8');
const listingApi = readFileSync(join(root, 'api/listing.js'), 'utf8');
const home = readFileSync(join(root, 'index.html'), 'utf8');
const safeFetch = readFileSync(join(root, 'lib/safe-fetch.js'), 'utf8');
const officialPhotos = readFileSync(join(root, 'lib/official-photos.js'), 'utf8');
const aiApi = readFileSync(join(root, 'api/ai.js'), 'utf8');
const adminApi = readFileSync(join(root, 'api/admin.js'), 'utf8');
const reviewsLib = readFileSync(join(root, 'lib/reviews.js'), 'utf8');
const playerApi = readFileSync(join(root, 'api/player.js'), 'utf8');

assert(reviewsApi.indexOf('requireAdmin') < reviewsApi.indexOf("action === 'create'"), 'Review moderation must run before player create/update');
for (const action of ADMIN_REVIEW_ACTIONS) {
  assert(reviewsApi.includes(`'${action}'`) || reviewsApi.includes(`"${action}"`), `Review API must handle ${action}`);
}
assert(reviewsApi.includes('canModerateCommunity'), 'Review API must check admin moderation helper');
assert(reviewsApi.includes('canReviewListing'), 'Review API must block event listings');
assert(venueApi.includes('requireAdmin(req)'), 'Venue photo writes must require admin');
for (const action of ADMIN_VENUE_PHOTO_ACTIONS) {
  const handled =
    venueApi.includes(`action === '${action}'`) ||
    venueApi.includes(`'${action}'`) ||
    (action === BACKFILL_VENUE_PHOTO_ACTION && venueApi.includes('action === BACKFILL_VENUE_PHOTO_ACTION'));
  assert(handled, `Venue photo API must handle ${action}`);
}
assert(venueApi.includes('verifyOfficialVenuePhoto'), 'Venue photo import must verify official pages server-side');
assert(!venueApi.includes('listing.official_website || listing.source_url'), 'Venue photo find must not fall back to source_url');
assert(!reviewsLib.includes('listing.official_website, listing.source_url'), 'Official photo hosts must not include source_url');
assert(listingsLib.includes('hasOfficialListingSource'), 'PR #14 official listing validation must remain');
assert(aiApi.includes('same domain as official_website or registration_url'), 'AI search must require an official-domain source');
assert(adminApi.includes('hasOfficialListingSource'), 'Admins cannot publish without an official listing source');
assert(!listingPage.includes('community gallery'), 'Listing page must not add a community gallery');
assert(listingPage.includes('From the official venue website'), 'Official photos need attribution');
assert(listingPage.includes('Official website'), 'Public listing must show Official website');
assert(listingPage.includes('Official registration'), 'Public listing may show Official registration');
assert(!listingPage.includes('listing.source_url'), 'Public listing page must not use source_url');
assert(!listingPage.includes('Source-backed photos') && !listingPage.includes('Verified listing photos'), 'Public listing must not show source-backed listing photos');
assert(!listingPage.includes('Source-backed excerpts'), 'Research excerpts must stay off the public listing page');
assert(listingPage.includes('Sign in to explore verified golf near you.'), 'Direct listing URLs must show the sign-in gate');
assert(listingPage.includes('Create a free player account to unlock the board.'), 'Listing gate must offer account creation');
assert(listingPage.includes('returnTo'), 'Sign-in from a listing should return the player afterward');
assert(listingPage.includes('Event listings cannot be reviewed') || listingPage.includes('cannot be reviewed'), 'Event listings must explain why reviews are unavailable');
assert(listingsApi.includes('requireUser'), 'Listings API must require a signed-in session');
assert(listingsApi.includes('cover_photo_url'), 'Listings API must send an approved cover photo URL');
assert(listingsApi.includes('status=eq.approved'), 'Dashboard covers must come from approved venue_photos');
assert(!listingsApi.includes('listings.photos') && !listingsApi.includes('row.photos'), 'Dashboard cards must not use listings.photos');
assert(listingApi.includes('requireUser'), 'Listing detail API must require a signed-in session');
assert(!listingApi.includes('photos: listing.photos'), 'Listing detail must not expose listings.photos');
assert(reviewsApi.includes('requireUser(req)'), 'Review reads must require a signed-in session');
assert(playerApi.includes("if (!user) return json(res, 401"), 'Player data API must require a signed-in session');
assert(officialPhotos.includes('fetchHttpsText(sourceUrl, { allowedHosts: officialHosts })'), 'Source-page fetch must stay on the official website');
assert(safeFetch.includes("parsed.protocol !== 'https:'"), 'Verification fetch must be HTTPS only');
assert(safeFetch.includes("redirect: 'manual'"), 'Verification fetch must not follow redirects blindly');
assert(safeFetch.includes('FETCH_TIMEOUT_MS'), 'Verification fetch must use a short timeout');
assert(safeFetch.includes('FETCH_MAX_BYTES'), 'Verification fetch must cap response size');
assert(home.includes('cover_photo_url'), 'Dashboard cards must display approved cover photos');
assert(home.includes('listing-cover'), 'Cover photos need a consistent crop');
assert(home.includes('listing-card'), 'Dashboard cards must use the Explore listing card layout');
assert(home.includes('explore-home.css'), 'Home must load Explore app styles');
assert(home.includes('Where do you want to play?'), 'Home must open into the Explore dashboard');
assert(home.includes('Explore nearby.'), 'Discovery board must be labeled Explore nearby');
assert(home.includes('verified-badge'), 'Home cards must use the verified badge indicator');
assert(home.includes('aria-label="Verified listing"'), 'Verified badge must expose an accessible label');
assert(!home.includes(": 'Verified listing'") && !home.includes('Verified listing\')'), 'Home cards must not use Verified listing as fallback copy');
assert(!/\bbeta\b/i.test(home.replace(/aria-label="Verified listing"/g, '')), 'Home must not expose beta wording');
assert(listingPage.includes('verified-badge'), 'Listing detail must show the verified badge indicator');
assert(!listingPage.includes('Verified listing</'), 'Listing detail must not repeat Verified listing label text');
assert(!/\bbeta\b/i.test(readFileSync(join(root, 'player-pages.js'), 'utf8')), 'Player-facing pages must not expose beta wording');
assert(!/\bbeta\b/i.test(readFileSync(join(root, 'company/index.html'), 'utf8')), 'Company admin page must not expose beta wording');
assert(!home.includes('Play is on'), 'Home must not show unsupported Play is on copy');
assert(!home.includes('app-footer'), 'Home must not show the development disclaimer footer');
assert(!home.includes('listing-detail.css'), 'Home should not load listing detail styles');
const listingHtml = readFileSync(join(root, 'listing/index.html'), 'utf8');
const listingDetailCss = readFileSync(join(root, 'listing-detail.css'), 'utf8');
const listingJs = readFileSync(join(root, 'listing-page.js'), 'utf8');
const appNav = readFileSync(join(root, 'app-nav.js'), 'utf8');
assert(listingHtml.includes('listing-detail.css'), 'Listing page must load listing detail styles');
assert(listingJs.includes('plan-panel'), 'Listing detail must include Plan your visit panel');
assert(listingJs.includes('listing-hero'), 'Listing detail must include a hero section');
assert(listingJs.includes('findOfficialPhotos'), 'Listing detail must keep admin official photo discovery');
assert(listingJs.includes('reviewForm'), 'Listing detail must keep player review form');
assert(listingJs.includes('venueStats'), 'Listing detail must keep venue round stats');
assert(!listingJs.includes('Elevate') && !listingJs.includes('Discover Denison'), 'Listing detail must not hard-code venue special cases');
assert(!/https:\/\/images\.unsplash\.com/.test(listingJs), 'Listing detail must not use stock photo URLs');
assert(appNav.includes('Explore') && appNav.includes('My Game') && appNav.includes('Players'), 'Shared mobile nav must use consistent labels');
assert(listingPage.includes('plan-panel') || listingJs.includes('plan-panel'), 'Listing detail must expose Plan your visit');
assert(home.includes('Sign in to explore verified golf near you.'), 'Signed-out home must use the sign-in gate copy');
assert(home.includes('Create a free player account to unlock the board.'), 'Signed-out home must offer account creation');
assert(home.includes("Authorization:'Bearer '+session.access_token"), 'Home board fetch must send the player session');
assert(!home.includes('x.photos'), 'Dashboard cards must not read listings.photos');
assert(!home.includes('Waiting for approval'), 'Signed-out preview must not use coming-soon copy');
assert(!home.includes('coming soon') && !home.includes('Coming soon'), 'Signed-out preview must not describe future features');
assert(home.includes('preview-locked') && home.includes('category-mosaic'), 'Signed-out home must use the compact category preview');
assert(home.includes('browseAction') && home.includes('See what Golfolio helps you find'), 'Signed-out home must use a browse action instead of faux search');
assert(!home.includes('search-surface') && !home.includes('locked-card'), 'Signed-out home must not use faux search or repeated locked cards');
assert(home.includes('site-footer') && home.includes('verified-explainer'), 'Home must include footer and verified explainer');
assert(!home.includes('Human-verified') && !home.includes('Private location handling'), 'Sherman panel must not show unsupported claims');

// ── One-time official-photo backfill ──
const adminPages = readFileSync(join(root, 'player-pages.js'), 'utf8');
const vercelConfig = readFileSync(join(root, 'vercel.json'), 'utf8');

assert(BACKFILL_VENUE_PHOTO_ACTION === 'find_and_autoapprove_for_backfill', 'Backfill action name must stay explicit');
assert(ADMIN_VENUE_PHOTO_ACTIONS.includes(BACKFILL_VENUE_PHOTO_ACTION), 'Backfill action must be an admin-only venue photo action');
assert(ADMIN_VENUE_PHOTO_ACTIONS.includes('find'), 'Manual find action must remain available');

assert(
  canReceiveOfficialVenuePhotos({ status: 'approved', kind: 'tournament', official_website: 'https://cedarcreekgolf.com' }) === true,
  'Approved non-course listings with an official website may receive official photos'
);
assert(
  canReviewListing({ status: 'approved', kind: 'tournament', official_website: 'https://cedarcreekgolf.com' }) === false,
  'Official photo eligibility must not make event listings reviewable'
);
assert(
  canLogRoundAtListing({ status: 'approved', kind: 'corporate', official_website: 'https://cedarcreekgolf.com' }) === false,
  'Official photo eligibility must not make event listings round-loggable'
);
assert(
  canReceiveOfficialVenuePhotos({ status: 'pending', kind: 'course', official_website: 'https://cedarcreekgolf.com' }) === false,
  'Unapproved listings must never receive backfilled official photos'
);
assert(
  canReceiveOfficialVenuePhotos({ status: 'approved', kind: 'course', official_website: null }) === false,
  'Listings without an official website must be skipped by the backfill'
);
assert(
  canReceiveOfficialVenuePhotos({ status: 'approved', kind: 'course', official_website: 'not-a-url' }) === false,
  'An invalid official website must not enable the backfill'
);

assert(venueApi.includes('action === BACKFILL_VENUE_PHOTO_ACTION'), 'Backfill must be a dedicated explicit action');
assert(venueApi.includes('canReceiveOfficialVenuePhotos'), 'Backfill must check official-website eligibility');
assert(
  venueApi.includes("status: autoApprove ? 'approved' : 'pending'"),
  'Only the explicit backfill flag may approve a venue photo on insert'
);
assert(venueApi.includes('autoApprove: false'), 'The normal find action must stay pending for manual review');
assert(venueApi.includes('autoApprove: true'), 'The backfill action must request auto-approval explicitly');
assert(
  venueApi.indexOf('autoApprove: false') < venueApi.indexOf('autoApprove: true'),
  'The manual find action must remain the non-approving default path'
);
assert(
  venueApi.includes('verifyOfficialVenuePhoto({ imageUrl: image_url, sourceUrl: source_url, listing, pageCache })'),
  'Every backfilled photo must pass official-site verification before it is stored'
);
assert(
  !/autoApprove[\s\S]{0,400}verified\.ok/.test(venueApi) || venueApi.includes('if (!verified.ok) {'),
  'Auto-approval must not bypass the verification result'
);
assert(
  venueApi.includes('remainingSlots: OFFICIAL_VENUE_PHOTO_MAX - already'),
  'Backfill must respect the maximum approved official photos per listing'
);
assert(
  venueApi.includes("reason: 'already_full'"),
  'Listings already at the official-photo maximum must be skipped'
);
assert(
  venueApi.includes('Math.min(OFFICIAL_VENUE_PHOTO_MAX, remainingSlots'),
  'Backfill inserts must stay within the official photo maximum'
);
assert(
  venueApi.includes('have.has(image_url)'),
  'Backfill must not duplicate or overwrite an existing official photo'
);
assert(
  !venueApi.includes("status: 'approved', reviewed_by") || venueApi.includes('autoApprove'),
  'Approved status must only come from an admin-reviewed or explicit backfill path'
);
assert(OFFICIAL_VENUE_PHOTO_MAX === 3, 'Official venue photos stay capped at three per listing');

assert(adminPages.includes('Populate official listing photos'), 'Admin Listings must expose the one-time backfill tool');
assert(
  adminPages.includes('This one-time action checks each approved listing’s official website.'),
  'Backfill must show the required confirmation before it starts'
);
assert(adminPages.includes(`action:'${BACKFILL_VENUE_PHOTO_ACTION}'`), 'Admin UI must call the explicit backfill action');
assert(adminPages.includes('view=backfill_targets'), 'Admin UI must load backfill targets one listing at a time');
assert(adminPages.includes('backfillStopped'), 'Admin must be able to stop the backfill run');
assert(
  adminPages.includes("if(profile.role!=='admin')throw Error('Admin access is required to manage listings.')"),
  'The backfill tool must stay inside the admin-only Listings page'
);
const cronPaths = (JSON.parse(vercelConfig).crons || []).map((entry) => entry.path);
assert(
  cronPaths.every((path) => path === '/api/expire'),
  'Backfill must not add a scheduled job beyond the existing listing-expiry cron'
);
assert(
  !cronPaths.some((path) => /venue|photo|backfill/i.test(path)),
  'Official photo backfill must stay a manual admin action, never a cron'
);

const gateSqlPath = join(root, 'supabase/signed-in-data-gate-migration.sql');
const gateSql = readFileSync(gateSqlPath, 'utf8');
assert(gateSql.includes('alter table public.listings enable row level security'), 'Listings RLS must stay enabled');
assert(gateSql.includes('alter table public.listing_reviews enable row level security'), 'Review RLS must stay enabled');
assert(gateSql.includes('alter table public.venue_photos enable row level security'), 'Venue-photo RLS must stay enabled');
assert(gateSql.includes('alter table public.rounds enable row level security'), 'Rounds RLS must stay enabled');
assert(gateSql.includes('drop policy if exists "public approved listings"'), 'Anonymous listing read policy must be removed');
assert(gateSql.includes('drop policy if exists "public read approved listing reviews"'), 'Anonymous review read policy must be removed');
assert(gateSql.includes('drop policy if exists "public read approved venue photos"'), 'Anonymous venue-photo read policy must be removed');
assert(gateSql.includes('drop policy if exists "public rounds are readable"'), 'Anonymous public-round policy must be removed');
assert(gateSql.includes('authenticated read approved listings'), 'Approved listings must have an authenticated-only policy');
assert(gateSql.includes('authenticated read approved listing reviews'), 'Approved reviews must have an authenticated-only policy');
assert(gateSql.includes('authenticated read approved venue photos'), 'Approved venue photos must have an authenticated-only policy');
assert(gateSql.includes('authenticated read public rounds'), 'Public rounds must have an authenticated-only policy');
assert((gateSql.match(/auth\.role\(\) = 'authenticated'/g) || []).length >= 4, 'Public-facing select policies must require auth.role() = authenticated');
assert(gateSql.includes('revoke all on table public.listings from anon'), 'Anon must lose listings grants');
assert(gateSql.includes('revoke all on table public.listing_reviews from anon'), 'Anon must lose review grants');
assert(gateSql.includes('revoke all on table public.venue_photos from anon'), 'Anon must lose venue-photo grants');
assert(gateSql.includes('revoke all on table public.rounds from anon'), 'Anon must lose rounds grants');
assert(gateSql.includes('players read own listing reviews'), 'Players must still read their own reviews');
assert(gateSql.includes('players manage own rounds'), 'Players must still manage their own rounds');
assert(gateSql.includes('grant all on table public.listings to service_role'), 'Service role must keep listings access');
assert(gateSql.includes('grant all on table public.listing_reviews to service_role'), 'Service role must keep review access');
assert(gateSql.includes('grant all on table public.venue_photos to service_role'), 'Service role must keep venue-photo access');
assert(gateSql.includes('grant all on table public.rounds to service_role'), 'Service role must keep rounds access');
assert(listingsApi.includes('auth.token'), 'Listings API must use the verified user access token');
assert(listingApi.includes('auth.token'), 'Listing detail API must use the verified user access token');
assert(listingsApi.includes('apikey: anonKey') || listingsApi.includes('apikey: key'), 'Listings API must still send the public anon key as apikey');
assert(!listingsApi.includes('Authorization: `Bearer ${key}`'), 'Listings API must not use the anon key as a user JWT');
assert(!listingApi.includes('Authorization: `Bearer ${key}`'), 'Listing detail API must not use the anon key as a user JWT');
assert(listingsApi.includes('requireUser') && listingApi.includes('requireUser'), 'Signed-in APIs still expose approved listings after requireUser');
assert(reviewsApi.includes('requireUser') && venueApi.includes('requireUser') && playerApi.includes('authenticatedUser'), 'Reviews, venue photos, and player data remain available through protected APIs');

function mockReq(query = {}) {
  return { method: 'GET', query, headers: {}, body: {} };
}
function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  return res;
}
async function assertHandler401(handler, query, message) {
  const res = mockRes();
  await handler(mockReq(query), res);
  assert(res.statusCode === 401, message);
}

await assertHandler401(listingsHandler, {}, '/api/listings must return 401 without a session');
await assertHandler401(listingHandler, { id: '00000000-0000-0000-0000-000000000001' }, '/api/listing must return 401 without a session');
await assertHandler401(reviewsHandler, { listing_id: '00000000-0000-0000-0000-000000000001' }, '/api/reviews must return 401 without a session');
await assertHandler401(venuePhotosHandler, { listing_id: '00000000-0000-0000-0000-000000000001' }, '/api/venue-photos must return 401 without a session');
await assertHandler401(playerHandler, {}, '/api/player must return 401 without a session');
await assertHandler401(
  venuePhotosHandler,
  { view: 'backfill_targets' },
  'Backfill target list must require an admin session'
);

async function assertPostHandler401(handler, body, message) {
  const res = mockRes();
  await handler({ method: 'POST', query: {}, headers: {}, body }, res);
  assert(res.statusCode === 401, message);
}

const backfillBody = { action: BACKFILL_VENUE_PHOTO_ACTION, listing_id: '00000000-0000-0000-0000-000000000001' };
await assertPostHandler401(venuePhotosHandler, backfillBody, 'Only signed-in admins may run the official photo backfill');
await assertPostHandler401(
  venuePhotosHandler,
  { action: 'find', listing_id: '00000000-0000-0000-0000-000000000001' },
  'Only signed-in admins may run the manual official photo find'
);

const usableRow = (row) => row && (row.id || row.title || row.body || row.image_url || row.course_name);
async function assertAnonRestBlocked(path, message) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return 'skipped';
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const body = await response.json().catch(() => null);
  const leaked = Array.isArray(body) && body.some(usableRow);
  assert(!leaked && (response.status >= 400 || (Array.isArray(body) && body.length === 0)), message);
  return 'probed';
}

const restProbe = await Promise.all([
  assertAnonRestBlocked('listings?status=eq.approved&select=id,title&limit=1', 'Anon REST must not read approved listings'),
  assertAnonRestBlocked('listing_reviews?status=eq.approved&select=id,body&limit=1', 'Anon REST must not read approved listing reviews'),
  assertAnonRestBlocked('venue_photos?status=eq.approved&select=id,image_url&limit=1', 'Anon REST must not read approved venue photos'),
  assertAnonRestBlocked('rounds?visibility=eq.public&select=id,course_name&limit=1', 'Anon REST must not read public rounds')
]);

if (failures.length) {
  console.error('Venue community checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Venue community checks passed.');
console.log('- Players cannot moderate (canModerateCommunity=false for non-admins).');
console.log('- Event listings cannot be reviewed.');
console.log('- Official venue photos may use a referenced CDN, but not an unreferenced one.');
console.log('- Listing, review, venue-photo, and player APIs require a signed-in session.');
console.log('- Anonymous public-read RLS policies are replaced by authenticated-only policies.');
console.log('- The official photo backfill is admin-only, explicit, capped at three photos, and never a cron.');
console.log('- Manual find still stores pending photos; only the backfill action approves verified official images.');
console.log(restProbe.includes('probed')
  ? '- Live anon-key REST probes returned no usable listing/review/photo/round rows.'
  : '- Live anon-key REST probes skipped (SUPABASE_URL / SUPABASE_ANON_KEY not set in this environment).');

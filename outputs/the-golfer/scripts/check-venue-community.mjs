import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  ADMIN_REVIEW_ACTIONS,
  ADMIN_VENUE_PHOTO_ACTIONS,
  canLogRoundAtListing,
  canModerateCommunity,
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
  assert(venueApi.includes(`action === '${action}'`) || venueApi.includes(`'${action}'`), `Venue photo API must handle ${action}`);
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
assert(home.includes('locked-card'), 'Signed-out home must use locked preview cards');
assert(home.includes('Sign in to explore verified golf near you.'), 'Signed-out home must use the sign-in gate copy');
assert(home.includes('Create a free player account to unlock the board.'), 'Signed-out home must offer account creation');
assert(home.includes("Authorization:'Bearer '+session.access_token"), 'Home board fetch must send the player session');
assert(!home.includes('x.photos'), 'Dashboard cards must not read listings.photos');
assert(!home.includes('Waiting for approval'), 'Signed-out preview must not use coming-soon copy');
assert(!home.includes('coming soon') && !home.includes('Coming soon'), 'Signed-out preview must not describe future features');

if (failures.length) {
  console.error('Venue community checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Venue community checks passed.');
console.log('- Players cannot moderate (canModerateCommunity=false for non-admins).');
console.log('- Event listings cannot be reviewed.');
console.log('- Official venue photos may use a referenced CDN, but not an unreferenced one.');
console.log('- Listing, review, venue-photo, and player APIs require a signed-in session.');

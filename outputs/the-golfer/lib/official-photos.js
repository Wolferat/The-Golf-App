import { fetchHttpsText, parsePublicHttpsUrl } from './safe-fetch.js';
import {
  hostnameOf,
  hostMatchesOfficial,
  isBlockedPhotoHost,
  isOfficialVenuePhoto,
  officialHostsForListing
} from './reviews.js';

export { pageReferencesImage } from './page-images.js';

export async function verifyOfficialVenuePhoto({ imageUrl, sourceUrl, listing, pageHtml = null, pageCache = null }) {
  if (!parsePublicHttpsUrl(imageUrl) || !parsePublicHttpsUrl(sourceUrl)) {
    return { ok: false, reason: 'unsafe_url' };
  }
  if (isOfficialVenuePhoto({ imageUrl, sourceUrl, listing })) {
    return { ok: true, reason: 'official_domain' };
  }
  const officialHosts = officialHostsForListing(listing);
  const sourceHost = hostnameOf(sourceUrl);
  const imageHost = hostnameOf(imageUrl);
  if (!officialHosts.length || !officialHosts.some((host) => hostMatchesOfficial(sourceHost, host))) {
    return { ok: false, reason: 'source_not_official' };
  }
  if (isBlockedPhotoHost(imageHost) || isBlockedPhotoHost(sourceHost)) {
    return { ok: false, reason: 'blocked_host' };
  }
  let html = pageHtml;
  if (html == null) {
    const cacheKey = sourceUrl;
    if (pageCache && pageCache.has(cacheKey)) html = pageCache.get(cacheKey);
    else {
      html = await fetchHttpsText(sourceUrl, { allowedHosts: officialHosts });
      if (pageCache) pageCache.set(cacheKey, html);
    }
  }
  if (isOfficialVenuePhoto({ imageUrl, sourceUrl, listing, pageHtml: html })) {
    return { ok: true, reason: 'official_page_reference' };
  }
  return { ok: false, reason: 'not_referenced_on_official_page' };
}

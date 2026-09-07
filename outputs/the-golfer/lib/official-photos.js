import { fetchHttpsText, parsePublicHttpsUrl } from './safe-fetch.js';
import {
  hostnameOf,
  hostMatchesOfficial,
  isBlockedPhotoHost,
  isOfficialVenuePhoto,
  officialHostsForListing
} from './reviews.js';

import { extractPageImageUrls } from './page-images.js';

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

// Read actual official-page assets before asking a search model for image URLs.
export async function discoverPagePhotos(listing) {
  const hosts=officialHostsForListing(listing), photos=[], errors=[], seen=new Set();
  const pages=[...new Set([listing.source_url,listing.official_website].filter(url=>{
    const parsed=parsePublicHttpsUrl(url);
    return parsed && hosts.some(host=>hostMatchesOfficial(parsed.hostname,host));
  }))].slice(0,2);
  for(const source_url of pages) {
    try {
      const html=await fetchHttpsText(source_url,{allowedHosts:hosts});
      for(const image of extractPageImageUrls(html,source_url)) {
        if(seen.has(image.href)||!parsePublicHttpsUrl(image.href))continue;
        if(!/\.(?:jpe?g|png|webp|avif)(?:$|[/?])/i.test(image.path))continue;
        if(/(?:logo|favicon|sprite|icon|tracking|placeholder)/i.test(image.path))continue;
        const verified=await verifyOfficialVenuePhoto({imageUrl:image.href,sourceUrl:source_url,listing,pageHtml:html});
        if(!verified.ok)continue;
        seen.add(image.href);photos.push({url:image.href,source_url,source_name:listing.source_name||'Official website'});
        if(photos.length>=12)return {photos,errors};
      }
    } catch(error) { errors.push({source_url,reason:error.code||'page_fetch_failed'}); }
  }
  return {photos,errors};
}

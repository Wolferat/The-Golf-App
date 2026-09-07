import {fetchImportResource,parseImportUrl} from './import-fetch.js';
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
    try { return Boolean(parseImportUrl(url,hosts)); } catch { return false; }
  }))].slice(0,2);
  if(!hosts.length)return {photos,errors};
  for(const pageUrl of pages) {
    try {
      let page;
      try { page=await fetchImportResource(pageUrl,{allowedHosts:hosts}); }
      catch(error) {
        // Some older official sites have HTTP content but no valid TLS setup.
        // Fetch HTTP separately; never accept an invalid certificate.
        if(!/^https:/.test(pageUrl)||!['DEPTH_ZERO_SELF_SIGNED_CERT','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN'].includes(error.code))throw error;
        page=await fetchImportResource(pageUrl.replace(/^https:/,'http:'),{allowedHosts:hosts});
      }
      const source_url=page.url;
      for(const image of extractPageImageUrls(page.buffer.toString('utf8'),source_url)) {
        if(seen.has(image.href))continue;
        try { parseImportUrl(image.href); } catch { continue; }
        if(!/\.(?:jpe?g|png|webp|avif)(?:$|[/?])/i.test(image.path))continue;
        if(/(?:logo|favicon|sprite|icon|tracking|placeholder)/i.test(image.path))continue;
        if(isBlockedPhotoHost(image.host))continue;
        seen.add(image.href);photos.push({url:image.href,source_url,source_name:hostnameOf(source_url)||'Official website'});
        if(photos.length>=12)return {photos,errors};
      }
    } catch(error) { errors.push({source_url:pageUrl,reason:error.code||'page_fetch_failed'}); }
  }
  return {photos,errors};
}

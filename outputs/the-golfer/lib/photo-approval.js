import { supabase } from './admin.js';
import { verifyOfficialVenuePhoto } from './official-photos.js';
import { cleanText } from './listings.js';
import { OFFICIAL_VENUE_PHOTO_MAX } from './reviews.js';

const fail = (message, status=400) => Object.assign(new Error(message), {status});
export async function stageListingPhotos({listing, photos, adminId}) {
  if (!listing || !['pending','approved'].includes(listing.status)) throw fail('Photos can be reviewed for pending or approved listings.');
  const existing=await supabase(`venue_photos?listing_id=eq.${encodeURIComponent(listing.id)}&select=id,image_url,status`);
  const have=new Map(existing.map(row=>[row.image_url,row.status]));
  const saved=[],omitted=[],pageCache=new Map();
  for(const photo of (Array.isArray(photos)?photos:[]).slice(0,12)) {
    const image_url=photo.url||photo.image_url,source_url=photo.source_url||listing.official_website;
    if(have.has(image_url)){omitted.push({url:image_url,reason:`already_${have.get(image_url)}`});continue;}
    if(existing.filter(row=>row.status==='pending').length+saved.length>=20){omitted.push({url:image_url,reason:'review_queue_full'});continue;}
    let result;
    try{result=await verifyOfficialVenuePhoto({imageUrl:image_url,sourceUrl:source_url,listing,pageCache});}
    catch{result={ok:false,reason:'verification_failed'};}
    if(!result.ok){omitted.push({url:image_url,source_url,reason:result.reason});continue;}
    const [row]=await supabase('venue_photos',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({listing_id:listing.id,image_url,source_url,source_name:cleanText(photo.source_name,160)||'Official website',status:'pending',created_by:adminId})});
    if(row){saved.push(row);have.set(image_url,'pending');}
  }
  return {saved,omitted};
}

// Validate the complete selection before changing either listing or photo status.
export async function preparePhotoApproval(listing, ids) {
  if(!Array.isArray(ids)||ids.length>OFFICIAL_VENUE_PHOTO_MAX||ids.some(id=>typeof id!=='string'))throw fail('Select up to three photos.');
  const all=await supabase(`venue_photos?listing_id=eq.${encodeURIComponent(listing.id)}&select=id,image_url,source_url,status`);
  const selected=[...new Set(ids)].map(id=>all.find(row=>row.id===id));
  if(selected.some(row=>!row||!['pending','approved'].includes(row.status)))throw fail('A selected photo is unavailable. Refresh the review.');
  if(new Set([...all.filter(row=>row.status==='approved').map(row=>row.id),...ids]).size>OFFICIAL_VENUE_PHOTO_MAX)throw fail('There is room for three approved photos. Remove an existing photo before adding another.',409);
  const pageCache=new Map();
  for(const row of selected){
    let result;
    try{result=await verifyOfficialVenuePhoto({imageUrl:row.image_url,sourceUrl:row.source_url,listing,pageCache});}catch{result={ok:false};}
    if(!result.ok)throw fail('A selected photo could not be verified on the official website. Deselect it or correct its source.');
  }
  return selected.filter(row=>row.status!=='approved').map(row=>row.id);
}
export async function approvePreparedPhotos(listingId,ids,adminId){
  if(!ids.length)return;
  await supabase(`venue_photos?listing_id=eq.${encodeURIComponent(listingId)}&id=in.(${ids.map(encodeURIComponent).join(',')})&status=eq.pending`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'approved',reviewed_by:adminId,reviewed_at:new Date().toISOString()})});
}

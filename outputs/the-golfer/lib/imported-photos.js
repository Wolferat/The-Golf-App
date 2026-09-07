import sharp from 'sharp';
import {storageUpload,storageSignedUrl,storageRemove,serviceHeaders} from './admin.js';
import {REVIEW_PHOTO_BUCKET,officialHostsForListing,hostnameOf,isBlockedPhotoHost} from './reviews.js';
import {extractPageImageUrls} from './page-images.js';
import {fetchImportResource,fetchOfficialPage,parseImportUrl,importError} from './import-fetch.js';

export const needsPhotoImport=row=>/^http:\/\//i.test(row.image_url||row.url||'')||/^http:\/\//i.test(row.source_url||'');
export function importedPhotoPath(id){
 if(!/^[0-9a-f-]{36}$/i.test(id||''))throw new Error('Invalid photo identifier.');
 return `venue-imports/${id}/photo.jpg`;
}
export async function normalizeImportedImage(buffer){
 const png=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpg=buffer[0]===255&&buffer[1]===216&&buffer[2]===255;
 const webp=buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP';
 if(!png&&!jpg&&!webp)throw importError('unsupported_image','Only JPEG, PNG, and WebP photos can be imported.');
 const output=await sharp(buffer,{limitInputPixels:16000000,failOn:'warning'}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:85}).toBuffer();
 if(output.length>2*1024*1024)throw importError('too_large','The optimized image exceeds 2 MB.');
 return output;
}
export async function importOfficialPhoto({id,imageUrl,sourceUrl,listing,pageCache=new Map(),fetchResource=fetchImportResource,fetchPage=fetchOfficialPage}){
 const hosts=officialHostsForListing(listing);
 if(!hosts.length)throw importError('source_not_official','Save an official website first.');
 parseImportUrl(sourceUrl,hosts);const image=parseImportUrl(imageUrl);
 if(isBlockedPhotoHost(hostnameOf(imageUrl)))throw importError('blocked_host','This image provider is not supported.');
 let page=pageCache.get(sourceUrl);
 if(!page){page=await fetchPage(sourceUrl,{allowedHosts:hosts});pageCache.set(sourceUrl,page);}
 // Exact extracted URL, not a filename resemblance, authorizes copying a CDN asset.
 if(!extractPageImageUrls(page.buffer.toString('utf8'),page.url).some(x=>x.href===image.href))throw importError('not_referenced_on_official_page','The image is not referenced by the official page.');
 const file=await fetchResource(image.href,{allowedHosts:[image.hostname],maxBytes:5*1024*1024});
 const buffer=await normalizeImportedImage(file.buffer);
 const bucket=await fetch(`${process.env.SUPABASE_URL}/storage/v1/bucket/${REVIEW_PHOTO_BUCKET}`,{headers:serviceHeaders()});
 const settings=await bucket.json().catch(()=>({}));
 if(!bucket.ok||settings.public!==false)throw importError('storage_not_private','A private review-photos bucket is required before importing.');
 await storageUpload(REVIEW_PHOTO_BUCKET,importedPhotoPath(id),buffer,'image/jpeg');
 return {bytes:buffer.length};
}
// Call only after the API has authorized this row for the current viewer.
export async function displayPhotoUrl(row){
 if(!needsPhotoImport(row))return row.image_url;
 return storageSignedUrl(REVIEW_PHOTO_BUCKET,importedPhotoPath(row.id),900);
}
export async function removeImportedPhoto(row){
 if(needsPhotoImport(row))await storageRemove(REVIEW_PHOTO_BUCKET,importedPhotoPath(row.id));
}

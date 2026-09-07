import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {parseImportUrl,publicImportAddress} from '../lib/import-fetch.js';
import {normalizeImportedImage,importOfficialPhoto,displayPhotoUrl,importedPhotoPath} from '../lib/imported-photos.js';
import venuePhotos from '../api/venue-photos.js';
const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const source='http://course.example/';
const image=source+'range.png';
const row={id,listing_id:'listing-a',image_url:image,source_url:source,status:'pending'};
function storage(t,{isPublic=false,role='admin'}={}){
 const old={...process.env};process.env.SUPABASE_URL='https://storage.example';process.env.SUPABASE_SERVICE_ROLE_KEY='test';process.env.SUPABASE_ANON_KEY='test';const calls=[];
 t.after(()=>{for(const k of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY']){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}});
 t.mock.method(globalThis,'fetch',async(url,options={})=>{
  const u=new URL(url);assert.equal(u.hostname,'storage.example');calls.push({path:u.pathname,...options});
  if(u.pathname==='/auth/v1/user')return Response.json({id:'actor'});
  if(u.pathname==='/rest/v1/profiles')return Response.json([{id:'actor',role}]);
  if(u.pathname==='/rest/v1/listings')return Response.json([{id:'listing-a',status:'approved',kind:'course'}]);
  if(u.pathname==='/rest/v1/venue_photos')return Response.json(u.searchParams.get('status')==='eq.approved'?[]:[row]);
  if(u.pathname.includes('/bucket/'))return Response.json({public:isPublic});
  if(u.pathname.includes('/object/sign/'))return Response.json({signedURL:'/object/sign/review-photos/image?token=test'});
  if(u.pathname.includes('/object/'))return Response.json({});
  throw Error('Unexpected request '+url);
 });return calls;
}
test('import transport rejects non-web, credentials, private hosts, nonstandard ports and foreign sources',()=>{
 for(const u of ['file:///tmp/a','http://127.0.0.1/a','http://[::1]/','http://localhost/','http://user:pass@course.example','http://course.example:8080'])assert.throws(()=>parseImportUrl(u));
 assert.throws(()=>parseImportUrl('https://evil.example',['course.example']));
 assert.equal(parseImportUrl(source,['course.example']).protocol,'http:');
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','224.1.2.3','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1'])assert.equal(publicImportAddress(ip),false,ip);
 assert.equal(publicImportAddress('93.184.216.34'),true);
});
test('re-encoding rejects active content and corrupt images and strips metadata',async()=>{
 await assert.rejects(normalizeImportedImage(Buffer.from('<svg><script/></svg>')),/Only JPEG/);
 await assert.rejects(normalizeImportedImage(Buffer.from([255,216,255,0])));
 const input=await sharp({create:{width:2000,height:1000,channels:3,background:'green'}}).withMetadata({exif:{IFD0:{Artist:'private metadata'}}}).png().toBuffer();
 const output=await normalizeImportedImage(input),meta=await sharp(output).metadata();assert.equal(meta.format,'jpeg');assert.equal(meta.width,1600);assert.equal(meta.exif,undefined);
});
test('HTTP import verifies exact official reference and stores only optimized bytes in private namespace',async t=>{
 const calls=storage(t);const bytes=await sharp({create:{width:100,height:100,channels:3,background:'green'}}).png().toBuffer();
 const requests=[];const fetchResource=async(url)=>{requests.push(url);return {url,buffer:url===source?Buffer.from('<img src="range.png">'):bytes};};
 await importOfficialPhoto({id,imageUrl:image,sourceUrl:source,listing:{official_website:source},fetchResource});
 assert.deepEqual(requests,[source,image]);const upload=calls.find(x=>x.path.includes('/object/review-photos/'));assert.match(upload.path,/venue-imports\/aaaaaaaa/);assert.equal(upload.headers['Content-Type'],'image/jpeg');assert.equal((await sharp(upload.body).metadata()).format,'jpeg');
 await assert.rejects(importOfficialPhoto({id,imageUrl:source+'unreferenced.png',sourceUrl:source,listing:{official_website:source},fetchResource}),/not referenced/);
});
test('public storage is refused before upload',async t=>{
 const calls=storage(t,{isPublic:true});const bytes=await sharp({create:{width:10,height:10,channels:3,background:'green'}}).png().toBuffer();
 await assert.rejects(importOfficialPhoto({id,imageUrl:image,sourceUrl:source,listing:{official_website:source},fetchResource:async url=>({url,buffer:url===source?Buffer.from('<img src="range.png">'):bytes})}),/private review-photos/);
 assert.equal(calls.some(x=>x.path.includes('/object/')),false);
});
test('private image display uses short-lived HTTPS URL and original path cannot escape namespace',async t=>{
 const calls=storage(t);assert.match(await displayPhotoUrl(row),/^https:\/\/storage.example/);assert.equal(JSON.parse(calls[0].body).expiresIn,900);assert.throws(()=>importedPhotoPath('../other'));
});
async function get(query){const res={setHeader(){},status(n){this.code=n;return this;},json(x){this.body=x;return this;}};await venuePhotos({method:'GET',query,headers:{authorization:'Bearer test'}},res);return res;}
test('players cannot obtain pending imports or their signed URLs',async t=>{
 const calls=storage(t,{role:'player'});assert.equal((await get({listing_id:'listing-a',view:'pending'})).code,403);
 const normal=await get({listing_id:'listing-a'});assert.deepEqual(normal.body.photos,[]);assert.equal(calls.some(x=>x.path.includes('/object/sign/')),false);
});
test('admin review receives secure preview plus original source',async t=>{
 storage(t);const res=await get({listing_id:'listing-a',view:'pending'});assert.equal(res.code,200);assert.match(res.body.photos[0].image_url,/^https:/);assert.equal(res.body.photos[0].original_image_url,image);assert.equal(res.body.photos[0].source_url,source);
});

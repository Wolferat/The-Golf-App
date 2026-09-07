import test from 'node:test';
import assert from 'node:assert/strict';
import admin from '../api/admin.js';
import proposals from '../api/proposals.js';
import venuePhotos from '../api/venue-photos.js';
import {stageListingPhotos,preparePhotoApproval} from '../lib/photo-approval.js';
const listing={id:'listing-a',title:'Test fixture',kind:'charity',status:'pending',official_website:'https://course.example',source_url:'https://course.example/event',city:'Test city'};
const candidate=(id,status='pending',parent='listing-a')=>({id,listing_id:parent,image_url:`https://course.example/${id}.jpg`,source_url:'https://course.example/gallery',status});
function environment(t,{photos=[],status='pending',role='admin',failPhotoWrite=false,proposal=null}={}){
 const old={...process.env};for(const name of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY'])process.env[name]=name==='SUPABASE_URL'?'https://db.example':'test-only';
 const db={listings:[{...listing,status}],venue_photos:structuredClone(photos),listing_proposals:proposal?[proposal]:[],listing_audit:[]},writes=[];
 t.mock.method(globalThis,'fetch',async(input,options={})=>{
  const url=new URL(input),method=options.method||'GET';
  if(url.pathname==='/auth/v1/user')return Response.json({id:'admin-a'});
  if(url.pathname==='/rest/v1/profiles')return Response.json([{id:'admin-a',role}]);
  if(url.hostname==='api.openai.com')return Response.json({output_text:JSON.stringify({photos:[{url:'https://course.example/ai.jpg',source_url:'https://course.example/gallery'}]})});
  assert.equal(url.hostname,'db.example','Unexpected external request');
  const table=url.pathname.split('/').at(-1);if(!db[table])throw Error('Unhandled table '+table);
  const filter=row=>[...url.searchParams].every(([key,value])=>!['id','listing_id','status'].includes(key)||value.startsWith('eq.')?(!['id','listing_id','status'].includes(key)||String(row[key])===value.slice(3)):value.startsWith('in.(')?value.slice(4,-1).split(',').includes(row[key]):true);
  if(method==='GET')return Response.json(db[table].filter(filter));
  const body=JSON.parse(options.body);writes.push({table,method,body});
  if(table==='venue_photos'&&method==='PATCH'&&failPhotoWrite)return Response.json({message:'simulated failure'},{status:503});
  if(method==='POST'){const row={id:'new-'+db[table].length,...body};db[table].push(row);return Response.json([row]);}
  if(method==='PATCH'){const rows=db[table].filter(filter);rows.forEach(row=>Object.assign(row,body));return Response.json(rows);}
  throw Error('Unhandled method '+method);
 });
 t.after(()=>{for(const name of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY'])if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name];});
 return {db,writes};
}
async function call(handler,body,method='POST',query={}){const res={status(n){this.code=n;return this;},json(value){this.body=value;return this;},setHeader(){}};await handler({method,query,headers:{authorization:'Bearer test-only'},body},res);return res;}
test('research photos are staged privately with duplicate and rejection reasons',async t=>{
 const {db}=environment(t,{photos:[candidate('existing')]});
 const result=await stageListingPhotos({listing,adminId:'admin-a',photos:[{url:'https://course.example/new.jpg',source_url:'https://course.example/gallery'},{url:'https://course.example/existing.jpg'},{url:'https://lh3.googleusercontent.com/photo.jpg',source_url:'https://course.example/gallery'}]});
 assert.equal(result.saved.length,1);assert.equal(result.saved[0].status,'pending');assert.deepEqual(result.omitted.map(x=>x.reason),['already_pending','blocked_host']);assert.equal(db.listings[0].status,'pending');
});
test('selection rejects another listing photo and exceeding the public limit',async t=>{
 environment(t,{photos:[candidate('foreign','pending','other'),...['one','two','three'].map(id=>candidate(id,'approved')),candidate('extra')]});
 await assert.rejects(preparePhotoApproval(listing,['foreign']),/unavailable/);await assert.rejects(preparePhotoApproval(listing,['extra']),/three approved/);
});
test('pending listing approval requires explicit photo review',async t=>{
 const {writes}=environment(t);const res=await call(admin,{id:listing.id,action:'approve'});assert.equal(res.code,409);assert.equal(writes.length,0);
 const update=await call(admin,{id:listing.id,action:'update',listing:{status:'approved'}});assert.equal(update.code,409);assert.equal(writes.length,0);
});
test('listing publication approves only selected photos after validating ownership',async t=>{
 const {db}=environment(t,{photos:[candidate('selected'),candidate('unselected')]});
 const res=await call(admin,{id:listing.id,action:'approve',photo_reviewed:true,photo_ids:['selected']});assert.equal(res.code,200);assert.equal(db.listings[0].status,'approved');assert.deepEqual(db.venue_photos.map(x=>x.status),['approved','pending']);
});
test('invalid selection makes no listing or photo changes',async t=>{
 const {writes}=environment(t,{photos:[candidate('foreign','pending','other')]});
 const res=await call(admin,{id:listing.id,action:'approve',photo_reviewed:true,photo_ids:['foreign']});assert.equal(res.code,400);assert.equal(writes.length,0);
});
test('photo-free publication is an explicit supported decision',async t=>{
 const {db}=environment(t);const res=await call(admin,{id:listing.id,action:'approve',photo_reviewed:true,photo_ids:[]});assert.equal(res.code,200);assert.equal(db.listings[0].status,'approved');
});
test('a photo write failure reports partial completion and leaves photos pending',async t=>{
 const {db}=environment(t,{photos:[candidate('selected')],failPhotoWrite:true});
 const res=await call(admin,{id:listing.id,action:'approve',photo_reviewed:true,photo_ids:['selected']});assert.equal(res.code,502);assert.match(res.body.error,/listing was saved/);assert.equal(db.venue_photos[0].status,'pending');
});
test('applying AI research queues selected photos instead of adding public gallery photos',async t=>{
 const {db}=environment(t,{status:'approved',proposal:{id:'proposal-a',listing_id:listing.id,kind:'enrichment',status:'pending',payload:{fields:{title:{value:'Unselected title'}},photos:[{url:'https://course.example/first.jpg'},{url:'https://course.example/second.jpg'}]}}});
 const res=await call(proposals,{id:'proposal-a',action:'apply',fields:[],photos:true,photo_indices:[1]});assert.equal(res.code,200);assert.equal(db.venue_photos.length,1);assert.equal(db.venue_photos[0].image_url,'https://course.example/second.jpg');assert.equal(db.venue_photos[0].status,'pending');assert.equal(db.listings[0].title,listing.title);assert.equal(db.listings[0].photos,undefined);
});
test('bulk discovery no longer auto-publishes photos',async t=>{
 const {db}=environment(t,{status:'approved'});const res=await call(venuePhotos,{listing_id:listing.id,action:'find_and_autoapprove_for_backfill'});assert.equal(res.code,200);assert.equal(res.body.approved,0);assert.equal(res.body.pending,1);assert.equal(db.venue_photos[0].status,'pending');
});
test('photo discovery and private review work before a charity listing is approved',async t=>{
 const {db}=environment(t);const res=await call(venuePhotos,{listing_id:listing.id,action:'find'});assert.equal(res.code,200);assert.equal(db.venue_photos[0].status,'pending');
 const review=await call(venuePhotos,null,'GET',{listing_id:listing.id,view:'pending'});assert.equal(review.code,200);assert.equal(review.body.photos.length,1);
 const approve=await call(venuePhotos,{photo_id:db.venue_photos[0].id,action:'approve'});assert.equal(approve.code,409);
});
test('players cannot stage photos, approve selections, or publish listings',async t=>{
 const {writes}=environment(t,{role:'player'});for(const [handler,body] of [[admin,{id:listing.id,action:'approve',photo_reviewed:true}],[venuePhotos,{action:'stage',listing_id:listing.id,photos:[]}],[venuePhotos,{action:'approve_selection',listing_id:listing.id,photo_ids:[]}]])assert.equal((await call(handler,body)).code,403);assert.equal(writes.length,0);
});

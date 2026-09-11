import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/player.js';
for(const view of ['me','venue'])test(`authenticated player ${view} loads round data`,async()=>{
 const previous=globalThis.fetch;
 const env={SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_ANON_KEY:process.env.SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY};
 Object.assign(process.env,{SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test'});
 const requested=[];
 globalThis.fetch=async(url)=>{
  requested.push(String(url));
  const value=String(url).endsWith('/auth/v1/user')?{id:'player-123'}:String(url).includes('/profiles?')?[{id:'player-123',role:'admin'}]:String(url).includes('/listings?')?[{id:'venue-123',kind:'course',status:'approved',title:'Test course'}]:String(url).includes('/rounds?')?[{id:'round-123',score:80,holes:18,par:72}]:[];
  return {ok:true,json:async()=>value};
 };
 const res={status(n){this.code=n;return this},json(body){this.body=body;return this}};
 try{
  await handler({method:'GET',headers:{authorization:'Bearer test'},query:{view,listing_id:'venue-123'}},res);
  assert.equal(res.code,200,JSON.stringify(res.body));
  assert.ok(requested.some(u=>u.includes('rounds?player_id=eq.player-123')));
  assert.equal(res.body.stats.rounds,1);
  if(view==='venue')assert.ok(requested.some(u=>u.includes('listing_id=eq.venue-123')));
 }finally{globalThis.fetch=previous;for(const [key,value]of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

async function profileFor(token) {
  const r=await fetch(process.env.SUPABASE_URL+'/rest/v1/profiles?select=id,role',{headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:'Bearer '+token}});
  return (await r.json())[0];
}
export default async function handler(req,res){
  const token=req.headers.authorization?.replace('Bearer ','');
  if(!token)return res.status(401).json({error:'Sign in required.'});
  const profile=await profileFor(token);
  if(profile?.role!=='admin')return res.status(403).json({error:'Admin access required.'});
  const url=process.env.SUPABASE_URL+'/rest/v1/app_settings?id=eq.true',headers={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY};
  if(req.method==='GET'){const r=await fetch(url+'&select=company_name,support_email,launch_boundary_name,review_mode,geofence_west,geofence_east,geofence_south,geofence_north,proximity_miles',{headers});return res.status(r.status).json({settings:(await r.json())[0]||null})}
  if(req.method!=='PUT')return res.status(405).json({error:'Method not allowed.'});
  const {company_name,support_email,launch_boundary_name,review_mode,geofence_west,geofence_east,geofence_south,geofence_north,proximity_miles}=req.body||{};
  const payload={company_name,support_email,launch_boundary_name,review_mode,updated_at:new Date().toISOString()};
  if(geofence_west!=null) Object.assign(payload,{geofence_west,geofence_east,geofence_south,geofence_north,proximity_miles});
  const r=await fetch(url,{method:'PATCH',headers:{...headers,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
  res.status(r.ok?200:502).json(r.ok?{settings:(await r.json())[0]}:{error:'Could not save company settings.'});
}

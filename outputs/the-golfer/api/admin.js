async function profileFor(token) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,role`, { headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`} });
  const [profile] = await response.json(); return profile;
}
export default async function handler(req,res) {
  const token=req.headers.authorization?.replace('Bearer ','');
  if(!token) return res.status(401).json({error:'Sign in required.'});
  const profile=await profileFor(token);
  if(profile?.role!=='admin') return res.status(403).json({error:'Admin access required.'});
  const base=process.env.SUPABASE_URL+'/rest/v1/listings',headers={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`};
  if(req.method==='GET'){const r=await fetch(base+'?status=in.(pending,approved)&select=id,title,kind,city,source_name,source_url,starts_at,status,created_at,reviewed_at&order=created_at.desc',{headers});return res.status(r.status).json({listings:await r.json()})}
  const {id,action}=req.body||{};if(!id||!['approve','reject'].includes(action))return res.status(400).json({error:'Invalid review action.'});
  const r=await fetch(base+'?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{...headers,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({status:action==='approve'?'approved':'rejected',reviewed_by:profile.id,reviewed_at:new Date().toISOString()})});res.status(r.ok?200:502).json(r.ok?{ok:true}:{error:'Review update failed.'});
}

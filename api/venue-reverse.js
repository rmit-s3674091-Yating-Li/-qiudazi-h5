const SUPABASE_URL=process.env.VITE_SUPABASE_URL||"https://rtmjzmgrhifjzxaliltm.supabase.co";
const SUPABASE_ANON_KEY=process.env.VITE_SUPABASE_ANON_KEY||"sb_publishable_vM47k7tVER77x3bpGSkDdw_dowVImzn";
function value(v){return Array.isArray(v)?v[0]:typeof v==="string"?v:"";}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET"){res.status(405).json({error:"METHOD_NOT_ALLOWED"});return;}
  const authorization=typeof req.headers.authorization==="string"?req.headers.authorization:"";
  if(!authorization.startsWith("Bearer ")||!SUPABASE_ANON_KEY){res.status(401).json({error:"AUTH_REQUIRED"});return;}
  try{
    const authResponse=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_ANON_KEY,Authorization:authorization}});
    if(!authResponse.ok){res.status(401).json({error:"AUTH_REQUIRED"});return;}
  }catch{res.status(503).json({error:"AUTH_CHECK_UNAVAILABLE"});return;}
  const location=value(req.query?.location).trim();
  if(!/^[-+]?\d{1,2}(?:\.\d+)?,[-+]?\d{1,3}(?:\.\d+)?$/.test(location)){res.status(400).json({error:"INVALID_LOCATION"});return;}
  const ak=(process.env.BAIDU_MAP_AK||"").trim();
  if(!ak){res.status(503).json({error:"BAIDU_MAP_AK_MISSING"});return;}
  const params=new URLSearchParams({location,coordtype:"wgs84ll",output:"json",extensions_poi:"1",ak});
  try{
    const upstream=await fetch(`https://api.map.baidu.com/reverse_geocoding/v3/?${params.toString()}`,{headers:{"User-Agent":"qiudazi-h5/1.0"}});
    const body=await upstream.json();
    if(!upstream.ok){res.status(502).json({error:"BAIDU_REVERSE_HTTP_ERROR"});return;}
    res.status(200).json(body);
  }catch{res.status(502).json({error:"BAIDU_REVERSE_NETWORK_ERROR"});}
}

const SUPABASE_URL=process.env.VITE_SUPABASE_URL||"https://rtmjzmgrhifjzxaliltm.supabase.co";
const SUPABASE_ANON_KEY=process.env.VITE_SUPABASE_ANON_KEY||"";

function value(v){return Array.isArray(v)?v[0]:typeof v==="string"?v:"";}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET"){res.status(405).json({error:"METHOD_NOT_ALLOWED"});return;}
  const authorization=typeof req.headers.authorization==="string"?req.headers.authorization:"";
  if(!authorization.startsWith("Bearer ")||!SUPABASE_ANON_KEY){res.status(401).json({error:"AUTH_REQUIRED"});return;}
  try{
    const authResponse=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_ANON_KEY,Authorization:authorization}});
    if(!authResponse.ok){res.status(401).json({error:"AUTH_REQUIRED"});return;}
  }catch{
    res.status(503).json({error:"AUTH_CHECK_UNAVAILABLE"});return;
  }
  const query=value(req.query?.query).trim();
  const region=value(req.query?.region).trim()||"全国";
  if(!query||query.length>120||region.length>60){res.status(400).json({error:"INVALID_QUERY"});return;}
  const ak=(process.env.BAIDU_MAP_AK||"").trim();
  if(!ak){res.status(503).json({error:"BAIDU_MAP_AK_MISSING"});return;}
  const params=new URLSearchParams({query,region,output:"json",ak});
  try{
    const upstream=await fetch(`https://api.map.baidu.com/place/v2/search?${params.toString()}`,{headers:{"User-Agent":"qiudazi-h5/1.0"}});
    const body=await upstream.json();
    if(!upstream.ok){res.status(502).json({error:"BAIDU_PLACE_HTTP_ERROR"});return;}
    res.status(200).json(body);
  }catch{
    res.status(502).json({error:"BAIDU_PLACE_NETWORK_ERROR"});
  }
}

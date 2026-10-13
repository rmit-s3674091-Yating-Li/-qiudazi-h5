const SUPABASE_URL=process.env.VITE_SUPABASE_URL||"https://rtmjzmgrhifjzxaliltm.supabase.co";
const SUPABASE_ANON_KEY=process.env.VITE_SUPABASE_ANON_KEY||"sb_publishable_vM47k7tVER77x3bpGSkDdw_dowVImzn";

function value(v){return Array.isArray(v)?v[0]:typeof v==="string"?v:"";}
function okResults(body){return body&&body.status===0&&Array.isArray(body.results)?body.results:[];}
function childResults(parent){
  const children=Array.isArray(parent?.children)?parent.children:[];
  return children.map(child=>({
    uid:child?.uid||undefined,
    name:[parent?.name,child?.show_name].filter(Boolean).join(" "),
    address:parent?.address||"",
    location:child?.location||parent?.location,
    province:parent?.province,
    city:parent?.city,
    district:parent?.district||parent?.area,
    area:parent?.area||parent?.district,
  })).filter(item=>item.name&&item.location);
}
function mergeResults(...groups){
  const out=[],seen=new Set();
  for(const group of groups)for(const item of group){
    if(!item||!item.name||!item.location)continue;
    const lat=Number(item.location?.lat),lng=Number(item.location?.lng);
    const key=item.uid?`uid:${item.uid}`:`${String(item.name).trim()}|${Number.isFinite(lat)?lat.toFixed(6):""}|${Number.isFinite(lng)?lng.toFixed(6):""}`;
    if(seen.has(key))continue;
    seen.add(key);out.push(item);
    for(const child of childResults(item)){
      const childLat=Number(child.location?.lat),childLng=Number(child.location?.lng);
      const childKey=child.uid?`uid:${child.uid}`:`${String(child.name).trim()}|${Number.isFinite(childLat)?childLat.toFixed(6):""}|${Number.isFinite(childLng)?childLng.toFixed(6):""}`;
      if(!seen.has(childKey)){seen.add(childKey);out.push(child);}
    }
  }
  return out.slice(0,20);
}
function queryVariants(query){
  const clean=query.trim();
  const venueWord=/(网球|球场|体育|运动|公园|中心|场馆|俱乐部|酒店|学校|大学|学院)$/u.test(clean);
  const variants=[clean];
  if(!venueWord&&clean.length>=2&&clean.length<=8){
    variants.push(`${clean}网球`,`${clean}公园`);
  }
  return [...new Set(variants)].slice(0,3);
}

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

  try{
    const variants=queryVariants(query);
    const requestPairs=variants.map(variant=>{
      const common={query:variant,region,region_limit:"true",ret_coordtype:"gcj02ll",output:"json",ak};
      const suggestionParams=new URLSearchParams(common);
      const regionParams=new URLSearchParams({...common,scope:"2",page_num:"0",page_size:"20",address_result:"false"});
      return Promise.all([
        fetch(`https://api.map.baidu.com/place/v3/suggestion?${suggestionParams.toString()}`,{headers:{"User-Agent":"qiudazi-h5/1.0"}}),
        fetch(`https://api.map.baidu.com/place/v3/region?${regionParams.toString()}`,{headers:{"User-Agent":"qiudazi-h5/1.0"}}),
      ]);
    });
    const pairs=await Promise.all(requestPairs);
    const bodies=[];
    let anyHttpOk=false;
    for(const [suggestionResponse,regionResponse] of pairs){
      if(suggestionResponse.ok||regionResponse.ok)anyHttpOk=true;
      const [suggestionBody,regionBody]=await Promise.all([
        suggestionResponse.json().catch(()=>null),
        regionResponse.json().catch(()=>null),
      ]);
      bodies.push(okResults(suggestionBody),okResults(regionBody));
    }
    if(!anyHttpOk){res.status(502).json({error:"BAIDU_PLACE_HTTP_ERROR"});return;}
    const results=mergeResults(...bodies);
    res.status(200).json({status:0,message:"ok",results,total:results.length,result_type:"poi_type",query_type:"suggestion+region",query_variants:variants});
  }catch{
    res.status(502).json({error:"BAIDU_PLACE_NETWORK_ERROR"});
  }
}

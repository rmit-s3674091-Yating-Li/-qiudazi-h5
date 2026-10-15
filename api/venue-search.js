const SUPABASE_URL=process.env.VITE_SUPABASE_URL||"https://rtmjzmgrhifjzxaliltm.supabase.co";
const SUPABASE_ANON_KEY=process.env.VITE_SUPABASE_ANON_KEY||"sb_publishable_vM47k7tVER77x3bpGSkDdw_dowVImzn";

function value(v){return Array.isArray(v)?v[0]:typeof v==="string"?v:"";}
function resultArray(body){
  if(Array.isArray(body?.results))return body.results;
  if(Array.isArray(body?.result))return body.result;
  return null;
}
function okResults(body){return body?.status===0?resultArray(body)||[]:[];}
function upstreamHealth(response,body){
  if(!response.ok)return "http";
  if(typeof body?.status==="number"&&body.status!==0)return "business";
  if(body?.status!==0||!resultArray(body))return "malformed";
  return null;
}
function validLocation(location){
  if(!location||typeof location!=="object")return false;
  const {lat,lng}=location;
  if(![lat,lng].every(v=>(typeof v==="string"||typeof v==="number")&&String(v).trim()!==""))return false;
  const latitude=Number(lat),longitude=Number(lng);
  return Number.isFinite(latitude)&&Number.isFinite(longitude)&&latitude>=-90&&latitude<=90&&longitude>=-180&&longitude<=180;
}
function childResults(parent){
  const children=Array.isArray(parent?.children)?parent.children:[];
  return children.map(child=>({
    uid:child?.uid||undefined,
    name:[parent?.name,child?.show_name||child?.name].filter(Boolean).join(" "),
    address:parent?.address||"",
    location:child?.location||parent?.location,
    province:parent?.province,
    city:parent?.city,
    district:parent?.district||parent?.area,
    area:parent?.area||parent?.district,
  })).filter(item=>item.name&&validLocation(item.location));
}
function normalizeCity(value){return String(value||"").normalize("NFKC").replace(/\s+/g,"").replace(/市$/u,"");}
function inRequestedCity(item,region){
  const expected=normalizeCity(region);
  if(!expected||expected==="全国")return true;
  const city=normalizeCity(item.city);
  if(city)return city===expected;
  const province=normalizeCity(item.province);
  if(["北京","上海","天津","重庆"].includes(expected)&&province===expected)return true;
  const address=String(item.address||"").normalize("NFKC").replace(/\s+/g,"");
  return address.includes(`${expected}市`)||address.includes(`${expected}自治州`);
}
function mergeResults(region,...groups){
  const out=[],seen=new Set();
  for(const group of groups)for(const item of group){
    if(!item||!item.name||!validLocation(item.location)||!inRequestedCity(item,region))continue;
    const lat=Number(item.location?.lat),lng=Number(item.location?.lng);
    const key=item.uid?`uid:${item.uid}`:`${String(item.name).trim()}|${lat.toFixed(6)}|${lng.toFixed(6)}`;
    if(seen.has(key))continue;
    seen.add(key);out.push(item);
    for(const child of childResults(item)){
      const childLat=Number(child.location?.lat),childLng=Number(child.location?.lng);
      const childKey=child.uid?`uid:${child.uid}`:`${String(child.name).trim()}|${childLat.toFixed(6)}|${childLng.toFixed(6)}`;
      if(!seen.has(childKey)&&validLocation(child.location)&&inRequestedCity(child,region)){seen.add(childKey);out.push(child);}
    }
  }
  return out.slice(0,20);
}
function hasMalformedLocations(region,groups){
  return groups.some(group=>group.some(item=>item?.name&&inRequestedCity(item,region)&&!validLocation(item.location)));
}
function queryVariants(query){
  const clean=query.trim();
  const variants=[clean];
  const aliases={奥森:["奥林匹克森林公园","奥森网球"],绿心:["城市绿心","绿心网球"],国家网球:["国家网球中心"]};
  for(const alias of aliases[clean]||[])variants.push(alias);
  const venueWord=/(网球|球场|体育|运动|公园|中心|场馆|俱乐部|酒店|学校|大学|学院)$/u.test(clean);
  if(!venueWord&&clean.length>=2&&clean.length<=8)variants.push(`${clean}网球`,`${clean}公园`);
  return [...new Set(variants)].slice(0,5);
}
async function readJson(response){return response.json().catch(()=>null);}
async function baiduV3(variant,region,ak){
  const common={query:variant,region,region_limit:"true",ret_coordtype:"gcj02ll",output:"json",ak};
  const suggestionParams=new URLSearchParams(common);
  const regionParams=new URLSearchParams({...common,scope:"2",page_num:"0",page_size:"20",address_result:"false"});
  const [suggestionResponse,regionResponse]=await Promise.all([
    fetch(`https://api.map.baidu.com/place/v3/suggestion?${suggestionParams.toString()}`,{headers:{"User-Agent":"qiudazi-h5/1.0"}}),
    fetch(`https://api.map.baidu.com/place/v3/region?${regionParams.toString()}`,{headers:{"User-Agent":"qiudazi-h5/1.0"}}),
  ]);
  const [suggestionBody,regionBody]=await Promise.all([readJson(suggestionResponse),readJson(regionResponse)]);
  return {results:[...okResults(suggestionBody),...okResults(regionBody)],statuses:[suggestionBody?.status,regionBody?.status],health:[upstreamHealth(suggestionResponse,suggestionBody),upstreamHealth(regionResponse,regionBody)]};
}
async function baiduV2(variant,region,ak){
  const suggestionParams=new URLSearchParams({query:variant,region,city_limit:"true",output:"json",ak});
  const searchParams=new URLSearchParams({query:variant,region,city_limit:"true",scope:"2",page_num:"0",page_size:"20",output:"json",ak});
  const [suggestionResponse,searchResponse]=await Promise.all([
    fetch(`https://api.map.baidu.com/place/v2/suggestion?${suggestionParams.toString()}`,{headers:{"User-Agent":"qiudazi-h5/1.0"}}),
    fetch(`https://api.map.baidu.com/place/v2/search?${searchParams.toString()}`,{headers:{"User-Agent":"qiudazi-h5/1.0"}}),
  ]);
  const [suggestionBody,searchBody]=await Promise.all([readJson(suggestionResponse),readJson(searchResponse)]);
  return {results:[...okResults(suggestionBody),...okResults(searchBody)],statuses:[suggestionBody?.status,searchBody?.status],health:[upstreamHealth(suggestionResponse,suggestionBody),upstreamHealth(searchResponse,searchBody)]};
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
    const variants=queryVariants(query),groups=[],statuses=[],health=[];
    for(const variant of variants){
      const primary=await baiduV3(variant,region,ak);
      statuses.push(...primary.statuses);health.push(...primary.health);
      if(primary.results.length)groups.push(primary.results);
      if(!primary.results.length){
        const fallback=await baiduV2(variant,region,ak);
        statuses.push(...fallback.statuses);health.push(...fallback.health);
        if(fallback.results.length)groups.push(fallback.results);
      }
    }
    const results=mergeResults(region,...groups);
    const malformedCoordinates=hasMalformedLocations(region,groups);
    const nonZero=statuses.filter(status=>Number.isFinite(Number(status))&&Number(status)!==0).map(Number);
    if(!results.length){
      if(nonZero.length){res.status(502).json({error:"BAIDU_PLACE_UPSTREAM_ERROR",upstream_statuses:[...new Set(nonZero)].slice(0,4)});return;}
      if(health.includes("http")){res.status(502).json({error:"BAIDU_PLACE_HTTP_ERROR"});return;}
      if(health.includes("malformed")||malformedCoordinates){res.status(502).json({error:"BAIDU_PLACE_INVALID_RESPONSE"});return;}
    }
    res.status(200).json({status:0,message:"ok",results,total:results.length,result_type:"poi_type",query_type:"suggestion+region",query_variants:variants});
  }catch{
    res.status(502).json({error:"BAIDU_PLACE_NETWORK_ERROR"});
  }
}

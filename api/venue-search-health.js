export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(process.env.VERCEL_ENV!=="preview"){res.status(404).json({error:"NOT_FOUND"});return;}
  if(req.method!=="GET"){res.status(405).json({error:"METHOD_NOT_ALLOWED"});return;}
  const ak=(process.env.BAIDU_MAP_AK||"").trim();
  if(!ak){res.status(200).json({configured:false,upstream_ok:false,error:"BAIDU_MAP_AK_MISSING"});return;}
  const params=new URLSearchParams({
    query:"北投网球运动中心",
    region:"北京",
    region_limit:"true",
    ret_coordtype:"gcj02ll",
    page_size:"5",
    output:"json",
    ak
  });
  try{
    const upstream=await fetch(`https://api.map.baidu.com/place/v3/region?${params.toString()}`,{headers:{"User-Agent":"qiudazi-h5/1.0"}});
    const body=await upstream.json();
    const results=Array.isArray(body?.results)?body.results.slice(0,3).map(item=>({
      name:typeof item?.name==="string"?item.name:null,
      address:typeof item?.address==="string"?item.address:null,
      uid:typeof item?.uid==="string"?item.uid:null,
      location:item?.location&&Number.isFinite(Number(item.location.lat))&&Number.isFinite(Number(item.location.lng))?{lat:Number(item.location.lat),lng:Number(item.location.lng)}:null
    })):[];
    res.status(200).json({
      configured:true,
      http_ok:upstream.ok,
      upstream_status:body?.status??null,
      upstream_message:body?.message??null,
      result_count:results.length,
      results
    });
  }catch(error){
    res.status(200).json({configured:true,upstream_ok:false,error:"BAIDU_PLACE_NETWORK_ERROR"});
  }
}

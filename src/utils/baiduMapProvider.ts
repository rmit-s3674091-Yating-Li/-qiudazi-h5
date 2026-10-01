import type {MapProvider,VenueCoordinates,VenuePlace} from "./mapProvider.ts";

type FetchLike=(input:string,init?:RequestInit)=>Promise<{ok:boolean;json():Promise<unknown>}>;
type BaiduPlace={uid?:unknown;name?:unknown;address?:unknown;location?:{lat?:unknown;lng?:unknown}};
type BaiduResponse={status?:unknown;message?:unknown;results?:unknown};

export interface BaiduMapProviderOptions{ak?:string;fetchImpl?:FetchLike;region?:string}

function outOfChina(lat:number,lng:number){return lng<72.004||lng>137.8347||lat<0.8293||lat>55.8271}
function transformLat(x:number,y:number){let ret=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));ret+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3;ret+=(20*Math.sin(y*Math.PI)+40*Math.sin(y/3*Math.PI))*2/3;ret+=(160*Math.sin(y/12*Math.PI)+320*Math.sin(y*Math.PI/30))*2/3;return ret}
function transformLng(x:number,y:number){let ret=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));ret+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3;ret+=(20*Math.sin(x*Math.PI)+40*Math.sin(x/3*Math.PI))*2/3;ret+=(150*Math.sin(x/12*Math.PI)+300*Math.sin(x/30*Math.PI))*2/3;return ret}
function gcj02ToWgs84(lat:number,lng:number){
  if(outOfChina(lat,lng))return {lat,lng};
  const a=6378245,ee=.00669342162296594323,dLat=transformLat(lng-105,lat-35),dLng=transformLng(lng-105,lat-35),radLat=lat/180*Math.PI;
  let magic=Math.sin(radLat);magic=1-ee*magic*magic;const sqrtMagic=Math.sqrt(magic);
  const mgLat=lat+(dLat*180)/((a*(1-ee))/(magic*sqrtMagic)*Math.PI);
  const mgLng=lng+(dLng*180)/(a/sqrtMagic*Math.cos(radLat)*Math.PI);
  return {lat:lat*2-mgLat,lng:lng*2-mgLng};
}

function normalizePlace(value:BaiduPlace):VenuePlace|null{
  const rawLat=Number(value.location?.lat),rawLng=Number(value.location?.lng);
  if(typeof value.name!=="string"||!value.name.trim()||typeof value.address!=="string"||!Number.isFinite(rawLat)||rawLat < -90||rawLat > 90||!Number.isFinite(rawLng)||rawLng < -180||rawLng > 180)return null;
  const converted=gcj02ToWgs84(rawLat,rawLng);
  return {name:value.name.trim(),address:value.address.trim(),latitude:converted.lat,longitude:converted.lng,provider:"baidu",placeId:typeof value.uid==="string"&&value.uid?value.uid:null};
}

export function createBaiduMapProvider(options:BaiduMapProviderOptions={}):MapProvider{
  const ak=options.ak?.trim()||"",fetchImpl=options.fetchImpl??globalThis.fetch?.bind(globalThis),region=options.region?.trim()||"全国";
  return {
    getCurrentPosition(){return new Promise<VenueCoordinates>((resolve,reject)=>{if(typeof navigator==="undefined"||!navigator.geolocation){reject(new Error("GEOLOCATION_UNAVAILABLE"));return;}navigator.geolocation.getCurrentPosition(position=>resolve({latitude:position.coords.latitude,longitude:position.coords.longitude,provider:"device_geolocation",placeId:null}),()=>reject(new Error("GEOLOCATION_DENIED")),{enableHighAccuracy:false,timeout:10000,maximumAge:60000});});},
    async searchPlaces(query){
      const keyword=query.trim();if(!keyword)return [];
      if(!ak)throw new Error("BAIDU_MAP_AK_MISSING");if(!fetchImpl)throw new Error("PLACE_SEARCH_UNAVAILABLE");
      const params=new URLSearchParams({query:keyword,region,output:"json",ak});
      const response=await fetchImpl(`https://api.map.baidu.com/place/v2/search?${params.toString()}`);
      if(!response.ok)throw new Error("BAIDU_PLACE_HTTP_ERROR");
      const body=await response.json() as BaiduResponse;
      if(body.status!==0)throw new Error(`BAIDU_PLACE_ERROR:${String(body.status??"UNKNOWN")}`);
      return Array.isArray(body.results)?body.results.map(item=>normalizePlace(item as BaiduPlace)).filter((item):item is VenuePlace=>item!==null):[];
    },
  async reverseGeocode(){throw new Error("REVERSE_GEOCODE_PROVIDER_UNAVAILABLE");},
    externalMapUrl({latitude,longitude,name}){
      if(!Number.isFinite(latitude)||latitude < -90||latitude > 90||!Number.isFinite(longitude)||longitude < -180||longitude > 180)throw new Error("VENUE_COORDINATES");
      const destination=name?.trim()?`name:${name.trim()}|latlng:${latitude},${longitude}`:`latlng:${latitude},${longitude}`;
      return `https://api.map.baidu.com/marker?location=${encodeURIComponent(`${latitude},${longitude}`)}&title=${encodeURIComponent(name?.trim()||"场地")}&content=${encodeURIComponent(destination)}&output=html`;
    },
  externalDirectionsUrl({latitude,longitude,name}){if(!Number.isFinite(latitude)||!Number.isFinite(longitude))throw new Error("VENUE_COORDINATES");return `https://maps.apple.com/?daddr=${encodeURIComponent(latitude)},${encodeURIComponent(longitude)}&q=${encodeURIComponent((name||"Destination").trim())}&dirflg=d`;}
  };
}

export function createConfiguredBaiduMapProvider(region="全国"):MapProvider{
  const proxyFetch:FetchLike=async input=>{
    const url=new URL(input),query=url.searchParams.get("query")||"",region=url.searchParams.get("region")||"全国";
    const {supabase}=await import("../repositories/supabase.ts");
    const session=(await supabase?.auth.getSession())?.data.session;
    if(!session)throw new Error("AUTH_REQUIRED");
    const response=await fetch(`/api/venue-search?query=${encodeURIComponent(query)}&region=${encodeURIComponent(region)}`,{
      headers:{Authorization:`Bearer ${session.access_token}`}
    });
    if(response.status===401)throw new Error("AUTH_REQUIRED");
    return {ok:response.ok,json:()=>response.json()};
  };
  return createBaiduMapProvider({ak:"server-proxy",fetchImpl:proxyFetch,region});
}

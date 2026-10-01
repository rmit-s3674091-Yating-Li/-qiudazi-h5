import type {MapProvider,VenueCoordinates,VenuePlace} from "./mapProvider.ts";

type FetchLike=(input:string,init?:RequestInit)=>Promise<{ok:boolean;json():Promise<unknown>}>;
type BaiduPlace={uid?:unknown;name?:unknown;address?:unknown;location?:{lat?:unknown;lng?:unknown}};
type BaiduResponse={status?:unknown;message?:unknown;results?:unknown};

export interface BaiduMapProviderOptions{ak?:string;fetchImpl?:FetchLike;region?:string}

function normalizePlace(value:BaiduPlace):VenuePlace|null{
  const latitude=Number(value.location?.lat),longitude=Number(value.location?.lng);
  if(typeof value.name!=="string"||!value.name.trim()||typeof value.address!=="string"||!Number.isFinite(latitude)||latitude < -90||latitude > 90||!Number.isFinite(longitude)||longitude < -180||longitude > 180)return null;
  return {name:value.name.trim(),address:value.address.trim(),latitude,longitude,provider:"baidu",placeId:typeof value.uid==="string"&&value.uid?value.uid:null};
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

export function createConfiguredBaiduMapProvider():MapProvider{
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
  return createBaiduMapProvider({ak:"server-proxy",fetchImpl:proxyFetch});
}

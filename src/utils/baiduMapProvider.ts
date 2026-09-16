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
    externalMapUrl({latitude,longitude,name}){
      if(!Number.isFinite(latitude)||latitude < -90||latitude > 90||!Number.isFinite(longitude)||longitude < -180||longitude > 180)throw new Error("VENUE_COORDINATES");
      const destination=name?.trim()?`name:${name.trim()}|latlng:${latitude},${longitude}`:`latlng:${latitude},${longitude}`;
      return `https://api.map.baidu.com/marker?location=${encodeURIComponent(`${latitude},${longitude}`)}&title=${encodeURIComponent(name?.trim()||"场地")}&content=${encodeURIComponent(destination)}&output=html`;
    }
  };
}

export function createConfiguredBaiduMapProvider():MapProvider{
  return createBaiduMapProvider({ak:import.meta.env.VITE_BAIDU_MAP_AK});
}

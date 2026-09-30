export interface VenueCoordinates{latitude:number;longitude:number;provider:string;placeId?:string|null}
export interface VenuePlace extends VenueCoordinates{name:string;address:string}
export interface MapProvider{
  getCurrentPosition():Promise<VenueCoordinates>;
  searchPlaces(query:string):Promise<VenuePlace[]>;
  reverseGeocode(location:{latitude:number;longitude:number},language?:string):Promise<VenuePlace|null>;
  externalMapUrl(location:{latitude:number;longitude:number;name?:string|null}):string
}
function valid(latitude:number,longitude:number){return Number.isFinite(latitude)&&latitude>=-90&&latitude<=90&&Number.isFinite(longitude)&&longitude>=-180&&longitude<=180}
export function hasVenueCoordinates(value:{venue_latitude?:number|null;venue_longitude?:number|null}){return value.venue_latitude!==null&&value.venue_latitude!==undefined&&value.venue_longitude!==null&&value.venue_longitude!==undefined&&valid(value.venue_latitude,value.venue_longitude)}
export const browserMapProvider:MapProvider={
  getCurrentPosition(){return new Promise((resolve,reject)=>{if(typeof navigator==="undefined"||!navigator.geolocation){reject(new Error("GEOLOCATION_UNAVAILABLE"));return;}navigator.geolocation.getCurrentPosition(position=>resolve({latitude:position.coords.latitude,longitude:position.coords.longitude,provider:"device_geolocation",placeId:null}),()=>reject(new Error("GEOLOCATION_DENIED")),{enableHighAccuracy:false,timeout:10000,maximumAge:60000});});},
  async searchPlaces(query){
    const q=query.trim();if(!q)return [];
    const url=new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format","jsonv2");
    url.searchParams.set("q",q);
    url.searchParams.set("limit","5");
    url.searchParams.set("addressdetails","1");
    const response=await fetch(url.toString(),{headers:{Accept:"application/json"}});
    if(!response.ok)throw new Error("PLACE_SEARCH_PROVIDER_UNAVAILABLE");
    const data=await response.json() as any[];
    return data.map(item=>({
      latitude:Number(item.lat),longitude:Number(item.lon),provider:"openstreetmap_nominatim",
      placeId:item.place_id!=null?String(item.place_id):null,
      name:(typeof item.name==="string"&&item.name.trim())?item.name.trim():String(item.display_name||"").split(",")[0].trim(),
      address:String(item.display_name||"").trim()
    })).filter(item=>valid(item.latitude,item.longitude)&&item.address);
  },
  async reverseGeocode({latitude,longitude},language="zh-CN"){
    if(!valid(latitude,longitude))throw new Error("VENUE_COORDINATES");
    const url=new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format","jsonv2");
    url.searchParams.set("lat",String(latitude));
    url.searchParams.set("lon",String(longitude));
    url.searchParams.set("zoom","18");
    url.searchParams.set("addressdetails","1");
    url.searchParams.set("accept-language",language);
    const response=await fetch(url.toString(),{headers:{Accept:"application/json"}});
    if(!response.ok)throw new Error("REVERSE_GEOCODE_UNAVAILABLE");
    const data=await response.json() as any;
    const address=typeof data?.display_name==="string"?data.display_name.trim():"";
    const a=data?.address||{};
    const name=[data?.name,a.amenity,a.leisure,a.building,a.shop,a.tourism,a.road,address.split(",")[0]].find(v=>typeof v==="string"&&v.trim())?.trim()||"";
    if(!address&&!name)return null;
    return {latitude,longitude,provider:"openstreetmap_nominatim",placeId:data?.place_id!=null?String(data.place_id):null,name:name||address,address:address||name};
  },
  externalMapUrl({latitude,longitude}){if(!valid(latitude,longitude))throw new Error("VENUE_COORDINATES");return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=17/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`;}
};

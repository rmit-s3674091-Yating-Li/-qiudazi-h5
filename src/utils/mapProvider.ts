export interface VenueCoordinates{latitude:number;longitude:number;provider:string;placeId?:string|null}
export interface VenuePlace extends VenueCoordinates{name:string;address:string}
export interface MapProvider{getCurrentPosition():Promise<VenueCoordinates>;searchPlaces(query:string):Promise<VenuePlace[]>;externalMapUrl(location:{latitude:number;longitude:number;name?:string|null}):string}
function valid(latitude:number,longitude:number){return Number.isFinite(latitude)&&latitude>=-90&&latitude<=90&&Number.isFinite(longitude)&&longitude>=-180&&longitude<=180}
export function hasVenueCoordinates(value:{venue_latitude?:number|null;venue_longitude?:number|null}){return value.venue_latitude!==null&&value.venue_latitude!==undefined&&value.venue_longitude!==null&&value.venue_longitude!==undefined&&valid(value.venue_latitude,value.venue_longitude)}
export const browserMapProvider:MapProvider={
  getCurrentPosition(){return new Promise((resolve,reject)=>{if(typeof navigator==="undefined"||!navigator.geolocation){reject(new Error("GEOLOCATION_UNAVAILABLE"));return;}navigator.geolocation.getCurrentPosition(position=>resolve({latitude:position.coords.latitude,longitude:position.coords.longitude,provider:"device_geolocation",placeId:null}),()=>reject(new Error("GEOLOCATION_DENIED")),{enableHighAccuracy:false,timeout:10000,maximumAge:60000});});},
  async searchPlaces(){throw new Error("PLACE_SEARCH_PROVIDER_UNAVAILABLE");},
  externalMapUrl({latitude,longitude}){if(!valid(latitude,longitude))throw new Error("VENUE_COORDINATES");return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=17/${encodeURIComponent(latitude)}/${encodeURIComponent(longitude)}`;}
};

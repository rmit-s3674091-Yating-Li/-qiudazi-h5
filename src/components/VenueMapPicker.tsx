import { useEffect, useRef, useState } from "react";
import { browserMapProvider, type VenuePlace } from "../utils/mapProvider";
import { createConfiguredBaiduMapProvider } from "../utils/baiduMapProvider";
import "../venue-v3.css";

declare global { interface Window { L?: any } }

function ensureLeaflet():Promise<any>{
  if(window.L)return Promise.resolve(window.L);
  return new Promise((resolve,reject)=>{
    if(!document.querySelector('link[data-leaflet]')){const link=document.createElement("link");link.rel="stylesheet";link.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";link.dataset.leaflet="1";document.head.appendChild(link);}
    const existing=document.querySelector('script[data-leaflet]') as HTMLScriptElement|null;
    const done=()=>window.L?resolve(window.L):reject(new Error("MAP_LOAD_FAILED"));
    if(existing){existing.addEventListener("load",done,{once:true});existing.addEventListener("error",()=>reject(new Error("MAP_LOAD_FAILED")),{once:true});return;}
    const script=document.createElement("script");script.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";script.async=true;script.dataset.leaflet="1";script.onload=done;script.onerror=()=>reject(new Error("MAP_LOAD_FAILED"));document.head.appendChild(script);
  });
}

type PickedPlace=Pick<VenuePlace,"name"|"address"|"provider"|"placeId">;
function hasHan(value:string){return /[\u3400-\u9fff]/.test(value)}

export function VenueMapPicker({initialLatitude,initialLongitude,initialCity,initialVenueName,initialAddress,language,onClose,onConfirm}:{initialLatitude?:number|null;initialLongitude?:number|null;initialCity?:string|null;initialVenueName?:string|null;initialAddress?:string|null;language:string;onClose:()=>void;onConfirm:(lat:number,lng:number,place?:PickedPlace|null)=>void}){
  const en=language==="en",host=useRef<HTMLDivElement>(null),mapRef=useRef<any>(null),lookupTimer=useRef<number|null>(null),lookupSeq=useRef(0),dragged=useRef(false);
  const[position,setPosition]=useState<{lat:number;lng:number}|null>(initialLatitude!=null&&initialLongitude!=null?{lat:initialLatitude,lng:initialLongitude}:null);
  const[place,setPlace]=useState<PickedPlace|null>(null),[resolving,setResolving]=useState(false),[cityFallback,setCityFallback]=useState(false),[error,setError]=useState("");
  const[query,setQuery]=useState(initialVenueName||""),[results,setResults]=useState<VenuePlace[]>([]),[searching,setSearching]=useState(false),[searchOpen,setSearchOpen]=useState(false);

  function applyPlace(result:VenuePlace,zoom=16){
    const next={lat:result.latitude,lng:result.longitude};
    setPosition(next);setPlace({name:result.name,address:result.address,provider:result.provider,placeId:result.placeId});setCityFallback(false);setSearchOpen(false);setResults([]);mapRef.current?.setView([next.lat,next.lng],zoom);
  }

  async function searchPlaces(){
    const term=query.trim();if(!term)return;
    setError("");setSearching(true);
    try{
      let found:VenuePlace[]=[];
      if(!en){try{found=await createConfiguredBaiduMapProvider((initialCity||"").trim()||"全国").searchPlaces(term);}catch{}}
      if(!found.length){found=await browserMapProvider.searchPlaces(term,{language:en?"en":"zh-CN"});if(!en)found=found.filter(result=>hasHan(result.name)||hasHan(result.address));}
      setResults(found.slice(0,8));setSearchOpen(true);
    }catch{setError(en?"Search is temporarily unavailable. You can still move the map manually.":"暂时无法搜索地点，你仍可以拖动地图手动选择。");}
    finally{setSearching(false)}
  }

  function resolveReadablePlace(next:{lat:number;lng:number}){
    if(lookupTimer.current!==null)window.clearTimeout(lookupTimer.current);
    const seq=++lookupSeq.current;setResolving(true);
    lookupTimer.current=window.setTimeout(()=>{void (async()=>{
      let found:VenuePlace|null=null;
      if(!en){try{found=await createConfiguredBaiduMapProvider((initialCity||"").trim()||"全国").reverseGeocode({latitude:next.lat,longitude:next.lng},language);}catch{}}
      if(!found){try{found=await browserMapProvider.reverseGeocode({latitude:next.lat,longitude:next.lng},language);}catch{}}
      if(seq!==lookupSeq.current)return;
      if(found){setPlace({name:found.name,address:found.address,provider:found.provider,placeId:found.placeId});setQuery(q=>q||found!.name)}else setPlace(null);
    })().finally(()=>{if(seq===lookupSeq.current)setResolving(false)});},400);
  }

  useEffect(()=>{let cancelled=false;void ensureLeaflet().then(L=>{
    if(cancelled||!host.current)return;
    const fallback={lat:39.9042,lng:116.4074};
    const start=position??fallback;
    const map=L.map(host.current,{zoomControl:false}).setView([start.lat,start.lng],position?16:11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);
    map.on("dragstart",()=>{dragged.current=true;});
    map.on("moveend",()=>{if(!dragged.current)return;dragged.current=false;const c=map.getCenter(),next={lat:c.lat,lng:c.lng};setPosition(next);setCityFallback(false);setPlace(null);setSearchOpen(false);resolveReadablePlace(next);});
    mapRef.current=map;setTimeout(()=>map.invalidateSize(),0);
    if(position)resolveReadablePlace(position);
    else {
      const city=(initialCity||"").trim(),venue=(initialVenueName||"").trim(),address=(initialAddress||"").trim();
      const coreVenue=venue.replace(/(网球运动中心|网球中心|网球场|体育中心|运动中心|体育馆|运动馆|场馆)$/,"").trim();
      const venueQueries=Array.from(new Set([venue,coreVenue,coreVenue&&/奥森/.test(coreVenue)?"奥林匹克森林公园":"",coreVenue&&/奥森/.test(coreVenue)?"国家网球中心":""].filter(Boolean)));
      if(city||address||venueQueries.length){
        setResolving(true);
        void (async()=>{
          try{
            let cityResult:VenuePlace|null=null;
            if(city){const cityResults=await browserMapProvider.searchPlaces(city,{language:en?"en":"zh-CN"});if(cancelled)return;cityResult=cityResults[0]||null;}
            const bounds=cityResult?.boundingBox||undefined;
            const searchBounded=async(term:string)=>{const options=bounds?{viewbox:bounds,bounded:true,language:en?"en":"zh-CN"}:{language:en?"en":"zh-CN"};const items=await browserMapProvider.searchPlaces(term,options);if(cancelled)return [] as VenuePlace[];return en?items:items.filter(item=>hasHan(item.name)||hasHan(item.address));};
            const baiduProvider=!en&&city?createConfiguredBaiduMapProvider(city):null;
            if(address){let items:VenuePlace[]=[];if(baiduProvider){try{items=await baiduProvider.searchPlaces(address);}catch{}}if(!items.length)items=await searchBounded(address);if(items[0]){applyPlace(items[0]);return;}}
            for(const term of venueQueries){let items:VenuePlace[]=[];if(baiduProvider){try{items=await baiduProvider.searchPlaces(term);}catch{}}if(!items.length)items=await searchBounded(term);if(items[0]){const first=items[0],next={lat:first.latitude,lng:first.longitude};setPosition(next);setPlace({name:first.name,address:first.address,provider:first.provider,placeId:first.placeId});setCityFallback(term!==venue);map.setView([next.lat,next.lng],term===venue?16:14);return;}}
            if(cityResult){setPosition(null);setPlace(null);setCityFallback(true);map.setView([cityResult.latitude,cityResult.longitude],12);}
          }catch{}
        })().finally(()=>{if(!cancelled)setResolving(false)});
      }
    }
  }).catch(()=>setError(en?"Map could not be loaded.":"地图暂时无法加载。"));
  return()=>{cancelled=true;if(lookupTimer.current!==null)window.clearTimeout(lookupTimer.current);lookupSeq.current++;mapRef.current?.remove();mapRef.current=null;};},[]);

  function locate(){setError("");if(!navigator.geolocation){setError(en?"Location is unavailable.":"当前设备无法定位。");return;}navigator.geolocation.getCurrentPosition(p=>{const next={lat:p.coords.latitude,lng:p.coords.longitude};setPosition(next);setPlace(null);setCityFallback(false);setSearchOpen(false);mapRef.current?.setView([next.lat,next.lng],16);resolveReadablePlace(next);},()=>setError(en?"Location permission was not granted. You can still drag the map manually.":"未获得定位权限，你仍可以手动拖动地图选点。"),{enableHighAccuracy:false,timeout:10000,maximumAge:60000});}

  const selectedName=cityFallback?(en?"Move the map to the exact venue":"请拖动地图确认场馆"):(resolving?(en?"Finding this place…":"正在识别这个位置…"):place?.name||(position?(en?"Selected map location":"已选择地图位置"):(en?"Search or move the map":"搜索场馆，或拖动地图")));
  const selectedAddress=cityFallback?(en?"The map is centered on the event city. Search for the venue or move the map to its exact location.":"已定位到赛事城市范围。请搜索场馆，或拖动地图到准确位置。"):(resolving?(en?"Looking up a readable nearby address.":"正在获取附近可读地址。"):place?.address||(position?(en?"Address lookup is unavailable. You can still confirm this location.":"暂时无法识别这里的地址，你仍可以确认该位置。"):(en?"Search by venue name or address; you can also drag the map directly.":"可按场馆名称或地址搜索，也可以直接拖动地图。")));
  const canConfirm=!!position&&!cityFallback&&!resolving;

  return <div className="venue-map-overlay" role="dialog" aria-modal="true" aria-label={en?"Pick venue":"选择场馆"}><div className="venue-map-panel venue-picker-v2 venue-picker-v3">
    <div className="venue-picker-topbar"><button type="button" className="icon-button venue-picker-back" onClick={onClose} aria-label={en?"Back":"返回"}>‹</button><strong>{en?"Choose venue":"选择场馆"}</strong><span aria-hidden="true"/></div>
    <div className="venue-map-wrap venue-picker-map"><div ref={host} className="venue-map-canvas"/><div className="venue-map-crosshair venue-picker-pin" aria-hidden="true">●</div><button type="button" className="venue-map-locate icon-button" onClick={locate} aria-label={en?"My location":"定位到我"}>◎</button></div>
    <section className="venue-picker-sheet">
      <form className="venue-picker-search" onSubmit={e=>{e.preventDefault();void searchPlaces();}}>
        <span className="venue-picker-city">{initialCity|| (en?"City":"城市")}</span>
        <input value={query} onChange={e=>{setQuery(e.target.value);if(!e.target.value)setSearchOpen(false)}} onFocus={()=>results.length&&setSearchOpen(true)} placeholder={en?"Search venue or address":"搜索场馆 / 地址"}/>
        <button type="submit" className="secondary" disabled={searching||!query.trim()}>{searching?(en?"Searching…":"搜索中…"):(en?"Search":"搜索")}</button>
      </form>
      {searchOpen&&<div className="venue-picker-results">{results.length?results.map(result=><button type="button" key={`${result.placeId||result.name}-${result.latitude}-${result.longitude}`} className="venue-picker-result" onClick={()=>applyPlace(result)}><strong>{result.name}</strong><span>{result.address}</span></button>):<p className="muted small">{en?"No matching places found. Try a broader venue name.":"没有找到匹配地点，可以换一个更简短的场馆名称。"}</p>}</div>}
      {!searchOpen&&<div className={`venue-map-selection${position?" is-selected":""}`} aria-live="polite"><div className="venue-picker-selected-row"><span className="venue-picker-radio" aria-hidden="true">{position?"✓":"⌖"}</span><div><strong>{selectedName}</strong><p className="muted small">{selectedAddress}</p></div></div></div>}
      {error&&<p className="error-text">{error}</p>}
      <button type="button" className="full venue-picker-confirm" disabled={!canConfirm} onClick={()=>position&&canConfirm&&onConfirm(position.lat,position.lng,place)}>{en?"Confirm venue":"确认场馆"}</button>
    </section>
  </div></div>;
}

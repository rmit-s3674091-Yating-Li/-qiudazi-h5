import { useEffect, useRef, useState } from "react";
import { browserMapProvider, type VenuePlace } from "../utils/mapProvider";

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
export function VenueMapPicker({initialLatitude,initialLongitude,initialQueries,language,onClose,onConfirm}:{initialLatitude?:number|null;initialLongitude?:number|null;initialQueries?:string[];language:string;onClose:()=>void;onConfirm:(lat:number,lng:number,place?:PickedPlace|null)=>void}){
  const en=language==="en",host=useRef<HTMLDivElement>(null),mapRef=useRef<any>(null),lookupTimer=useRef<number|null>(null),lookupSeq=useRef(0);
  const[position,setPosition]=useState<{lat:number;lng:number}|null>(initialLatitude!=null&&initialLongitude!=null?{lat:initialLatitude,lng:initialLongitude}:null);
  const[place,setPlace]=useState<PickedPlace|null>(null),[resolving,setResolving]=useState(false),[error,setError]=useState("");

  function resolveReadablePlace(next:{lat:number;lng:number}){
    if(lookupTimer.current!==null)window.clearTimeout(lookupTimer.current);
    const seq=++lookupSeq.current;setResolving(true);setPlace(null);
    lookupTimer.current=window.setTimeout(()=>{void browserMapProvider.reverseGeocode({latitude:next.lat,longitude:next.lng},language).then(found=>{
      if(seq!==lookupSeq.current)return;setPlace(found?{name:found.name,address:found.address,provider:found.provider,placeId:found.placeId}:null);
    }).catch(()=>{if(seq===lookupSeq.current)setPlace(null)}).finally(()=>{if(seq===lookupSeq.current)setResolving(false)});},450);
  }

  useEffect(()=>{let cancelled=false;void ensureLeaflet().then(L=>{
    if(cancelled||!host.current)return;
    const start=position??{lat:35.8617,lng:104.1954};
    const map=L.map(host.current,{zoomControl:true}).setView([start.lat,start.lng],position?16:4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);
    map.on("moveend",()=>{const c=map.getCenter(),next={lat:c.lat,lng:c.lng};setPosition(next);resolveReadablePlace(next);});
    mapRef.current=map;setTimeout(()=>map.invalidateSize(),0);
    if(position)resolveReadablePlace(position);
    else if(initialQueries?.some(query=>query.trim())){
      setResolving(true);
      void (async()=>{
        for(const query of initialQueries.map(value=>value.trim()).filter(Boolean)){
          try{
            const results=await browserMapProvider.searchPlaces(query);
            if(cancelled)return;
            if(results[0]){
              const first=results[0],next={lat:first.latitude,lng:first.longitude};
              setPosition(next);setPlace({name:first.name,address:first.address,provider:first.provider,placeId:first.placeId});
              map.setView([next.lat,next.lng],query===initialQueries.at(-1)?12:16);
              return;
            }
          }catch{}
        }
      })().finally(()=>{if(!cancelled)setResolving(false)});
    }
  }).catch(()=>setError(en?"Map could not be loaded.":"地图暂时无法加载。"));
  return()=>{cancelled=true;if(lookupTimer.current!==null)window.clearTimeout(lookupTimer.current);lookupSeq.current++;mapRef.current?.remove();mapRef.current=null;};},[]);

  function locate(){setError("");if(!navigator.geolocation){setError(en?"Location is unavailable.":"当前设备无法定位。");return;}navigator.geolocation.getCurrentPosition(p=>{const next={lat:p.coords.latitude,lng:p.coords.longitude};setPosition(next);mapRef.current?.setView([next.lat,next.lng],16);resolveReadablePlace(next);},()=>setError(en?"Location permission was not granted. You can still drag the map manually.":"未获得定位权限，你仍可以手动拖动地图选点。"),{enableHighAccuracy:false,timeout:10000,maximumAge:60000});}
  const selectedName=place?.name||(en?"Selected map location":"已选择地图位置");
  const selectedAddress=place?.address||(position?(en?"Address lookup is unavailable. You can still use this location and edit the venue text afterwards.":"暂时无法识别这里的地址，你仍可以使用这个位置，并在返回后手动修改场地信息。"):(en?"Move the map or use your current location.":"拖动地图，或定位到你的当前位置。"));

  return <div className="venue-map-overlay" role="dialog" aria-modal="true" aria-label={en?"Pick venue location":"选择场地位置"}><div className="venue-map-panel">
    <div className="venue-map-header row between"><div><strong>{en?"Pick venue location":"选择场地位置"}</strong><p className="muted small">{en?"Move the map until the crosshair is on the court. We'll identify the nearby place for you.":"拖动地图，让准星对准球场；系统会自动识别附近地点。"}</p></div><button type="button" className="text-button" onClick={onClose}>{en?"Close":"关闭"}</button></div>
    <div className="venue-map-wrap"><div ref={host} className="venue-map-canvas"/><div className="venue-map-crosshair" aria-hidden="true">＋</div><button type="button" className="venue-map-locate secondary" onClick={locate}>{en?"My location":"定位到我"}</button></div>
    <div className="venue-map-selection" aria-live="polite"><span className="eyebrow">{en?"SELECTED PLACE":"已选地点"}</span><strong>{resolving?(en?"Finding this place…":"正在识别这个位置…"):selectedName}</strong><p className="muted small">{resolving?(en?"Looking up a readable nearby address.":"正在获取附近可读地址。"):selectedAddress}</p>{position&&<details className="venue-map-technical"><summary>{en?"Location details":"定位信息"}</summary><span>{position.lat.toFixed(6)}, {position.lng.toFixed(6)}</span></details>}</div>
    {error&&<p className="error-text">{error}</p>}
    <div className="venue-map-buttons"><button type="button" className="secondary" onClick={onClose}>{en?"Cancel":"取消"}</button><button type="button" disabled={!position} onClick={()=>position&&onConfirm(position.lat,position.lng,place)}>{en?"Use this location":"使用这个位置"}</button></div>
  </div></div>;
}

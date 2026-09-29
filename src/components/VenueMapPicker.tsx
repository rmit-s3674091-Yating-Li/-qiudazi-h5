import { useEffect, useRef, useState } from "react";

declare global { interface Window { L?: any } }

function ensureLeaflet():Promise<any>{
  if(window.L)return Promise.resolve(window.L);
  return new Promise((resolve,reject)=>{
    if(!document.querySelector('link[data-leaflet]')){
      const link=document.createElement("link");link.rel="stylesheet";link.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";link.dataset.leaflet="1";document.head.appendChild(link);
    }
    const existing=document.querySelector('script[data-leaflet]') as HTMLScriptElement|null;
    const done=()=>window.L?resolve(window.L):reject(new Error("MAP_LOAD_FAILED"));
    if(existing){existing.addEventListener("load",done,{once:true});existing.addEventListener("error",()=>reject(new Error("MAP_LOAD_FAILED")),{once:true});return;}
    const script=document.createElement("script");script.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";script.async=true;script.dataset.leaflet="1";script.onload=done;script.onerror=()=>reject(new Error("MAP_LOAD_FAILED"));document.head.appendChild(script);
  });
}

export function VenueMapPicker({initialLatitude,initialLongitude,language,onClose,onConfirm}:{initialLatitude?:number|null;initialLongitude?:number|null;language:string;onClose:()=>void;onConfirm:(lat:number,lng:number)=>void}){
  const en=language==="en",host=useRef<HTMLDivElement>(null),mapRef=useRef<any>(null);
  const[position,setPosition]=useState<{lat:number;lng:number}|null>(initialLatitude!=null&&initialLongitude!=null?{lat:initialLatitude,lng:initialLongitude}:null);
  const[error,setError]=useState("");
  useEffect(()=>{let cancelled=false;void ensureLeaflet().then(L=>{
    if(cancelled||!host.current)return;
    const start=position??{lat:35.8617,lng:104.1954};
    const map=L.map(host.current,{zoomControl:true}).setView([start.lat,start.lng],position?16:4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);
    map.on("moveend",()=>{const c=map.getCenter();setPosition({lat:c.lat,lng:c.lng});});
    mapRef.current=map;setTimeout(()=>map.invalidateSize(),0);
  }).catch(()=>setError(en?"Map could not be loaded.":"地图暂时无法加载。"));return()=>{cancelled=true;mapRef.current?.remove();mapRef.current=null;};},[]);
  function locate(){setError("");if(!navigator.geolocation){setError(en?"Location is unavailable.":"当前设备无法定位。");return;}navigator.geolocation.getCurrentPosition(p=>{const next={lat:p.coords.latitude,lng:p.coords.longitude};setPosition(next);mapRef.current?.setView([next.lat,next.lng],16);},()=>setError(en?"Location permission was not granted. You can still drag the map manually.":"未获得定位权限，你仍可以手动拖动地图选点。"),{enableHighAccuracy:false,timeout:10000,maximumAge:60000});}
  return <div className="venue-map-overlay" role="dialog" aria-modal="true" aria-label={en?"Pick venue location":"选择场地位置"}><div className="venue-map-panel"><div className="row between"><div><strong>{en?"Pick venue location":"选择场地位置"}</strong><p className="muted small">{en?"Move the map so the crosshair points to the court, then confirm.":"拖动地图，让准星对准球场位置后确认。"}</p></div><button type="button" className="text-button" onClick={onClose}>{en?"Close":"关闭"}</button></div><div className="venue-map-wrap"><div ref={host} className="venue-map-canvas"/><div className="venue-map-crosshair" aria-hidden="true">＋</div></div>{position&&<p className="muted small venue-map-coords">{position.lat.toFixed(6)}, {position.lng.toFixed(6)}</p>}{error&&<p className="error-text">{error}</p>}<div className="venue-map-buttons"><button type="button" className="secondary" onClick={locate}>{en?"My location":"定位到我"}</button><button type="button" disabled={!position} onClick={()=>position&&onConfirm(position.lat,position.lng)}>{en?"Confirm location":"确认这个位置"}</button></div></div></div>;
}

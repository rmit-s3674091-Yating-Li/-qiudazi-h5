import { useEffect, useRef, useState } from "react";

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

export function EventVenueMap({latitude,longitude,name,address,language,onClose}:{latitude:number;longitude:number;name?:string|null;address?:string|null;language:"zh-CN"|"en";onClose:()=>void}){
  const host=useRef<HTMLDivElement>(null),mapRef=useRef<any>(null),en=language==="en";
  const[error,setError]=useState("");
  useEffect(()=>{let cancelled=false;void ensureLeaflet().then(L=>{
    if(cancelled||!host.current)return;
    const map=L.map(host.current,{zoomControl:true,dragging:true,scrollWheelZoom:true}).setView([latitude,longitude],17);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);
    L.marker([latitude,longitude]).addTo(map);
    mapRef.current=map;setTimeout(()=>map.invalidateSize(),0);
  }).catch(()=>setError(en?"Map could not be loaded.":"地图暂时无法加载。"));
  return()=>{cancelled=true;mapRef.current?.remove();mapRef.current=null;};},[latitude,longitude,en]);
  return <div className="venue-map-overlay" role="dialog" aria-modal="true" aria-label={en?"Venue map":"场馆地图"}><div className="venue-map-panel venue-readonly-panel">
    <div className="venue-map-header row between"><div><strong>{name|| (en?"Venue location":"场馆位置")}</strong>{address&&<p className="muted small">{address}</p>}</div><button type="button" className="text-button" onClick={onClose}>{en?"Back to event":"返回赛事"}</button></div>
    <div className="venue-map-wrap"><div ref={host} className="venue-map-canvas"/></div>
    {error&&<p className="error-text">{error}</p>}
    <button type="button" className="secondary full" onClick={onClose}>{en?"Close map":"关闭地图"}</button>
  </div></div>;
}

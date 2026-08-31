import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { explainError, supabase } from "../repositories/supabase";
import { useLanguage } from "../i18n";

export function ProtectedEventPhoto({previewPath,originalPath,alt,allowOriginal=true}:{previewPath:string;originalPath?:string|null;alt:string;allowOriginal?:boolean}){
  const {language}=useLanguage();
  const [previewUrl,setPreviewUrl]=useState<string>();
  const [originalUrl,setOriginalUrl]=useState<string>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    setPreviewUrl(undefined);setOriginalUrl(undefined);setError("");
    void (async()=>{
      try{
        const {data,error}=await supabase!.storage.from("event-photos").createSignedUrl(previewPath,300);
        if(error)throw error;
        if(active)setPreviewUrl(data.signedUrl);
      }catch(e){if(active)setError(explainError(e));}
    })();
    return()=>{active=false;};
  },[previewPath]);
  async function openOriginal(){
    if(!originalPath||busy)return;
    setBusy(true);setError("");
    try{
      const {data,error}=await supabase!.storage.from("event-photos").createSignedUrl(originalPath,60);
      if(error)throw error;
      setOriginalUrl(data.signedUrl);
    }catch(e){setError(explainError(e));}
    finally{setBusy(false);}
  }
  return <div className="protected-photo">
    {originalUrl ? <><img className="photo" src={originalUrl} alt={alt}/><button className="button secondary full" onClick={()=>setOriginalUrl(undefined)}><X size={17}/>{language==="en"?"Close HD view":"关闭高清查看"}</button></> : <>
      {previewUrl ? <img className="photo" src={previewUrl} alt={alt}/> : <div className="photo-frame-preview"><span>{error||(language==="en"?"Loading protected preview…":"正在加载受保护预览…")}</span></div>}
      {allowOriginal&&originalPath&&<button className="button secondary full" disabled={busy||!previewUrl} onClick={()=>void openOriginal()}><Eye size={17}/>{busy?(language==="en"?"Authorizing HD…":"正在授权高清…"):(language==="en"?"View HD photo":"查看高清")}</button>}
    </>}
    {error&&previewUrl&&<p className="muted small">{error}</p>}
  </div>;
}

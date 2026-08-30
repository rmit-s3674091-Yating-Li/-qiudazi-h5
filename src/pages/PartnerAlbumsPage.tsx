import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Empty, ErrorNotice, Header, Loading } from "../components/UI";
import { explainError, rpc, supabase } from "../repositories/supabase";
import { useLanguage } from "../i18n";

type AlbumPhoto={asset_id:string;event_id:string;event_name:string;event_date:string|null;watermarked_url:string;uploaded_at:string};

export function PartnerAlbumsPage(){
  const{profileId}=useParams();const{language}=useLanguage();const en=language==="en";
  const[rows,setRows]=useState<AlbumPhoto[]|null>(null),[urls,setUrls]=useState<Record<string,string>>({}),[error,setError]=useState("");
  useEffect(()=>{let active=true;void(async()=>{try{const data=await rpc<AlbumPhoto[]>("list_partner_visible_event_albums",{p_profile_id:profileId});if(!active)return;setRows(data);for(const row of data){const{data:preview,error:invokeError}=await supabase!.functions.invoke("photo-management",{body:{action:"partner_preview",asset_id:row.asset_id,target_profile_id:profileId}});if(!active)return;if(!invokeError&&preview?.url)setUrls(v=>({...v,[row.asset_id]:preview.url}));}}catch(e){if(active)setError(explainError(e));}})();return()=>{active=false;};},[profileId]);
  return <><Header title={en?"Partner albums":"球搭子相册"}/><main className="page"><h1>{en?"Past event albums":"过往比赛相册"}</h1><p className="muted">{en?"Only albums this partner chose to share with established tennis partners appear here. Only protected watermarked previews are shared; HD originals remain restricted.":"这里只展示 TA 主动设为“搭子可见”的过往比赛相册。搭子仅能看到受保护水印预览，高清原图不会因此开放。"}</p><ErrorNotice message={error}/>{rows===null&&!error?<Loading/>:rows?.length===0?<Empty title={en?"No shared albums":"TA 暂未公开比赛相册"}><p>{en?"Past event albums are private by default.":"过往比赛相册默认仅自己可见。"}</p></Empty>:<div className="stack">{rows?.map(row=><article className="card" key={row.asset_id}><h3>{row.event_name}</h3><p className="muted small">{row.event_date||new Date(row.uploaded_at).toLocaleDateString(en?"en-US":"zh-CN")}</p>{urls[row.asset_id]?<img className="photo" src={urls[row.asset_id]} alt={en?`${row.event_name} protected watermarked preview`:`${row.event_name}受保护水印预览`}/>:<div className="photo-frame-preview"><span>{en?"Loading protected preview…":"正在加载受保护预览…"}</span></div>}</article>)}</div>}</main></>;
}

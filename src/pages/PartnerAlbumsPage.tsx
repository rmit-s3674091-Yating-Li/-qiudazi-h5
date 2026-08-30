import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Empty, ErrorNotice, Header, Loading } from "../components/UI";
import { explainError, rpc, supabase } from "../repositories/supabase";
import { useLanguage } from "../i18n";

type AlbumPhoto={asset_id:string;event_id:string;event_name:string;event_date:string|null;uploaded_at:string};

export function PartnerAlbumsPage(){
  const{profileId}=useParams();const{language}=useLanguage();const en=language==="en";
  const[rows,setRows]=useState<AlbumPhoto[]|null>(null),[urls,setUrls]=useState<Record<string,string>>({}),[error,setError]=useState("");
  useEffect(()=>{let active=true;void(async()=>{try{const data=await rpc<AlbumPhoto[]>("list_partner_visible_event_albums",{p_profile_id:profileId});if(!active)return;setRows(data);for(const row of data){const{data:preview,error:invokeError}=await supabase!.functions.invoke("photo-management",{body:{action:"partner_preview",asset_id:row.asset_id,target_profile_id:profileId}});if(!active)return;if(!invokeError&&preview?.url)setUrls(v=>({...v,[row.asset_id]:preview.url}));}}catch(e){if(active)setError(explainError(e));}})();return()=>{active=false;};},[profileId]);
  return <><Header title={en?"Partner event album":"TA 的参与赛事相册"}/><main className="page"><h1>{en?"Shared event album":"TA 的参与赛事相册"}</h1><p className="muted">{en?"These are personal copies this partner chose to save from events they played in and chose to share with accepted tennis partners. Only protected watermarked previews are available here.":"这里只展示 TA 从自己参加过的赛事中主动保存到个人相册、并选择对已建立关系的球搭子开放的照片。这里只能查看受保护水印预览。"}</p><ErrorNotice message={error}/>{rows===null&&!error?<Loading/>:rows?.length===0?<Empty title={en?"No shared event photos":"TA 暂未开放参与赛事相册"}><p>{en?"Personal event albums are private by default.":"参与赛事相册默认仅自己可见。"}</p></Empty>:<div className="stack">{rows?.map(row=><article className="card" key={row.asset_id}><h3>{row.event_name}</h3><p className="muted small">{row.event_date||new Date(row.uploaded_at).toLocaleDateString(en?"en-US":"zh-CN")}</p>{urls[row.asset_id]?<img className="photo" src={urls[row.asset_id]} alt={en?`${row.event_name} protected personal watermarked preview`:`${row.event_name}个人相册受保护水印预览`}/>:<div className="photo-frame-preview"><span>{en?"Loading protected preview…":"正在加载受保护预览…"}</span></div>}</article>)}</div>}</main></>;
}

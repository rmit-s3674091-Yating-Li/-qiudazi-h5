import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Header, ErrorNotice, Confirm } from "../components/UI";
import { repository, explainError, uploadAsset, supabase } from "../repositories/supabase";
import { invalidateQuery, invalidateQueryPrefix } from "../hooks/useQuery";
import { imageBlob } from "../utils/images";
import { useAuth } from "../hooks/Auth";
import type { Player } from "../domain/types";
import { useLanguage } from "../i18n";

export function PlayerFormPage(){
  const{id}=useParams();const navigate=useNavigate();const auth=useAuth();const{language}=useLanguage();const en=language==="en";
  const[avatarFile,setAvatarFile]=useState<File|null>(null),[name,setName]=useState(""),[player,setPlayer]=useState<Player|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
  useEffect(()=>{if(!id)return;repository.players().then(ps=>{const p=ps.find(candidate=>candidate.id===id);if(!p)throw new Error(en?"Partner profile not found":"没有找到这份球搭子档案");setPlayer(p);setName(p.name);}).catch(e=>setError(explainError(e)));},[id,en]);
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{let avatar=player?.avatar_url||null;if(avatarFile){const blob=await imageBlob(avatarFile,512);const{data}=await supabase!.auth.getSession();avatar=await uploadAsset(blob,"avatars",data.session!.user.id+"/"+crypto.randomUUID()+".jpg");}await repository.savePlayer(id||null,name,avatar,player?.version);invalidateQuery("players");if(id)invalidateQuery(`temporary-partner-${id}`);invalidateQueryPrefix("partner-detail-");await auth.refresh();navigate(player?.player_type==="self"?"/my-tennis-profile":"/players");}catch(e){setError(explainError(e));}finally{setBusy(false);}}
  async function remove(){try{await repository.deletePlayer(id!);invalidateQuery("players");invalidateQuery(`temporary-partner-${id}`);navigate("/players");}catch(e){setError(explainError(e));setConfirm(false);}}
  const self=player?.player_type==="self";const title=self?(en?"Edit avatar & nickname":"编辑头像与昵称"):id?(en?"Edit temporary partner":"编辑临时球搭子"):(en?"Add temporary partner":"添加临时球搭子");
  return <><Header title={title}/><main className="page"><h1>{self?(en?"Edit avatar & nickname":"编辑头像与昵称"):id?(en?"Temporary partner details":"临时球搭子资料"):(en?"Add temporary partner":"添加临时球搭子")}</h1><p className="muted">{self?(en?"Only the nickname and avatar shown in events are edited here. Playing level, city and preferences are maintained in My tennis profile.":"这里仅修改你在赛事中展示的昵称和头像；水平、城市和打球偏好在“我的打球档案”中维护。"):(en?"Use this profile to register or record matches for someone else. Get their permission before adding them.":"用于代对方报名或记录比赛。添加前请取得本人许可。")}</p><form onSubmit={save}><label>{en?"Name / nickname *":"姓名 / 昵称 *"}<input required maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label><label>{en?"Avatar (optional)":"头像（可选）"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setAvatarFile(e.target.files?.[0]||null)}/></label><ErrorNotice message={error}/><button className="full" disabled={busy}>{busy?(en?"Saving…":"保存中…"):(en?"Save profile":"保存资料")}</button></form>{player?.player_type==="manual"&&<button className="danger full" onClick={()=>setConfirm(true)}>{en?"Delete temporary partner":"删除临时球搭子"}</button>}{self&&<p className="muted small">{en?"Your own tennis profile cannot be deleted.":"我的打球档案不可删除。"}</p>}</main>{confirm&&<Confirm title={en?"Delete temporary partner?":"删除临时球搭子？"} description={en?"Only a temporary partner with no event history can be deleted.":"仅未参与过赛事的临时球搭子可以删除。"} onConfirm={remove} onCancel={()=>setConfirm(false)}/>}</>;
}

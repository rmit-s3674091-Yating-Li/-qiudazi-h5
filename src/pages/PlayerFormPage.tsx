import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Header, ErrorNotice, Confirm } from "../components/UI";
import { repository, explainError, uploadAsset, supabase } from "../repositories/supabase";
import { invalidateQuery, invalidateQueryPrefix } from "../hooks/useQuery";
import { imageBlob } from "../utils/images";
import { useAuth } from "../hooks/Auth";
import type { Player } from "../domain/types";

export function PlayerFormPage(){
  const{id}=useParams();const navigate=useNavigate();const auth=useAuth();
  const[avatarFile,setAvatarFile]=useState<File|null>(null),[name,setName]=useState(""),[player,setPlayer]=useState<Player|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
  useEffect(()=>{if(!id)return;repository.players().then(ps=>{const p=ps.find(candidate=>candidate.id===id);if(!p)throw new Error("没有找到这份球搭子档案");setPlayer(p);setName(p.name);}).catch(e=>setError(explainError(e)));},[id]);
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{let avatar=player?.avatar_url||null;if(avatarFile){const blob=await imageBlob(avatarFile,512);const{data}=await supabase!.auth.getSession();avatar=await uploadAsset(blob,"avatars",data.session!.user.id+"/"+crypto.randomUUID()+".jpg");}await repository.savePlayer(id||null,name,avatar,player?.version);invalidateQuery("players");if(id)invalidateQuery(`temporary-partner-${id}`);invalidateQueryPrefix("partner-detail-");await auth.refresh();navigate(player?.player_type==="self"?"/my-tennis-profile":"/players");}catch(e){setError(explainError(e));}finally{setBusy(false);}}
  async function remove(){try{await repository.deletePlayer(id!);invalidateQuery("players");invalidateQuery(`temporary-partner-${id}`);navigate("/players");}catch(e){setError(explainError(e));setConfirm(false);}}
  const self=player?.player_type==="self";const title=self?"编辑头像与昵称":id?"编辑临时球搭子":"添加临时球搭子";
  return <><Header title={title}/><main className="page"><h1>{self?"编辑头像与昵称":id?"临时球搭子资料":"添加临时球搭子"}</h1><p className="muted">{self?"这里仅修改你在赛事中展示的昵称和头像；水平、城市和打球偏好在“我的打球档案”中维护。":"用于代对方报名或记录比赛。添加前请取得本人许可。"}</p><form onSubmit={save}><label>姓名 / 昵称 *<input required maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label><label>头像（可选）<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setAvatarFile(e.target.files?.[0]||null)}/></label><ErrorNotice message={error}/><button className="full" disabled={busy}>{busy?"保存中…":"保存资料"}</button></form>{player?.player_type==="manual"&&<button className="danger full" onClick={()=>setConfirm(true)}>删除临时球搭子</button>}{self&&<p className="muted small">我的打球档案不可删除。</p>}</main>{confirm&&<Confirm title="删除临时球搭子？" description="仅未参与过赛事的临时球搭子可以删除。" onConfirm={remove} onCancel={()=>setConfirm(false)}/>}</>;
}

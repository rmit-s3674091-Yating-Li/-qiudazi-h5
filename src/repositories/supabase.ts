import { createClient } from "@supabase/supabase-js";
import type { Event, EventConfig, Player, Profile, Snapshot } from "../domain/types";
import type { Filters, TournamentRepository } from "./contracts";
const url=(import.meta.env.VITE_SUPABASE_URL as string|undefined)??"https://rtmjzmgrhifjzxaliltm.supabase.co";
const key=(import.meta.env.VITE_SUPABASE_ANON_KEY as string|undefined)??"sb_publishable_vM47k7tVER77x3bpGSkDdw_dowVImzn";
export const configured=!!(url&&key);
export const supabase=configured?createClient(url!,key!,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}):null;
function client(){if(!supabase)throw new Error("在线数据库暂未配置，请稍后再试。");return supabase;}
const messages:Record<string,string>={
  PROFILE_REQUIRED:"请先完成昵称设置",DUPLICATE_PLAYER:"这位球搭子已经在本场名单中，不能重复报名",ENTRY_SIZE:"请选择正确的参赛人数",PLAYER_FORBIDDEN:"只能选择我的打球档案或已添加的临时球搭子",SELF_REQUIRED:"自主报名需要包含你自己的打球档案",SIGNUP_DISABLED:"这场赛事暂未开放自主报名",WAITLIST_FULL:"正式名额和候补名额都已满",TOO_FEW_ENTRIES:"至少需要2个正式参赛单元",GROUP_SIZE:"每组至少2个参赛单元，晋级人数须少于该组人数",AUTH_REQUIRED:"正在恢复你的球搭子身份，请稍后重试",FORBIDDEN:"你没有执行这个操作的权限",VERSION_CONFLICT:"这份数据刚刚被更新，请刷新后再试",NICKNAME_REQUIRED:"请填写1–40字昵称",NICKNAME_TAKEN:"这个昵称当前无法使用，请换一个昵称",TEST_IDENTITY_UNAVAILABLE:"这个测试昵称暂时无法进入，请换一个昵称或稍后重试",TEST_IDENTITY_RETRY:"测试身份刚刚发生变化，请重新提交一次",ROSTER_LOCKED:"参赛名单已经锁定，不能再修改这项内容",PLAYER_HAS_HISTORY:"已有比赛记录的临时球搭子不能删除",SELF_PLAYER_PROTECTED:"我的打球档案不能删除",EVENT_HAS_HISTORY:"已有参赛记录的赛事不能删除",EVENT_NOT_FOUND:"没有找到这场赛事",NOT_EVENT_OWNER:"只有赛事组织者可以发出这类私有赛事邀请",JOIN_EVENT_BEFORE_INVITING:"先完成这场公开赛事的报名，再邀请球搭子一起来",ALREADY_JOINED:"这位球搭子已经参加这场赛事",NOT_CONNECTION:"只能邀请已经建立关系的球搭子",CANNOT_INVITE_SELF:"不能邀请自己",LIMIT_BELOW_ROSTER:"名额不能少于当前正式参赛人数",ENTRY_TYPE_LOCKED:"已经有人报名，不能再切换单打或双打",INVALID_AVATAR:"头像文件不可用，请重新上传",INVITE_NOT_FOUND:"这个邀请不存在或已经失效",INVITE_CLOSED:"这个邀请已经结束，请让对方重新发送",SELF_INVITE:"不能接受自己发出的邀请",PLAYER_ALREADY_CLAIMED:"这份打球记录已经关联过了",SELF_PLAYER_REQUIRED:"没有找到你的打球档案，请重新加载后再试",PLAYER_CLAIM_CONFLICT:"你和这份历史记录在同一赛事里都有参赛记录，暂时无法自动关联",CITY_REQUIRED:"请填写城市（30字以内）",CITY:"城市请控制在30字以内",VENUE:"比赛场地请控制在120字以内"
};
export function explainError(error:unknown){
  const message=error instanceof Error?error.message:typeof error==="object"&&error&&"message" in error?String(error.message):"操作没有完成，请重试";
  const code=Object.keys(messages).find(k=>message.includes(k));if(code)return messages[code];
  const lower=message.toLowerCase();
  if(lower.includes("failed to fetch")||lower.includes("load failed")||lower.includes("network")||lower.includes("fetch failed"))return "网络连接有点慢，请检查网络后重试。已加载的内容不会受影响。";
  if(lower.includes("timeout")||lower.includes("timed out"))return "连接超时了，请稍后重试。";
  if(lower.includes("jwt")||lower.includes("session")||lower.includes("refresh token"))return "登录状态需要重新恢复，请刷新页面后再试。";
  return message.length>120?"操作没有完成，请稍后重试。":message;
}
export async function rpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{const{data,error}=await client().rpc(name,args);if(error)throw new Error(explainError(error));return data as T;}
export const repository:TournamentRepository={
  profile:()=>rpc<Profile>("ensure_profile"),
  completeProfile:(name,avatar)=>rpc<Profile>("complete_profile",{p_name:name,p_avatar_path:avatar}),
  async players(){const{data,error}=await client().from("players").select("*").order("created_at");if(error)throw new Error(explainError(error));return data as Player[];},
  savePlayer:(id,name,avatar,version)=>rpc<Player>("save_player",{p_id:id,p_name:name,p_avatar_path:avatar,p_version:version??null}),
  deletePlayer:id=>rpc<void>("delete_player",{p_id:id}),
  events:(filters:Filters={})=>rpc<Event[]>("list_events",{p_mine:!!filters.mine,p_filters:filters}),
  event:id=>rpc<Snapshot>("get_event_snapshot",{p_event_id:id}),
  saveEvent:(id,config,version)=>rpc<Event>("save_event",{p_id:id,p_config:config,p_version:version??null}),
  deleteEvent:(id,version)=>rpc<void>("delete_event",{p_id:id,p_version:version}),
};
export function assetUrl(path:string|null|undefined,bucket="avatars"){if(!path||!supabase)return undefined;return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;}
export async function uploadAsset(blob:Blob,bucket:string,path:string){const{error}=await client().storage.from(bucket).upload(path,blob,{contentType:blob.type,upsert:false});if(error)throw new Error(explainError(error));return path;}
export async function command(eventId:string,action:Record<string,unknown>){const c=client();const{data:sessionData}=await c.auth.getSession();if(!sessionData.session)throw new Error("请先恢复登录身份");const{data,error}=await c.functions.invoke("tournament-command",{body:{event_id:eventId,...action}});if(error){let message=error.message;try{const context=(error as{context?:Response}).context;if(context){const body=await context.clone().json();if(body?.error)message=body.error;}}catch{}throw new Error(explainError(message));}return data as Snapshot;}

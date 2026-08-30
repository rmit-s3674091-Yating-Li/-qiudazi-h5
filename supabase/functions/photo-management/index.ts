import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
type Photo={id:string;event_id:string;original_url:string;watermarked_url:string;uploaded_at:string;version:number};
Deno.serve(async(req)=>{
  if(req.method!=="POST") return json({error:"METHOD_NOT_ALLOWED"},405);
  const auth=req.headers.get("authorization"); if(!auth) return json({error:"AUTH_REQUIRED"},401);
  const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const admin=createClient(url,service);
  const {data:{user}}=await userClient.auth.getUser(); if(!user) return json({error:"AUTH_REQUIRED"},401);
  const body=await req.json().catch(()=>null) as {action?:"delete"|"finalize_upload"|"partner_preview";event_id?:string;version?:number;original_path?:string;preview_path?:string;asset_id?:string;target_profile_id?:string}|null;
  if(!body?.action) return json({error:"INVALID_REQUEST"},400);
  const {data:profile,error:profileError}=await userClient.rpc("ensure_profile"); if(profileError||!profile?.id) return json({error:"AUTH_REQUIRED"},401);

  if(body.action==="partner_preview"){
    if(!body.asset_id||!body.target_profile_id) return json({error:"INVALID_REQUEST"},400);
    const {data:allowed,error:allowedError}=await userClient.rpc("list_partner_visible_event_albums",{p_profile_id:body.target_profile_id});
    if(allowedError) return json({error:"FORBIDDEN"},403);
    const row=(allowed as Array<{asset_id:string;watermarked_url:string}>|null)?.find(x=>x.asset_id===body.asset_id);
    if(!row) return json({error:"FORBIDDEN"},403);
    const {data:signed,error:signError}=await admin.storage.from("event-photos").createSignedUrl(row.watermarked_url,300);
    if(signError||!signed?.signedUrl) return json({error:"PHOTO_PREVIEW_FAILED"},500);
    return json({url:signed.signedUrl,expires_in:300});
  }

  if(!body.event_id) return json({error:"INVALID_REQUEST"},400);
  const {data:event}=await admin.from("events").select("id,owner_user_id,status").eq("id",body.event_id).maybeSingle();
  if(!event || event.owner_user_id!==profile.id) return json({error:"FORBIDDEN"},403);
  const {data:existing}=await admin.from("event_photos").select("id,event_id,original_url,watermarked_url,uploaded_at,version").eq("event_id",body.event_id).maybeSingle<Photo>();
  if(typeof body.version==="number" && (existing?.version??0)!==body.version) return json({error:"VERSION_CONFLICT"},409);

  if(body.action==="delete"){
    const {data:removed,error:removeError}=await userClient.rpc("remove_event_photo_from_event",{p_event_id:body.event_id,p_version:body.version??0});
    if(removeError){const m=removeError.message||"";if(m.includes("VERSION_CONFLICT"))return json({error:"VERSION_CONFLICT"},409);if(m.includes("FORBIDDEN"))return json({error:"FORBIDDEN"},403);return json({error:"PHOTO_REMOVE_FAILED"},500);}
    return json({ok:true,archived:!!removed});
  }

  if(body.action==="finalize_upload"){
    if(event.status!=="finished") return json({error:"EVENT_NOT_FINISHED"},409);
    const original=body.original_path, preview=body.preview_path;
    const expectedPrefix=`${user.id}/${body.event_id}/`;
    if(!original||!preview||!original.startsWith(expectedPrefix)||!preview.startsWith(expectedPrefix)||original===preview) return json({error:"INVALID_PHOTO"},400);
    const cleanupNew=async()=>{ await admin.storage.from("event-photos").remove([original,preview]); };
    const {data:saved,error:saveError}=await userClient.rpc("save_event_photo",{p_event_id:body.event_id,p_original:original,p_watermarked:preview,p_version:body.version??0});
    if(saveError){await cleanupNew();return json({error:saveError.message||"PHOTO_SAVE_FAILED"},400);}
    if(existing){const oldPaths=[existing.original_url,existing.watermarked_url];const {error:removeError}=await admin.storage.from("event-photos").remove(oldPaths);if(removeError)return json({error:"PHOTO_REPLACE_CLEANUP_FAILED"},500);}
    return json({ok:true,photo:saved});
  }
  return json({error:"INVALID_REQUEST"},400);
});

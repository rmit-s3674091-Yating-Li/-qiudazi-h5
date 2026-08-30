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
  const body=await req.json().catch(()=>null) as {action?:"delete"|"finalize_upload";event_id?:string;version?:number;original_path?:string;preview_path?:string}|null;
  if(!body?.event_id || !body.action) return json({error:"INVALID_REQUEST"},400);
  const {data:profile,error:profileError}=await userClient.rpc("ensure_profile"); if(profileError||!profile?.id) return json({error:"AUTH_REQUIRED"},401);
  const {data:event}=await admin.from("events").select("id,owner_user_id,status").eq("id",body.event_id).maybeSingle();
  if(!event || event.owner_user_id!==profile.id) return json({error:"FORBIDDEN"},403);
  const {data:existing}=await admin.from("event_photos").select("id,event_id,original_url,watermarked_url,uploaded_at,version").eq("event_id",body.event_id).maybeSingle<Photo>();
  if(typeof body.version==="number" && (existing?.version??0)!==body.version) return json({error:"VERSION_CONFLICT"},409);

  if(body.action==="delete"){
    const requestedVersion=body.version??0;
    const {data:deletedData,error:deleteError}=await userClient.rpc("delete_event_photo_metadata",{p_event_id:body.event_id,p_version:requestedVersion});
    if(deleteError){
      const message=deleteError.message||"";
      if(message.includes("VERSION_CONFLICT")) return json({error:"VERSION_CONFLICT"},409);
      if(message.includes("FORBIDDEN")) return json({error:"FORBIDDEN"},403);
      return json({error:"PHOTO_METADATA_DELETE_FAILED"},500);
    }
    const deleted=deletedData as Photo|null;
    if(!deleted) return json({ok:true});
    const paths=[deleted.original_url,deleted.watermarked_url];
    for(const path of paths){ if(typeof path!=="string" || !path.includes(`/${body.event_id}/`)) return json({error:"INVALID_PHOTO"},400); }
    const {error:removeError}=await admin.storage.from("event-photos").remove(paths);
    if(removeError){
      const {error:restoreError}=await admin.from("event_photos").insert(deleted);
      if(restoreError) return json({error:"PHOTO_DELETE_ROLLBACK_FAILED"},500);
      return json({error:"PHOTO_DELETE_FAILED"},500);
    }
    return json({ok:true});
  }

  if(body.action==="finalize_upload"){
    if(event.status!=="finished") return json({error:"EVENT_NOT_FINISHED"},409);
    const original=body.original_path, preview=body.preview_path;
    const expectedPrefix=`${user.id}/${body.event_id}/`;
    if(!original||!preview||!original.startsWith(expectedPrefix)||!preview.startsWith(expectedPrefix)||original===preview) return json({error:"INVALID_PHOTO"},400);
    const cleanupNew=async()=>{ await admin.storage.from("event-photos").remove([original,preview]); };
    const {data:saved,error:saveError}=await userClient.rpc("save_event_photo",{p_event_id:body.event_id,p_original:original,p_watermarked:preview,p_version:body.version??0});
    if(saveError){ await cleanupNew(); return json({error:saveError.message||"PHOTO_SAVE_FAILED"},400); }
    if(existing){
      const oldPaths=[existing.original_url,existing.watermarked_url];
      const {error:removeError}=await admin.storage.from("event-photos").remove(oldPaths);
      if(removeError){
        const {error:rollbackError}=await admin.from("event_photos").update({original_url:existing.original_url,watermarked_url:existing.watermarked_url,uploaded_at:existing.uploaded_at,version:existing.version}).eq("event_id",body.event_id).eq("version",saved.version);
        await cleanupNew();
        if(rollbackError) return json({error:"PHOTO_REPLACE_ROLLBACK_FAILED"},500);
        return json({error:"PHOTO_REPLACE_CLEANUP_FAILED"},500);
      }
    }
    return json({ok:true,photo:saved});
  }

  return json({error:"INVALID_REQUEST"},400);
});

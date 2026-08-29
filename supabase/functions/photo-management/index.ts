import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
Deno.serve(async(req)=>{
  if(req.method!=="POST") return json({error:"METHOD_NOT_ALLOWED"},405);
  const auth=req.headers.get("authorization"); if(!auth) return json({error:"AUTH_REQUIRED"},401);
  const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const admin=createClient(url,service);
  const {data:{user}}=await userClient.auth.getUser(); if(!user) return json({error:"AUTH_REQUIRED"},401);
  const body=await req.json().catch(()=>null) as {action?:string,event_id?:string,version?:number}|null;
  if(!body?.event_id || body.action!=="delete") return json({error:"INVALID_REQUEST"},400);
  const {data:profile,error:profileError}=await userClient.rpc("ensure_profile"); if(profileError||!profile?.id) return json({error:"AUTH_REQUIRED"},401);
  const {data:event}=await admin.from("events").select("id,owner_user_id").eq("id",body.event_id).maybeSingle();
  if(!event || event.owner_user_id!==profile.id) return json({error:"FORBIDDEN"},403);
  const {data:photo}=await admin.from("event_photos").select("id,event_id,original_url,watermarked_url,version").eq("event_id",body.event_id).maybeSingle();
  if(!photo) return json({ok:true});
  if(typeof body.version==="number" && photo.version!==body.version) return json({error:"VERSION_CONFLICT"},409);
  const paths=[photo.original_url,photo.watermarked_url].filter(Boolean);
  for(const path of paths){ if(typeof path!=="string" || !path.includes(`/${body.event_id}/`)) return json({error:"INVALID_PHOTO"},400); }
  const {error:removeError}=await admin.storage.from("event-photos").remove(paths); if(removeError) return json({error:"PHOTO_DELETE_FAILED"},500);
  const {error:dbError}=await admin.from("event_photos").delete().eq("id",photo.id).eq("version",photo.version);
  if(dbError) return json({error:"PHOTO_METADATA_DELETE_FAILED"},500);
  return json({ok:true});
});

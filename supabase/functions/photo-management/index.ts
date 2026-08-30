import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
type SourcePhoto={id:string;event_id:string;original_url:string;watermarked_url:string;uploaded_at:string;version:number};
type PersonalPhoto={id:string;profile_id:string;source_event_photo_id:string|null;source_event_id:string;event_name_snapshot:string;event_date_snapshot:string|null;original_url:string;watermarked_url:string;imported_at:string};

Deno.serve(async(req)=>{
  if(req.method!=="POST") return json({error:"METHOD_NOT_ALLOWED"},405);
  const auth=req.headers.get("authorization"); if(!auth) return json({error:"AUTH_REQUIRED"},401);
  const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const admin=createClient(url,service);
  const {data:{user}}=await userClient.auth.getUser(); if(!user) return json({error:"AUTH_REQUIRED"},401);
  const {data:profile,error:profileError}=await userClient.rpc("ensure_profile"); if(profileError||!profile?.id) return json({error:"AUTH_REQUIRED"},401);
  const body=await req.json().catch(()=>null) as {action?:"finalize_upload"|"delete"|"import_personal"|"delete_personal"|"personal_preview"|"personal_original"|"partner_preview";event_id?:string;photo_id?:string;asset_id?:string;version?:number;original_path?:string;preview_path?:string;target_profile_id?:string}|null;
  if(!body?.action) return json({error:"INVALID_REQUEST"},400);

  if(body.action==="personal_preview"||body.action==="personal_original"||body.action==="partner_preview"){
    if(!body.asset_id) return json({error:"INVALID_REQUEST"},400);
    const target=body.action==="partner_preview"?body.target_profile_id:null;
    if(body.action==="partner_preview"&&!target) return json({error:"INVALID_REQUEST"},400);
    const {data:rows,error}=await userClient.rpc("get_personal_album_asset",{p_asset_id:body.asset_id,p_target_profile_id:target});
    if(error||!rows?.length) return json({error:"FORBIDDEN"},403);
    const row=rows[0] as {original_url:string|null;watermarked_url:string;can_view_original:boolean};
    const original=body.action==="personal_original";
    if(original&&!row.can_view_original) return json({error:"FORBIDDEN"},403);
    const path=original?row.original_url:row.watermarked_url;
    if(!path) return json({error:"PHOTO_NOT_FOUND"},404);
    const ttl=original?60:300;
    const {data:signed,error:signError}=await admin.storage.from("event-photos").createSignedUrl(path,ttl);
    if(signError||!signed?.signedUrl) return json({error:"PHOTO_PREVIEW_FAILED"},500);
    return json({url:signed.signedUrl,expires_in:ttl});
  }

  if(body.action==="import_personal"){
    if(!body.photo_id) return json({error:"INVALID_REQUEST"},400);
    const {data:prepared,error:prepareError}=await userClient.rpc("prepare_personal_album_import",{p_photo_id:body.photo_id});
    if(prepareError||!prepared?.length){const m=prepareError?.message||"";if(m.includes("ALREADY_SAVED"))return json({error:"ALREADY_SAVED"},409);if(m.includes("FORBIDDEN"))return json({error:"FORBIDDEN"},403);return json({error:"PHOTO_NOT_FOUND"},404);}
    const source=prepared[0] as {photo_id:string;original_url:string;watermarked_url:string};
    const copyId=crypto.randomUUID();
    const originalPath=`personal/${profile.id}/${copyId}-original.jpg`;
    const previewPath=`personal/${profile.id}/${copyId}-watermark.jpg`;
    const copied:string[]=[];
    try{
      const {data:originalBlob,error:originalError}=await admin.storage.from("event-photos").download(source.original_url);
      if(originalError||!originalBlob) throw new Error("SOURCE_ORIGINAL_READ_FAILED");
      const {data:previewBlob,error:previewError}=await admin.storage.from("event-photos").download(source.watermarked_url);
      if(previewError||!previewBlob) throw new Error("SOURCE_PREVIEW_READ_FAILED");
      const upOriginal=await admin.storage.from("event-photos").upload(originalPath,originalBlob,{contentType:originalBlob.type||"image/jpeg",upsert:false});
      if(upOriginal.error) throw upOriginal.error; copied.push(originalPath);
      const upPreview=await admin.storage.from("event-photos").upload(previewPath,previewBlob,{contentType:previewBlob.type||"image/jpeg",upsert:false});
      if(upPreview.error) throw upPreview.error; copied.push(previewPath);
      const {data:saved,error:saveError}=await userClient.rpc("finalize_personal_album_import",{p_photo_id:body.photo_id,p_original:originalPath,p_watermarked:previewPath});
      if(saveError||!saved) throw saveError||new Error("PERSONAL_IMPORT_FAILED");
      return json({ok:true,asset:saved});
    }catch(e){if(copied.length)await admin.storage.from("event-photos").remove(copied);const m=e instanceof Error?e.message:String(e);if(m.includes("PHOTO_NOT_FOUND"))return json({error:"PHOTO_NOT_FOUND"},409);if(m.includes("ALREADY_SAVED"))return json({error:"ALREADY_SAVED"},409);return json({error:"PERSONAL_IMPORT_FAILED"},500);}
  }

  if(body.action==="delete_personal"){
    if(!body.asset_id) return json({error:"INVALID_REQUEST"},400);
    const {data:assetRows,error:assetError}=await userClient.rpc("get_personal_album_asset",{p_asset_id:body.asset_id,p_target_profile_id:null});
    if(assetError||!assetRows?.length||!assetRows[0].can_view_original) return json({error:"FORBIDDEN"},403);
    const {data:deleted,error:deleteError}=await userClient.rpc("delete_my_personal_album_metadata",{p_asset_id:body.asset_id});
    if(deleteError||!deleted) return json({error:"PERSONAL_DELETE_FAILED"},500);
    const row=deleted as PersonalPhoto;
    const {error:removeError}=await admin.storage.from("event-photos").remove([row.original_url,row.watermarked_url]);
    if(removeError){await admin.from("participant_album_photos").insert(row);return json({error:"PERSONAL_DELETE_FAILED"},500);}
    return json({ok:true});
  }

  if(body.action==="finalize_upload"){
    if(!body.event_id||!body.original_path||!body.preview_path) return json({error:"INVALID_REQUEST"},400);
    const {data:event}=await admin.from("events").select("id,owner_user_id,status").eq("id",body.event_id).maybeSingle();
    if(!event||event.owner_user_id!==profile.id) return json({error:"FORBIDDEN"},403);
    if(event.status!=="finished") return json({error:"EVENT_NOT_FINISHED"},409);
    const expectedPrefix=`${user.id}/${body.event_id}/`;
    if(!body.original_path.startsWith(expectedPrefix)||!body.preview_path.startsWith(expectedPrefix)||body.original_path===body.preview_path) return json({error:"INVALID_PHOTO"},400);
    const {data:saved,error:saveError}=await userClient.rpc("add_event_photo",{p_event_id:body.event_id,p_original:body.original_path,p_watermarked:body.preview_path});
    if(saveError){await admin.storage.from("event-photos").remove([body.original_path,body.preview_path]);return json({error:saveError.message||"PHOTO_SAVE_FAILED"},400);}
    return json({ok:true,photo:saved});
  }

  if(body.action==="delete"){
    if(!body.photo_id||typeof body.version!=="number") return json({error:"INVALID_REQUEST"},400);
    const {data:existing,error:readError}=await admin.from("event_photos").select("id,event_id,original_url,watermarked_url,uploaded_at,version").eq("id",body.photo_id).maybeSingle<SourcePhoto>();
    if(readError) return json({error:"PHOTO_NOT_FOUND"},404);
    if(!existing) return json({error:"VERSION_CONFLICT"},409);
    const {data:deleted,error:deleteError}=await userClient.rpc("delete_event_photo_metadata",{p_photo_id:body.photo_id,p_version:body.version});
    if(deleteError){const m=deleteError.message||"";if(m.includes("VERSION_CONFLICT"))return json({error:"VERSION_CONFLICT"},409);if(m.includes("FORBIDDEN"))return json({error:"FORBIDDEN"},403);return json({error:"PHOTO_METADATA_DELETE_FAILED"},500);}
    if(!deleted) return json({error:"VERSION_CONFLICT"},409);
    const row=deleted as SourcePhoto;
    const {error:removeError}=await admin.storage.from("event-photos").remove([row.original_url,row.watermarked_url]);
    if(removeError){await admin.from("event_photos").insert(row);return json({error:"PHOTO_DELETE_FAILED"},500);}
    return json({ok:true});
  }

  return json({error:"INVALID_REQUEST"},400);
});
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors=(req:Request)=>{const h:Record<string,string>={"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Max-Age":"86400","Vary":"Origin"};const o=req.headers.get("origin");if(o)h["Access-Control-Allow-Origin"]=o;return h;};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json","cache-control":"no-store"}});

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST")return json(req,{error:"METHOD_NOT_ALLOWED"},405);
  const body=await req.json().catch(()=>null) as {nickname?:unknown}|null;
  const nickname=typeof body?.nickname==="string"?body.nickname:"";
  if(!nickname.trim()||nickname.length>80)return json(req,{error:"INVALID_NICKNAME"},400);

  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!service)return json(req,{error:"IDENTITY_EXCHANGE_NOT_CONFIGURED"},500);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:normalized,error:normalizeError}=await admin.rpc("normalize_test_nickname",{p_nickname:nickname});
  if(normalizeError||typeof normalized!=="string"||!normalized)return json(req,{error:"INVALID_NICKNAME"},400);

  const {data:profile,error:profileError}=await admin.from("profiles").select("auth_user_id,profile_status,nickname").eq("profile_status","completed").filter("nickname","not.is",null).limit(2000);
  if(profileError)return json(req,{error:"IDENTITY_EXCHANGE_FAILED"},500);
  const matches=[] as Array<{auth_user_id:string;nickname:string|null}>;
  for(const row of profile??[]){const {data:n}=await admin.rpc("normalize_test_nickname",{p_nickname:row.nickname});if(n===normalized)matches.push(row as {auth_user_id:string;nickname:string|null});if(matches.length>1)break;}
  if(matches.length===0)return json(req,{error:"NICKNAME_NOT_FOUND"},404);
  if(matches.length!==1)return json(req,{error:"NICKNAME_CONFLICT"},409);

  const {data:userData,error:userError}=await admin.auth.admin.getUserById(matches[0].auth_user_id);
  const email=userData.user?.email;
  if(userError||!email)return json(req,{error:"IDENTITY_EXCHANGE_FAILED"},500);
  const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:"magiclink",email});
  const tokenHash=link.properties?.hashed_token;
  if(linkError||!tokenHash)return json(req,{error:"IDENTITY_EXCHANGE_FAILED"},500);

  return json(req,{ok:true,nickname:matches[0].nickname,token_hash:tokenHash,otp_type:"email"});
});

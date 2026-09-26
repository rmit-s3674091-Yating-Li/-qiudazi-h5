import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors=(req:Request)=>{const h:Record<string,string>={"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Max-Age":"86400","Vary":"Origin"};const o=req.headers.get("origin");if(o)h["Access-Control-Allow-Origin"]=o;return h;};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json","cache-control":"no-store"}});

type IdentityRow={auth_user_id:string;nickname:string|null};

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST")return json(req,{error:"METHOD_NOT_ALLOWED"},405);
  const body=await req.json().catch(()=>null) as {nickname?:unknown}|null;
  const nickname=typeof body?.nickname==="string"?body.nickname:"";
  if(!nickname.trim()||nickname.length>80)return json(req,{error:"INVALID_NICKNAME"},400);

  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!service)return json(req,{error:"IDENTITY_EXCHANGE_NOT_CONFIGURED"},500);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:rows,error:lookupError}=await admin.rpc("lookup_test_identity_by_nickname",{p_nickname:nickname});
  if(lookupError)return json(req,{error:"IDENTITY_EXCHANGE_FAILED"},500);
  const matches=(rows??[]) as IdentityRow[];
  if(matches.length===0)return json(req,{error:"NICKNAME_NOT_FOUND"},404);
  if(matches.length!==1)return json(req,{error:"NICKNAME_CONFLICT"},409);

  const {data:userData,error:userError}=await admin.auth.admin.getUserById(matches[0].auth_user_id);
  const email=userData.user?.email;
  if(userError||!email)return json(req,{error:"IDENTITY_EXCHANGE_FAILED"},500);
  const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:"magiclink",email});
  const tokenHash=link.properties?.hashed_token;
  if(linkError||!tokenHash)return json(req,{error:"IDENTITY_EXCHANGE_FAILED"},500);

  // Return only a one-time verification hash. Never expose password, refresh token or session token.
  return json(req,{ok:true,nickname:matches[0].nickname,token_hash:tokenHash,otp_type:"email"});
});

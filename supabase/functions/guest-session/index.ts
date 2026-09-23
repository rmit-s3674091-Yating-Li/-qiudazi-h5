import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const bucket=new Map<string,{count:number;reset:number}>();

// Controlled-test identity provisioning. This endpoint is intentionally unauthenticated
// because it creates the first disposable Auth identity used by the test build.
// It must never return the service-role key or any existing user's credentials.
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);

  const ip=(req.headers.get("x-forwarded-for")||req.headers.get("cf-connecting-ip")||"unknown").split(",")[0].trim();
  const now=Date.now(),key=ip||"unknown",hit=bucket.get(key);
  if(hit&&hit.reset>now&&hit.count>=8)return json({error:"GUEST_RATE_LIMITED",retry_after_seconds:Math.ceil((hit.reset-now)/1000)},429);
  if(!hit||hit.reset<=now)bucket.set(key,{count:1,reset:now+60*60*1000});else hit.count++;

  const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceKey)return json({error:"SERVICE_CONFIG_MISSING"},503);
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const id=crypto.randomUUID().replaceAll("-","");
  const email=`guest-${id}@guest.qiudazi.app`,password=`Qd!${crypto.randomUUID()}`;
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{account_type:"qiudazi_guest"}});
  if(error||!data.user){console.error(error);return json({error:"GUEST_CREATE_FAILED"},500);}
  return json({email,password});
});

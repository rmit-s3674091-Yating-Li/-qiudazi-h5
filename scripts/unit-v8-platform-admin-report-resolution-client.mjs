import assert from "node:assert/strict";import{mkdtemp,readFile,rm,writeFile}from"node:fs/promises";import{tmpdir}from"node:os";import{join}from"node:path";import{pathToFileURL}from"node:url";import ts from"typescript";const tmp=await mkdtemp(join(tmpdir(),"qiudazi-v8-report-resolution-"));try{const source=await readFile("src/domain/PlatformAdminReportResolution.ts","utf8"),transpiled=ts.transpileModule(source,{fileName:"PlatformAdminReportResolution.ts",compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},reportDiagnostics:true});assert.equal(transpiled.diagnostics?.length??0,0);const modulePath=join(tmp,"PlatformAdminReportResolution.mjs");await writeFile(modulePath,transpiled.outputText,"utf8");const{makeReportResolutionAttempt:make,parseReportResolutionReceipt:parse,submitReportResolution:submit}=await import(pathToFileURL(modulePath).href),reportId="a1111111-1111-4111-8111-111111111111",requestId="b1111111-1111-4111-8111-111111111111",attempt=make({reportId,version:4,decision:"resolved",reason:"  Reviewed the evidence  ",requestId});assert.equal(attempt.reason,"Reviewed the evidence");const receipt={request_id:requestId,report_id:reportId,status:"resolved",version:5,replayed:false};assert.deepEqual(parse(receipt,attempt),receipt);assert.equal(parse({...receipt,reporter_id:reportId},attempt),null);let calls=0;const ambiguous=async(name,{body})=>{assert.equal(name,"platform-admin-report-resolution");assert.strictEqual(body,attempt);calls++;if(calls===1)throw new Error("lost");return{data:{...receipt,replayed:true},error:null}};assert.deepEqual(await submit(ambiguous,attempt),{kind:"uncertain"});assert.equal((await submit(ambiguous,attempt)).kind,"committed");for(const[status,kind]of[[401,"forbidden"],[403,"forbidden"],[404,"not_found"],[409,"conflict"],[400,"invalid"],[503,"uncertain"]])assert.deepEqual(await submit(async()=>({data:null,error:{context:{status}}}),attempt),{kind});const ui=await readFile("src/components/PlatformAdminReportResolutionAction.tsx","utf8"),directory=await readFile("src/components/PlatformAdminReportDirectory.tsx","utf8");for(const text of[ui,directory]){const compiled=ts.transpileModule(text,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},reportDiagnostics:true});assert.equal(compiled.diagnostics?.length??0,0);assert.doesNotMatch(text,/supabase\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.storage\./)}assert.match(ui,/crypto\.randomUUID\(\)/);assert.match(ui,/send\(attempt\)/);assert.match(directory,/platform_admin_my_role/);assert.match(directory,/PlatformAdminReportResolutionAction/);console.log("PASS: V8 Platform Admin report audited action contract")}finally{await rm(tmp,{recursive:true,force:true})}

// The Edge body carries a terminal error code even when transport strips HTTP status.
// These denials must never be surfaced as uncertain operations inviting replay.
const retryTemp=await mkdtemp(join(tmpdir(),"qiudazi-v8-report-resolution-retry-"));
try{
  const source=await readFile("src/domain/PlatformAdminReportResolution.ts","utf8");
  const compiled=ts.transpileModule(source,{fileName:"PlatformAdminReportResolution.ts",reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
  assert.equal(compiled.diagnostics?.length??0,0);
  const modulePath=join(retryTemp,"report-resolution-retry.mjs");
  await writeFile(modulePath,compiled.outputText,"utf8");
  const {makeReportResolutionAttempt,submitReportResolution}=await import(pathToFileURL(modulePath).href);
  const attempt=makeReportResolutionAttempt({
    reportId:"a1111111-1111-4111-8111-111111111111",version:4,decision:"resolved",
    reason:"Reviewed report evidence",requestId:"b1111111-1111-4111-8111-111111111111",
  });
  assert.ok(attempt);
  const edgeError=(code,status)=>({context:{...(status===null?{}:{status}),
    clone:()=>({json:async()=>({code})})}});
  for(const [code,kind] of [
    ["AUTH_REQUIRED","forbidden"],["PLATFORM_ADMIN_FORBIDDEN","forbidden"],
    ["REPORT_NOT_FOUND","not_found"],["REPORT_CONFLICT","conflict"],
    ["INVALID_REPORT_RESOLUTION","invalid"],["METHOD_NOT_ALLOWED","invalid"],
    ["SERVICE_UNAVAILABLE","uncertain"],["REPORT_RESOLUTION_UNAVAILABLE","uncertain"],
  ]){
    for(const status of [null,0]){
      const result=await submitReportResolution(async()=>({data:null,error:edgeError(code,status)}),attempt);
      assert.deepEqual(result,{kind},`${code} status=${status}`);
    }
  }
  for(const [status,kind] of [[405,"invalid"],[422,"invalid"],[408,"uncertain"],[429,"uncertain"]]){
    const result=await submitReportResolution(async()=>({data:null,error:{context:{status}}}),attempt);
    assert.deepEqual(result,{kind},`HTTP ${status}`);
  }
  const malformed=await submitReportResolution(async()=>({data:null,error:{context:{
    clone:()=>({json:async()=>{throw Error("body unavailable");}}),
  }}}),attempt);
  assert.deepEqual(malformed,{kind:"uncertain"},"unreadable response remains uncertain");
  console.log("PASS: V8 report resolution terminal Edge codes are not retried without HTTP status");
}finally{await rm(retryTemp,{recursive:true,force:true});}

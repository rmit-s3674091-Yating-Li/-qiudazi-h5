/** Client contract only. Edge verifies JWT; the PostgreSQL transaction reauthorizes and audits. */
export type ReportResolutionDecision = "resolved" | "dismissed";
export type ReportResolutionAttempt = { report_id: string; expected_version: number; decision: ReportResolutionDecision; reason: string; request_id: string; confirmed: true };
export type ReportResolutionReceipt = { request_id: string; report_id: string; status: ReportResolutionDecision; version: number; replayed: boolean };
export type ReportResolutionOutcome = { kind: "committed"; receipt: ReportResolutionReceipt } | { kind: "conflict" | "forbidden" | "not_found" | "invalid" | "uncertain" };
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value);
const exact=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const validUuid=(value:unknown):value is string=>typeof value==="string"&&uuid.test(value);
export function makeReportResolutionAttempt(input:{reportId:string;version:number;decision:ReportResolutionDecision;reason:string;requestId:string}):ReportResolutionAttempt|null{
  if(!validUuid(input.reportId)||!validUuid(input.requestId)||!Number.isSafeInteger(input.version)||input.version<1||input.version>=2147483647||(input.decision!=="resolved"&&input.decision!=="dismissed")||typeof input.reason!=="string")return null;
  const reason=input.reason.replace(/^ +| +$/g,"");if(Array.from(reason).length<10||Array.from(reason).length>1000)return null;
  return{report_id:input.reportId.toLowerCase(),expected_version:input.version,decision:input.decision,reason,request_id:input.requestId.toLowerCase(),confirmed:true};
}
export function parseReportResolutionReceipt(value:unknown,attempt:ReportResolutionAttempt):ReportResolutionReceipt|null{
  if(!isRecord(value)||!exact(value,["request_id","report_id","status","version","replayed"])||value.request_id!==attempt.request_id||value.report_id!==attempt.report_id||value.status!==attempt.decision||value.version!==attempt.expected_version+1||typeof value.replayed!=="boolean")return null;
  return value as ReportResolutionReceipt;
}
type EdgeResult={data:unknown;error:unknown};export type ReportResolutionInvoke=(name:string,options:{body:ReportResolutionAttempt})=>Promise<EdgeResult>;
function statusFromError(error:unknown):number|null{if(!isRecord(error)||!isRecord(error.context))return null;const status=error.context.status;return typeof status==="number"&&Number.isInteger(status)?status:null;}
/** Supabase FunctionsHttpError keeps the trusted Edge error code in its Response body.
 * A missing/invalid HTTP status must not turn an explicit denial into a retry. */
async function edgeFailureCode(error:unknown):Promise<string|null>{
  if(!isRecord(error)||!isRecord(error.context))return null;
  try{
    const context=error.context;
    const response=typeof context.clone==="function"?context.clone():context;
    if(!isRecord(response)||typeof response.json!=="function")return null;
    const body:unknown=await response.json();
    return isRecord(body)&&typeof body.code==="string"?body.code:null;
  }catch{return null;}
}
export async function submitReportResolution(invoke:ReportResolutionInvoke,attempt:ReportResolutionAttempt):Promise<ReportResolutionOutcome>{
  try{
    const{data,error}=await invoke("platform-admin-report-resolution",{body:attempt});
    if(error){
      const status=statusFromError(error),code=await edgeFailureCode(error);
      if(code==="AUTH_REQUIRED"||code==="PLATFORM_ADMIN_FORBIDDEN"||status===401||status===403)return{kind:"forbidden"};
      if(code==="REPORT_NOT_FOUND"||status===404)return{kind:"not_found"};
      if(code==="REPORT_CONFLICT"||status===409)return{kind:"conflict"};
      if(code==="INVALID_REPORT_RESOLUTION"||code==="METHOD_NOT_ALLOWED"||
        (status!==null&&status>=400&&status<500&&status!==408&&status!==429))return{kind:"invalid"};
      return{kind:"uncertain"};
    }
    const receipt=parseReportResolutionReceipt(data,attempt);
    return receipt?{kind:"committed",receipt}:{kind:"uncertain"};
  }catch{return{kind:"uncertain"};}
}

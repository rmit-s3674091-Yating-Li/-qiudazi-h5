import assert from 'node:assert/strict';
import { CASES, BLIND, checkOne, verifyPreview, runMatrix } from './v8-venue-poi-regression.mjs';
const sha='4117b1861eef11ea77fdd38591fefc1b15e726da';
const base='https://example-preview.vercel.app';
const poi={uid:'a',name:'奥林匹克森林公园',city:'北京市',address:'北京市朝阳区',location:{lat:40.02,lng:116.38}};
assert.equal(CASES.length,30);assert.equal(BLIND.length,9);
assert.equal(CASES[0][2],'奥森');assert.equal(CASES[1][2],'绿心公园');
const fake=async (url,opts={})=>{
  if(String(url).includes('/build-meta.json')) return {ok:true,json:async()=>({sha,ref:'feature/v8-confirmed-20261011'})};
  assert.equal(opts.headers.Authorization,'Bearer local-fixture-token');
  assert.equal(url.searchParams.get('region'),'北京');
  return {status:200,json:async()=>({status:0,results:[poi],search_diagnostics:{merged_count:1,endpoints:[
    {endpoint:'v3_suggestion',query_variant:'奥森',status:0,health:null,raw_count:2,valid_coordinate_count:1,city_retained_count:1}
  ]}})};
};
const result=await checkOne({base,sha,token:'local-fixture-token',city:'北京',type:'公园',query:'奥森',canonical:'奥林匹克森林公园',fetchImpl:fake});
assert.equal(result.failure_stage,null);assert.equal(result.api_raw_count,2);assert.equal(result.valid_coordinate_count,1);
assert.equal(result.city_retained_count,1);assert.equal(result.matched_count,1);assert.deepEqual(result.match_types,['ALIAS']);
assert.equal(result.selection_confirmed,'NOT_VERIFIED');
const wrong=await checkOne({base,sha,token:'local-fixture-token',city:'北京',type:'公园',query:'奥森',canonical:'奥林匹克森林公园',fetchImpl:async()=>({status:200,json:async()=>({status:0,results:[{...poi,city:'上海市'}]})})});
assert.equal(wrong.failure_stage,'CROSS_CITY_CANDIDATE');
const missing=await checkOne({base,sha,token:'local-fixture-token',city:'北京',type:'公园',query:'奥森',canonical:'奥林匹克森林公园',fetchImpl:async()=>({status:200,json:async()=>({status:0,results:[]})})});
assert.equal(missing.failure_stage,'PROXY_EMPTY');assert.equal(missing.api_raw_count,'NOT_EXPOSED');
for (const [status,expected] of [[401,'AUTH_OR_PREVIEW_PROTECTION'],[403,'AUTH_OR_PREVIEW_PROTECTION'],[429,'RATE_LIMIT'],[502,'UPSTREAM_OR_PROXY:BAIDU_PLACE_UPSTREAM_ERROR'],[504,'PROXY_TIMEOUT']]) {
  const r=await checkOne({base,sha,token:'local-fixture-token',city:'北京',type:'公园',query:'奥森',canonical:'奥林匹克森林公园',fetchImpl:async()=>({status,json:async()=>({error:'BAIDU_PLACE_UPSTREAM_ERROR'})})});
  assert.equal(r.failure_stage,expected);
}
const negative=await checkOne({base,sha,token:'local-fixture-token',city:'北京',type:'负例',query:'虚构紫薯网球场Z',canonical:'虚构紫薯网球场Z',fetchImpl:async()=>({status:200,json:async()=>({status:0,results:[]})})});
assert.equal(negative.failure_stage,null);
const negativeFalsePositive=await checkOne({base,sha,token:'local-fixture-token',city:'北京',type:'负例',query:'虚构紫薯网球场Z',canonical:'虚构紫薯网球场Z',fetchImpl:async()=>({status:200,json:async()=>({status:0,results:[poi]})})});
assert.equal(negativeFalsePositive.failure_stage,'FALSE_POSITIVE_NEGATIVE_QUERY');
await assert.rejects(verifyPreview({base,sha,fetchImpl:async()=>({ok:true,json:async()=>({sha:'0'.repeat(40)})})}),/PREVIEW_SHA_MISMATCH/);
await assert.rejects(verifyPreview({base:'http://external.example',sha,fetchImpl:fake}),/HTTPS_PREVIEW_REQUIRED/);
const report=await runMatrix({base,sha,token:'local-fixture-token',fetchImpl:fake,delayMs:0,limit:1});
assert.equal(report.requests,1);assert.equal(report.failed.length,0);assert.equal(report.rows[0].sha,sha);
const dual=await runMatrix({base,sha,token:'local-fixture-token',fetchImpl:fake,delayMs:0,limit:2});
assert.deepEqual(dual.rows.map(row=>row.mode),['NATURAL','CANONICAL']);
console.log('PASS: 30+9 matrix fixtures, SHA gate, city and status classification, safe counts, unverified UI contract');

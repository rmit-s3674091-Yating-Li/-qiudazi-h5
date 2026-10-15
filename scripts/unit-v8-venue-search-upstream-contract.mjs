import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

process.env.BAIDU_MAP_AK = 'fixture-secret-ak';
const moduleUrl = pathToFileURL(resolve('api/venue-search.js')).href;
const {default: handler} = await import(moduleUrl);
const ok = (body, status = 200) => ({ok: status >= 200 && status < 300, status, json: async () => body});
const validEmpty = {status: 0, results: []};

async function run(label, mapResponse, {authOk=true, query='网球中心'}={}) {
  let mapCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if(url.includes('/auth/v1/user')) return ok({id: 'actor'}, authOk ? 200 : 401);
    mapCalls++;
    return mapResponse(url, mapCalls);
  };
  let status = 0, body, headers = {};
  const res = { setHeader(key, value) {headers[key] = value;}, status(value) {status = value; return this;}, json(value) {body = value; return this;} };
  await handler({method:'GET',headers:{authorization:'Bearer test-token'},query:{query,region:'北京'}},res);
  assert.equal(headers['Cache-Control'],'no-store',label);
  assert.ok(status,label);
  assert.ok(!JSON.stringify(body).includes('fixture-secret-ak'),label);
  return {status,body,mapCalls};
}

const empty = await run('real empty',()=>ok(validEmpty));
assert.equal(empty.status,200);assert.deepEqual(empty.body.results,[]);assert.equal(empty.mapCalls,4);
const malformed = await run('malformed 200',()=>ok({message:'broken schema'}));assert.equal(malformed.status,502);assert.equal(malformed.body.error,'BAIDU_PLACE_INVALID_RESPONSE');
const badJson = await run('HTTP 200 invalid JSON',()=>({ok:true,json:async()=>{throw new Error('invalid JSON')}}));assert.equal(badJson.status,502);assert.equal(badJson.body.error,'BAIDU_PLACE_INVALID_RESPONSE');
const malformedResults = await run('status zero missing results',()=>ok({status:0}));assert.equal(malformedResults.status,502);assert.equal(malformedResults.body.error,'BAIDU_PLACE_INVALID_RESPONSE');
const quota = await run('business 302',()=>ok({status:302,message:'quota'}));assert.equal(quota.status,502);assert.equal(quota.body.error,'BAIDU_PLACE_UPSTREAM_ERROR');assert.deepEqual(quota.body.upstream_statuses,[302]);
const partialHttp = await run('mixed success and HTTP failure',(_,i)=> i%2 ? ok(validEmpty) : ok({message:'gateway'},503));assert.equal(partialHttp.status,502);assert.equal(partialHttp.body.error,'BAIDU_PLACE_HTTP_ERROR');
const mixedBusiness = await run('mixed empty and business failure',(_,i)=> i%2 ? ok(validEmpty) : ok({status:210,message:'bad parameter'}));assert.equal(mixedBusiness.status,502);assert.deepEqual(mixedBusiness.body.upstream_statuses,[210]);
const poi={uid:'venue-1',name:'国家网球中心',address:'北京市朝阳区',city:'北京市',location:{lat:39.99,lng:116.39}};
const success = await run('valid candidate',(_,i)=>i===1 ? ok({status:0,results:[poi]}) : ok({status:0,results:[]}));assert.equal(success.status,200);assert.equal(success.body.results.length,1);assert.equal(success.body.results[0].uid,'venue-1');

for (const [label, location] of [
  ['latitude outside range', {lat:91,lng:116.39}], ['longitude outside range', {lat:39.99,lng:181}],
  ['missing latitude', {lng:116.39}], ['null latitude', {lat:null,lng:116.39}], ['blank latitude', {lat:' ',lng:116.39}],
  ['non-numeric latitude', {lat:'invalid',lng:116.39}], ['non-finite longitude', {lat:39.99,lng:'Infinity'}], ['boolean latitude', {lat:false,lng:116.39}],
]) {
  const invalid = await run(label,(_,i)=>i===1 ? ok({status:0,results:[{...poi,location}]}) : ok(validEmpty));
  assert.equal(invalid.status,502,label);assert.equal(invalid.body.error,'BAIDU_PLACE_INVALID_RESPONSE',label);
}
const mixedCoordinates = await run('drop bad candidate, keep valid',(_,i)=>i===1 ? ok({status:0,results:[{...poi,uid:'bad',location:{lat:91,lng:116}},poi]}) : ok(validEmpty));assert.deepEqual(mixedCoordinates.body.results.map(item=>item.uid),['venue-1']);
const stringCoordinates = await run('numeric string coordinates are valid',(_,i)=>i===1 ? ok({status:0,results:[{...poi,location:{lat:'39.99',lng:'116.39'}}]}) : ok(validEmpty));assert.equal(stringCoordinates.status,200);
const invalidChild = await run('reject malformed child coordinate',(_,i)=>i===1 ? ok({status:0,results:[{...poi,children:[{uid:'child-invalid',name:'invalid court',location:{lat:100,lng:116.39}},{uid:'child-valid',name:'court 1',location:{lat:39.991,lng:116.391}}]}]}) : ok(validEmpty));assert.deepEqual(invalidChild.body.results.map(item=>item.uid),['venue-1','child-valid']);
const suggestionSingular = await run('legacy suggestion result array',(_,i)=>i===1 ? ok({status:0,result:[poi]}) : ok({status:0,results:[]}));assert.equal(suggestionSingular.status,200);assert.equal(suggestionSingular.body.results.length,1);
const fallbackSingular = await run('v2 fallback result array',(_,i)=>i===3 ? ok({status:0,result:[poi]}) : ok(validEmpty));assert.equal(fallbackSingular.status,200);assert.equal(fallbackSingular.body.results.length,1);
const partialResults = await run('candidate survives partial upstream failure',(_,i)=>i===1 ? ok({status:0,results:[poi]}) : ok({message:'broken'}));assert.equal(partialResults.status,200);assert.equal(partialResults.body.results.length,1);
const offline = await run('network failure',()=>{throw new Error('offline')});assert.equal(offline.status,502);assert.equal(offline.body.error,'BAIDU_PLACE_NETWORK_ERROR');
const denied = await run('auth denied',()=>{throw new Error('should not query POI')},{authOk:false});assert.equal(denied.status,401);assert.equal(denied.mapCalls,0);
console.log('V8 venue search upstream response contract tests passed.');

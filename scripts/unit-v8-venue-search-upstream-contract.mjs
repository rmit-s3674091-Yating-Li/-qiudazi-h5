import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
process.env.BAIDU_MAP_AK='fixture-secret-ak';
const {default:handler}=await import(pathToFileURL(resolve('api/venue-search.js')).href);
const ok=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
const validEmpty={status:0,results:[]};
async function run(label,mapResponse,{authOk=true,query='网球中心'}={}){let mapCalls=0;globalThis.fetch=async input=>{const url=String(input);if(url.includes('/auth/v1/user'))return ok({id:'actor'},authOk?200:401);mapCalls++;return mapResponse(url,mapCalls)};let status=0,body,headers={};const res={setHeader(k,v){headers[k]=v},status(v){status=v;return this},json(v){body=v;return this}};await handler({method:'GET',headers:{authorization:'Bearer test-token'},query:{query,region:'北京'}},res);assert.equal(headers['Cache-Control'],'no-store',label);assert.ok(status,label);assert.ok(!JSON.stringify(body).includes('fixture-secret-ak'),label);return{status,body,mapCalls}}
const empty=await run('real empty',()=>ok(validEmpty));assert.equal(empty.status,200);assert.deepEqual(empty.body.results,[]);
const malformed=await run('malformed 200',()=>ok({message:'broken schema'}));assert.equal(malformed.status,502);assert.equal(malformed.body.error,'BAIDU_PLACE_INVALID_RESPONSE');
const poi={uid:'venue-1',name:'国家网球中心',address:'北京市朝阳区',city:'北京市',location:{lat:39.99,lng:116.39}};
const success=await run('valid candidate',(_,i)=>i===1?ok({status:0,results:[poi]}):ok(validEmpty));assert.equal(success.status,200);assert.equal(success.body.results[0].uid,'venue-1');
for(const [label,location] of [['latitude outside range',{lat:91,lng:116.39}],['longitude outside range',{lat:39.99,lng:181}],['missing latitude',{lng:116.39}],['null latitude',{lat:null,lng:116.39}],['blank latitude',{lat:' ',lng:116.39}],['non-numeric latitude',{lat:'invalid',lng:116.39}],['non-finite longitude',{lat:39.99,lng:'Infinity'}],['boolean latitude',{lat:false,lng:116.39}]]){const invalid=await run(label,(_,i)=>i===1?ok({status:0,results:[{...poi,location}]}):ok(validEmpty));assert.equal(invalid.status,502,label);assert.equal(invalid.body.error,'BAIDU_PLACE_INVALID_RESPONSE',label)}
const mixed=await run('drop bad candidate, keep valid',(_,i)=>i===1?ok({status:0,results:[{...poi,uid:'bad',location:{lat:91,lng:116}},poi]}):ok(validEmpty));assert.deepEqual(mixed.body.results.map(x=>x.uid),['venue-1']);
const stringCoords=await run('numeric string coordinates',(_,i)=>i===1?ok({status:0,results:[{...poi,location:{lat:'39.99',lng:'116.39'}}]}):ok(validEmpty));assert.equal(stringCoords.status,200);
const invalidChild=await run('child coordinates',(_,i)=>i===1?ok({status:0,results:[{...poi,children:[{uid:'bad-child',name:'bad',location:{lat:100,lng:116.39}},{uid:'good-child',name:'court 1',location:{lat:39.991,lng:116.391}}]}]}):ok(validEmpty));assert.deepEqual(invalidChild.body.results.map(x=>x.uid),['venue-1','good-child']);
const quota=await run('business 302',()=>ok({status:302,message:'quota'}));assert.equal(quota.status,502);assert.equal(quota.body.error,'BAIDU_PLACE_UPSTREAM_ERROR');
const offline=await run('network failure',()=>{throw new Error('offline')});assert.equal(offline.status,502);assert.equal(offline.body.error,'BAIDU_PLACE_NETWORK_ERROR');
console.log('V8 venue search upstream response contract tests passed.');

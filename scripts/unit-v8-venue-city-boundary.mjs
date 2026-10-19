import assert from "node:assert/strict";
import handler from "../api/venue-search.js";

const originalFetch=globalThis.fetch;
const originalAk=process.env.BAIDU_MAP_AK;
process.env.BAIDU_MAP_AK="test-server-only-ak";

function poi(name,city,address,number){return {uid:`poi-${number}`,name,city,address,location:{lat:39.9,lng:116.4}};}
async function request({query="网球中心",region="北京",status=0,results=[],ak=true,authenticated=true}={}){
  process.env.BAIDU_MAP_AK=ak?"test-server-only-ak":"";
  const requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(input);requested.push(url);
    if(url.pathname==="/auth/v1/user")return {ok:authenticated,json:async()=>({id:"test-user"})};
    assert.equal(url.searchParams.get("region"),region);
    return {ok:true,json:async()=>({status,results:url.pathname.includes("suggestion")?results:[]})};
  };
  const response={statusCode:200,body:null,headers:{},setHeader(key,value){this.headers[key]=value;return this;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  await handler({method:"GET",headers:{authorization:"Bearer test-jwt"},query:{query,region}},response);
  return {response,requested};
}
try{
  const foreign=Array.from({length:25},(_,i)=>poi(`外地场馆${i}`,"上海市","上海市浦东新区",i));
  const local=[poi("国家网球中心","北京市","北京市朝阳区",100),poi("奥森网球中心","","北京市朝阳区林萃路",101),poi("无城市依据","","朝阳区某路",102)];
  const {response,requested}=await request({results:[...foreign,...local]});
  assert.equal(response.statusCode,200);
  assert.deepEqual(response.body.results.map(x=>x.name),["国家网球中心","奥森网球中心"]);
  assert.equal(response.body.total,2);
  assert.ok(requested.some(x=>x.pathname.includes("place/v3/suggestion")));
  for(const keyword of ["奥森","国家网球","绿心","网球中心"]){
    const keywordResult=await request({query:keyword,region:"北京",results:[poi("北京市匹配场馆","北京市","北京市朝阳区",600)]});
    assert.equal(keywordResult.response.statusCode,200,`HTTP contract: ${keyword}`);
    assert.equal(keywordResult.response.body.total,1,`City filter: ${keyword}`);
  }
  assert.equal((await request({region:"成都",results:[poi("成都网球中心","","四川省成都市青羊区",200),poi("重庆场馆","重庆市","重庆市渝中区",201)]})).response.body.total,1);
  assert.equal((await request({region:"上海市",results:[poi("上海场馆","上海","浦东新区",300)]})).response.body.total,1);
  assert.equal((await request({region:"北京",results:[poi("无城市依据","","朝阳区某路",400)]})).response.body.total,0);
  assert.equal((await request({region:"全国",results:[poi("上海场馆","上海","上海市浦东新区",500)]})).response.body.total,1);
  const noResults=await request({results:[]});assert.equal(noResults.response.statusCode,200);assert.equal(noResults.response.body.total,0);
  const upstream=await request({status:302,results:[]});assert.equal(upstream.response.statusCode,502);assert.equal(upstream.response.body.error,"BAIDU_PLACE_UPSTREAM_ERROR");
  const noAk=await request({ak:false});assert.equal(noAk.response.statusCode,503);assert.equal(noAk.response.body.error,"BAIDU_MAP_AK_MISSING");
  const unauthorized=await request({authenticated:false});assert.equal(unauthorized.response.statusCode,401);
  console.log("Venue city-boundary and upstream-status tests passed.");
}finally{globalThis.fetch=originalFetch;if(originalAk===undefined)delete process.env.BAIDU_MAP_AK;else process.env.BAIDU_MAP_AK=originalAk;}

await import("./unit-v8-venue-location-privacy.mjs");

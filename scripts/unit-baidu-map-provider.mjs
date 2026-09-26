import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import ts from "typescript";
const root=new URL("../",import.meta.url),tmp=await mkdtemp(join(tmpdir(),"qiudazi-baidu-"));
async function compile(path,out){const source=await readFile(new URL(path,root),"utf8");const result=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,verbatimModuleSyntax:true},fileName:path});await writeFile(join(tmp,out),result.outputText.replace(/(from\s+["'](?:\.\.?\/)[^"']+)\.ts(["'])/g,"$1.js$2").replace(/export function createConfiguredBaiduMapProvider[\s\S]*$/,""),"utf8");return source}
try{
  await compile("src/utils/mapProvider.ts","mapProvider.js");const source=await compile("src/utils/baiduMapProvider.ts","baiduMapProvider.js");const {createBaiduMapProvider}=await import(pathToFileURL(join(tmp,"baiduMapProvider.js")).href+`?v=${Date.now()}`);
  assert.match(source,/import\.meta\.env\.VITE_BAIDU_MAP_AK/);assert.doesNotMatch(source,/VITE_BAIDU_MAP_AK\s*[:=]\s*["'][^"']+["']/);
  const missing=createBaiduMapProvider({ak:"",fetchImpl:async()=>{throw new Error("must not fetch")}});await assert.rejects(()=>missing.searchPlaces("网球中心"),/BAIDU_MAP_AK_MISSING/);assert.deepEqual(await missing.searchPlaces("   "),[]);
  let requested="";const provider=createBaiduMapProvider({ak:"test-publishable-ak",region:"上海",fetchImpl:async input=>{requested=input;return {ok:true,json:async()=>({status:0,results:[{uid:"poi-1",name:" 上海网球中心 ",address:"浦东新区示例路",location:{lat:31.2,lng:121.5}},{uid:"bad",name:"bad",address:"bad",location:{lat:999,lng:121}}]})}}});
  const places=await provider.searchPlaces(" 网球中心 ");assert.equal(places.length,1);assert.deepEqual(places[0],{name:"上海网球中心",address:"浦东新区示例路",latitude:31.2,longitude:121.5,provider:"baidu",placeId:"poi-1"});assert.match(requested,/place\/v2\/search/);assert.match(requested,/query=%E7%BD%91%E7%90%83%E4%B8%AD%E5%BF%83/);assert.match(requested,/region=%E4%B8%8A%E6%B5%B7/);assert.match(requested,/ak=test-publishable-ak/);
  const providerError=createBaiduMapProvider({ak:"x",fetchImpl:async()=>({ok:true,json:async()=>({status:302,message:"bad ak"})})});await assert.rejects(()=>providerError.searchPlaces("场地"),/BAIDU_PLACE_ERROR:302/);
  console.log("Baidu map provider unit tests passed.");
}finally{await rm(tmp,{recursive:true,force:true})}

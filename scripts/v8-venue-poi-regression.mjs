#!/usr/bin/env node
// V8 P3: authenticated, read-only POI recall matrix against an exact-SHA Preview.
// Never writes a repository/database or prints bearer tokens/cookies.
import { writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CASES = [
  ['北京','公园','奥森','奥林匹克森林公园'],
  ['北京','公园','绿心公园','北京城市绿心森林公园'],
  ['北京','地铁','林萃桥','林萃桥地铁站'],
  ['北京','地铁','望京西站','望京西地铁站'],
  ['北京','小区','天通苑北一区','天通苑北一区'],
  ['北京','小区','龙泽苑','龙泽苑'],
  ['北京','网球','国家网球中心','国家网球中心'],
  ['北京','网球','朝阳公园网球中心','朝阳公园-网球中心'],
  ['北京','网球','北京市网球运动管理中心','北京市网球运动管理中心'],
  ['北京','体育','丰台体育中心','丰台体育中心'],
  ['上海','地铁','徐家汇站','徐家汇地铁站'],
  ['上海','地铁','龙阳路','龙阳路地铁站'],
  ['上海','小区','古北国际花园','古北国际花园'],
  ['上海','小区','仁恒河滨城','仁恒河滨城'],
  ['上海','网球','旗忠网球中心','上海旗忠森林体育城网球中心'],
  ['上海','网球','仙霞网球中心','上海市仙霞网球中心'],
  ['上海','网球','闵行体育公园网球场','闵行体育公园-网球场'],
  ['上海','体育','徐家汇体育公园','徐家汇体育公园'],
  ['上海','公园','世纪公园','上海世纪公园'],
  ['成都','地铁','犀浦站','犀浦站'],
  ['成都','地铁','天府三街站','天府三街地铁站'],
  ['成都','小区','麓湖生态城','麓湖生态城'],
  ['成都','小区','华润二十四城','华润二十四城'],
  ['成都','网球','四川国际网球中心','四川川投国际网球中心'],
  ['成都','体育','凤凰山体育公园','凤凰山体育公园'],
  ['成都','体育','东安湖体育公园','东安湖体育公园'],
  ['成都','公园','桂溪生态公园','桂溪生态公园'],
  ['成都','地标','环球中心','成都环球中心'],
  ['成都','地标','成都大熊猫繁育研究基地','成都大熊猫繁育研究基地'],
  ['成都','地铁','金融城站','金融城地铁站'],
];
// Holdout cases are selected per run from a larger, non-production-coded pool.
const BLIND_POOL = [
  ['北京','地铁','清河站','清河站'],
  ['北京','体育','五棵松体育馆','五棵松体育馆'],
  ['北京','公园','玉渊潭公园','玉渊潭公园'],
  ['北京','体育','北京工人体育场','北京工人体育场'],
  ['北京','地铁','北京西站','北京西站'],
  ['北京','公园','陶然亭公园','陶然亭公园'],
  ['上海','地铁','虹桥火车站','虹桥火车站'],
  ['上海','体育','静安体育中心','静安体育中心'],
  ['上海','地标','静安寺','静安寺'],
  ['上海','公园','顾村公园','顾村公园'],
  ['上海','体育','上海体育场','上海体育场'],
  ['成都','地铁','成都东站','成都东站'],
  ['成都','体育','成都体育学院','成都体育学院'],
  ['成都','地标','宽窄巷子','宽窄巷子'],
  ['成都','公园','人民公园','成都人民公园'],
  ['成都','地标','天府广场','天府广场'],
];
function sampleHoldout() {
  const shuffled=[...BLIND_POOL];
  for(let i=shuffled.length-1;i>0;i--){const j=randomBytes(4).readUInt32BE(0)%(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
  const nonce=randomBytes(4).toString('hex');
  return [...shuffled.slice(0,7),
    ['北京','负例',`虚构紫薯网球场${nonce}`,`虚构紫薯网球场${nonce}`],
    ['成都','负例',`不存在的蓝鲸小区${nonce}`,`不存在的蓝鲸小区${nonce}`]];
}
export const BLIND=sampleHoldout();

const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s·•・()（）\-_/]/g,'');
const clean = value => typeof value === 'string' ? value.trim() : '';
const asArray = value => Array.isArray(value) ? value : [];
const cities = ['北京','上海','成都'];
function coordinatesValid(place) {
  const lat = Number(place?.location?.lat), lng = Number(place?.location?.lng);
  return place?.location && place.location.lat != null && place.location.lng != null &&
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= 0.8293 && lat <= 55.8271 &&
    lng >= 72.004 && lng <= 137.8347;
}
function cityEvidence(place, city) {
  const explicit = clean(place?.city).replace(/市$/u,'');
  const address = clean(place?.address);
  if (explicit) return explicit === city ? 'CITY_MATCH' : 'WRONG_CITY';
  const province = clean(place?.province).replace(/市$/u,'');
  if (province && cities.includes(province)) return province === city ? 'CITY_MATCH' : 'WRONG_CITY';
  const addressed = cities.find(item => address.includes(`${item}市`));
  return addressed ? (addressed === city ? 'CITY_MATCH' : 'WRONG_CITY') : 'CITY_UNVERIFIED';
}
function nameMatch(name, query, canonical) {
  const n=normalize(name), q=normalize(query), c=normalize(canonical);
  if (!n) return 'NONE';
  if (n === q) return 'EXACT_NAME';
  if (n === c || n.includes(c) || c.includes(n) && n.length >= 4) return 'ALIAS';
  if (n.includes(q) || q.includes(n) && n.length >= 4) return 'PARTIAL';
  return 'NONE';
}
function classifyFailure(httpStatus, body, count, wrongCity, cityUnverified) {
  if (httpStatus === 401 || httpStatus === 403) return 'AUTH_OR_PREVIEW_PROTECTION';
  if (httpStatus === 429) return 'RATE_LIMIT';
  if (httpStatus === 504) return 'PROXY_TIMEOUT';
  if (httpStatus >= 500) return `UPSTREAM_OR_PROXY:${clean(body?.error)||httpStatus}`;
  if (httpStatus !== 200) return `HTTP_${httpStatus}`;
  if (body?.status !== 0 || !Array.isArray(body?.results)) return 'MALFORMED_PROXY_RESPONSE';
  if (wrongCity) return 'CROSS_CITY_CANDIDATE';
  if (cityUnverified) return 'CITY_NOT_PROVEN';
  if (!count) return asArray(body?.results).length ? 'REFERENCE_NOT_IN_PROXY_RESULTS' : 'PROXY_EMPTY';
  return null;
}
export async function checkOne({base,sha,token,cookie='',city,type,query,canonical,mode='NATURAL',fetchImpl=fetch,timeoutMs=14000}) {
  const url = new URL('/api/venue-search',base);
  url.searchParams.set('query',query);
  url.searchParams.set('region',city);
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),timeoutMs);
  let response, body;
  try {
    response = await fetchImpl(url,{headers:{Authorization:`Bearer ${token}`,...(cookie?{Cookie:cookie}:{})},signal:controller.signal});
    body = await response.json().catch(()=>null);
  } catch (error) {
    return {sha,city,type,query,canonical,mode,http_status:null,proxy_error:'NETWORK_OR_TIMEOUT',failure_stage:error?.name==='AbortError'?'CLIENT_TIMEOUT':'NETWORK',
      api_raw_count:'NOT_EXPOSED',valid_coordinate_count:'NOT_EXPOSED',city_retained_count:'NOT_EXPOSED',rank_count:'NOT_VERIFIED',selectable_count:0,
      pin_address_fill:'NOT_VERIFIED',selection_confirmed:'NOT_VERIFIED'};
  } finally {clearTimeout(timer);}
  const results = asArray(body?.results);
  const valid = results.filter(coordinatesValid);
  const wrongCity = valid.some(place=>cityEvidence(place,city)==='WRONG_CITY');
  const cityUnverified = valid.some(place=>cityEvidence(place,city)==='CITY_UNVERIFIED');
  const selectable = valid.filter(place=>cityEvidence(place,city)==='CITY_MATCH');
  const matched = selectable.filter(place=>nameMatch(place.name,query,canonical)!=='NONE');
  const diagnostics = body?.search_diagnostics;
  const endpoints = asArray(diagnostics?.endpoints);
  const count = field => endpoints.length ? endpoints.reduce((sum,item)=>sum+(Number.isFinite(item?.[field])?item[field]:0),0) : 'NOT_EXPOSED';
  const baselineFailure = classifyFailure(response.status,body,matched.length,wrongCity,cityUnverified);
  const failure = type==='负例' && response.status===200 && body?.status===0
    ? (results.length ? 'FALSE_POSITIVE_NEGATIVE_QUERY' : null) : baselineFailure;
  return {sha,city,type,query,canonical,mode,http_status:response.status,proxy_error:clean(body?.error)||null,
    upstream_statuses:endpoints.map(x=>({endpoint:x.endpoint,query_variant:x.query_variant||null,status:x.status,health:x.health})),
    api_raw_count:count('raw_count'),valid_coordinate_count:count('valid_coordinate_count'),city_retained_count:count('city_retained_count'),
    proxy_merged_count:Number.isInteger(diagnostics?.merged_count)?diagnostics.merged_count:'NOT_EXPOSED',
    returned_count:results.length,valid_returned_count:valid.length,city_proven_count:selectable.length,
    matched_count:matched.length,match_types:[...new Set(matched.map(place=>nameMatch(place.name,query,canonical)))],
    wrong_city:wrongCity,city_unverified:cityUnverified,rank_count:'NOT_VERIFIED',selectable_count:'NOT_VERIFIED',
    pin_address_fill:'NOT_VERIFIED',selection_confirmed:'NOT_VERIFIED',
    candidate_preview:matched.slice(0,3).map(place=>({name:place.name,address:place.address,uid:place.uid||null})),
    failure_stage:failure};
}
export async function verifyPreview({base,sha,cookie='',fetchImpl=fetch}) {
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('EXACT_40_CHARACTER_SHA_REQUIRED');
  const url = new URL(base);
  if (url.protocol !== 'https:' && !(url.protocol==='http:' && ['127.0.0.1','localhost'].includes(url.hostname))) throw new Error('HTTPS_PREVIEW_REQUIRED');
  const response = await fetchImpl(new URL('/build-meta.json',url),{headers:cookie?{Cookie:cookie}:{}});
  if (!response.ok) throw new Error(`PREVIEW_BUILD_META_HTTP_${response.status}`);
  const meta = await response.json();
  if (meta?.sha !== sha) throw new Error(`PREVIEW_SHA_MISMATCH:${clean(meta?.sha)||'missing'}`);
  return {sha:meta.sha,ref:meta.ref};
}
export async function runMatrix({base,sha,token,cookie='',fetchImpl=fetch,delayMs=350,limit=Infinity}) {
  await verifyPreview({base,sha,cookie,fetchImpl});
  const rows=[];
  for (const [city,type,natural,canonical] of [...CASES,...BLIND]) {
    for (const [mode,query] of [['NATURAL',natural],...(normalize(natural)!==normalize(canonical)?[['CANONICAL',canonical]]:[])]) {
      if (rows.length >= limit) break;
      rows.push(await checkOne({base,sha,token,cookie,city,type,query,canonical,mode,fetchImpl}));
      if (delayMs) await new Promise(resolve=>setTimeout(resolve,delayMs));
    }
    if (rows.length >= limit) break;
  }
  await verifyPreview({base,sha,cookie,fetchImpl}); // Reject mutable aliases that changed SHA mid-run.
  return {checked_at:new Date().toISOString(),sha,base_origin:new URL(base).origin,case_count:CASES.length,blind_count:BLIND.length,
    requests:rows.length,failed:rows.filter(x=>x.failure_stage),rows,
    note:'Real upstream counts only when server emits search_diagnostics; client rank, pin, address fill, keyboard and iPhone remain NOT_VERIFIED until browser/device testing.'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = name => {const prefix=`--${name}=`;return process.argv.find(x=>x.startsWith(prefix))?.slice(prefix.length)||''};
  const base=arg('preview'),sha=arg('sha'),out=arg('out'),token=process.env.VENUE_TEST_JWT||'',cookie=process.env.VENUE_TEST_COOKIE||'';
  if (!base||!sha||!token||!out|| (arg('limit') && (!Number.isInteger(Number(arg('limit'))) || Number(arg('limit')) <= 0))) {
    console.error('Usage: VENUE_TEST_JWT=<authorized-test-token> node scripts/v8-venue-poi-regression.mjs --preview=https://... --sha=<exact40> --out=/tmp/venue-poi-report.json [--limit=5]');
    process.exitCode=2;
  } else {
    try {
      const report=await runMatrix({base,sha,token,cookie,limit:arg('limit')?Number(arg('limit')):Infinity});
      await writeFile(out,JSON.stringify(report,null,2)+'\n','utf8');
      console.log(`Checked ${report.requests} queries; failures ${report.failed.length}; report ${out}`);
      if (report.failed.length) process.exitCode=1;
    } catch(error) {console.error(`NOT_VERIFIED: ${error.message}`);process.exitCode=2;}
  }
}

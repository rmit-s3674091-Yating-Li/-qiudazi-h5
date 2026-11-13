import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Local-only fixture AK; never calls a real map endpoint.
process.env.BAIDU_MAP_AK = 'fixture-ak-no-network';
const { default: handler } = await import(pathToFileURL(resolve('api/venue-search.js')).href);
const ok = body => ({ ok: true, status: 200, json: async () => body });
const empty = { status: 0, results: [] };
const offCity = { uid: 'wrong-city', name: '奥林匹克森林公园', address: '上海市浦东新区', city: '上海市', location: { lat: 31.23, lng: 121.47 } };
const canonical = { uid: 'correct-park', name: '奥林匹克森林公园', address: '北京市朝阳区', city: '北京市', location: { lat: 40.03, lng: 116.39 } };
const broad = Array.from({ length: 20 }, (_, index) => ({
  uid: `broad-${index}`, name: `普通活动地点${index}`, address: '北京市朝阳区',
  city: '北京市', location: { lat: 39.90 + index * 0.0001, lng: 116.40 },
}));

let mapCalls = 0;
globalThis.fetch = async input => {
  const url = String(input);
  if (url.includes('/auth/v1/user')) return ok({ id: '11111111-1111-4111-8111-111111111111' });
  mapCalls++;
  const parsed = new URL(url);
  const variant = parsed.searchParams.get('query');
  const suggestion = parsed.pathname.endsWith('/suggestion');
  if (variant === '奥森' && suggestion) return ok({ status: 0, results: broad });
  if (variant === '奥林匹克森林公园' && suggestion) return ok({ status: 0, results: [offCity, canonical, canonical] });
  return ok(empty);
};
let status, body;
const res = {
  setHeader() {},
  status(value) { status = value; return this; },
  json(value) { body = value; return this; },
};
await handler({ method: 'GET', headers: { authorization: 'Bearer local-test' }, query: { query: '奥森', region: '北京' } }, res);
assert.equal(status, 200);
assert.ok(mapCalls >= 4, 'both original and canonical alias variants must be queried');
assert.ok(body.query_variants.includes('奥林匹克森林公园'));
assert.equal(body.results.length, 20, 'keep existing bounded response size');
assert.equal(body.results.filter(item => item.uid === canonical.uid).length, 1,
  'a valid later-variant canonical POI must survive an earlier full 20-result group');
assert.equal(body.results.some(item => item.uid === offCity.uid), false, 'never admit off-city candidates');
assert.equal(body.results.filter(item => item.uid?.startsWith('broad-')).length, 19,
  'retain broad alternatives while reserving visibility for canonical POI');
assert.equal(body.results.every(item => item.city === '北京市'), true);
assert.ok(!JSON.stringify(body).includes('fixture-ak-no-network'), 'do not leak proxy AK');
console.log('PASS: later-variant canonical POI survives cap; dedupe, city filter and bounded results preserved');

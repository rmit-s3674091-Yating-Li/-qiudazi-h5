import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createTrustedEndpointPolicy, guardedNetworkCall } from '../src/core/trusted-endpoint.ts'

const policy = () => createTrustedEndpointPolicy({
  credentialOrigins: ['https://test-project.supabase.co'],
  anonymousOrigins: ['https://poi.example.cn'],
})

test('exact HTTPS credential origin and harmless query are accepted', async () => {
  const p = policy()
  p.assert('https://test-project.supabase.co/rest/v1/events?select=id%2Cname', true)
  p.assert('https://poi.example.cn/search?q=%E7%BD%91%E7%90%83', false)
  p.assert('https://test-project.supabase.co/storage/v1/object/a', false)
  let calls = 0
  const value = await guardedNetworkCall(p, 'https://test-project.supabase.co/functions/v1/poc', 'mock-jwt', async () => { calls++; return 204 })
  assert.equal(value, 204)
  assert.equal(calls, 1)
})

test('credential never reaches map host, lookalike, userinfo, downgrade or alternate port', async () => {
  const p = policy()
  const bad = [
    'https://poi.example.cn/search',
    'https://test-project.supabase.co.evil.cn/rest/v1/events',
    'https://test-project.supabase.co@evil.cn/rest/v1/events',
    'http://test-project.supabase.co/rest/v1/events',
    'https://test-project.supabase.co:8443/rest/v1/events',
    '//test-project.supabase.co/rest/v1/events',
    'https://test-project.supabase.co//evil.cn',
    'https://test-project.supabase.co/../auth/v1/token',
    'https://test-project.supabase.co/%2e%2e/auth/v1/token',
    'https://test-project.supabase.co/rest/v1/events#fragment',
    'https://test-project.supabase.co/rest/v1/events?refresh_token=leak',
    'https://test-project.supabase.co/rest/v1/events\r\nX-Evil: 1',
  ]
  let calls = 0
  for (const url of bad) {
    await assert.rejects(guardedNetworkCall(p, url, 'mock-jwt', async () => { calls++; return true }), /UNTRUSTED_ENDPOINT/)
  }
  assert.equal(calls, 0)
})

test('anonymous map request allowed, but no bearer; empty or newline JWT rejected', async () => {
  const p = policy()
  assert.equal(await guardedNetworkCall(p, 'https://poi.example.cn/search', undefined, async () => 200), 200)
  await assert.rejects(guardedNetworkCall(p, 'https://poi.example.cn/search', 'secret', async () => 200), /UNTRUSTED_ENDPOINT/)
  await assert.rejects(guardedNetworkCall(p, 'https://test-project.supabase.co/auth/v1/user', '', async () => 200), /INVALID_JWT/)
  await assert.rejects(guardedNetworkCall(p, 'https://test-project.supabase.co/auth/v1/user', 'bad\r\nheader', async () => 200), /INVALID_JWT/)
  await assert.rejects(guardedNetworkCall(p, 'https://test-project.supabase.co/storage/v1/object/a', undefined, async () => 200, true), /AUTH_REQUIRED/)
})

test('no wildcard, http, path, query or empty origin can be configured', () => {
  for (const origin of ['http://test-project.supabase.co', 'https://*.supabase.co', 'https://test-project.supabase.co/rest', 'https://test-project.supabase.co?x=1', 'https://bad..cn', '']) {
    assert.throws(() => createTrustedEndpointPolicy({ credentialOrigins: [origin] }), /INVALID_TRUSTED_ORIGIN/)
  }
  assert.throws(() => createTrustedEndpointPolicy({ credentialOrigins: [] }), /MISSING_TRUSTED_ORIGINS/)
})

test('both Taro request and upload are guarded before calling platform primitives', () => {
  const src = readFileSync(new URL('../src/platform/taro-ports.ts', import.meta.url), 'utf8')
  assert.match(src, /class TaroTransport[\s\S]*?constructor\(private readonly endpoints: TrustedEndpointPolicy\)/)
  assert.match(src, /class TaroUpload[\s\S]*?constructor\(private readonly endpoints: TrustedEndpointPolicy\)/)
  assert.equal((src.match(/return guardedNetworkCall\(this\.endpoints, url, jwt/g) ?? []).length, 2)
  assert.match(src, /return \{ status: response\.statusCode, rawBody: response\.data \}\s*\}, true\)/)
})

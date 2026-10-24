import test from 'node:test'
import assert from 'node:assert/strict'
import { createTrustedEndpointPolicy, guardedNetworkCall } from '../src/core/trusted-endpoint.ts'

const origin = 'https://test-project.supabase.co'
const policy = () => createTrustedEndpointPolicy({
  credentialOrigins: [origin],
  anonymousOrigins: ['https://poi.example.cn'],
})

test('percent-encoded sensitive query names are rejected before any authenticated network call', async () => {
  let calls = 0
  for (const query of [
    '%61ccess_token=secret', 'access%5Ftoken=secret', 'refresh%5ftoken=secret',
    'token%5fhash=secret', 'SESSION%5FKEY=secret', 'login%5Fcode=secret',
    'id%5Ftoken=secret', 'client%5Fsecret=secret', 'authorization=Bearer',
    '%2561ccess_token=secret',
  ]) {
    await assert.rejects(
      guardedNetworkCall(policy(), `${origin}/rest/v1/events?${query}`, 'mock-jwt', async () => { calls++; return 200 }),
      /UNTRUSTED_ENDPOINT/,
      query,
    )
  }
  assert.equal(calls, 0)
})

test('malformed, ambiguous and empty query names fail closed', () => {
  for (const query of [
    '', '=value', '%ZZ=value', '%00=value', '%26access_token=value',
    '%3D=value', 'q=1&&page=2', 'q=1&=2', '%2526access_token=value',
  ]) assert.throws(() => policy().assert(`${origin}/rest/v1/events?${query}`, true), /UNTRUSTED_ENDPOINT/, query)
})

test('ordinary encoded query values and safe key spellings remain usable', async () => {
  const p = policy()
  p.assert(`${origin}/rest/v1/events?select=id%2Cname&limit=10`, true)
  p.assert(`${origin}/rest/v1/events?filter.name=eq.%E7%BD%91%E7%90%83`, true)
  p.assert('https://poi.example.cn/search?q=%E5%A5%A5%E6%A3%AE&page=2', false)
  assert.equal(await guardedNetworkCall(p, `${origin}/rest/v1/events?select=id`, 'mock-jwt', async () => 200), 200)
})

test('existing origin and bearer-token fail-closed behavior is preserved', async () => {
  const p = policy()
  for (const url of [
    'http://test-project.supabase.co/rest/v1/events',
    'https://test-project.supabase.co.evil.cn/rest/v1/events',
    'https://test-project.supabase.co/%2e%2e/auth/v1/token',
    'https://test-project.supabase.co/rest/v1/events#fragment',
  ]) assert.throws(() => p.assert(url, true), /UNTRUSTED_ENDPOINT/)
  await assert.rejects(
    guardedNetworkCall(p, `${origin}/rest/v1/events`, undefined, async () => 200, true),
    /AUTH_REQUIRED/,
  )
  await assert.rejects(
    guardedNetworkCall(p, `${origin}/rest/v1/events`, 'bad\r\nheader', async () => 200),
    /INVALID_JWT/,
  )
})

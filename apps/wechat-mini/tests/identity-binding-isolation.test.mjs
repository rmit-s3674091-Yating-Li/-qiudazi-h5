import test from 'node:test'
import assert from 'node:assert/strict'
import { MockWechatCodeVerifier, MockLegacyProofVerifier, MockIdentityServer } from '../src/core/identity-mock.ts'

const a = { appId: 'mini-app', openId: 'openid-A', unionId: null }
const b = { appId: 'mini-app', openId: 'openid-B', unionId: null }
const legacyA = { authUserId: 'auth-A', profileId: 'profile-A' }
const request = (loginCode, requestId) => ({ loginCode, requestId, clientNonce: 'nonce-123456' })
function setup(now = () => 1000, ttl = 600_000) {
  const wx = new MockWechatCodeVerifier(), proofs = new MockLegacyProofVerifier()
  const server = new MockIdentityServer(wx, proofs, now, ttl)
  wx.register('code-aaaaaa', a)
  wx.register('code-bbbbbb', b)
  assert.equal(server.exchange(request('code-aaaaaa', 'request-aaaa')).status, 'UNBOUND_IDENTITY')
  assert.equal(server.exchange(request('code-bbbbbb', 'request-bbbb')).status, 'UNBOUND_IDENTITY')
  return { server, proofs, wx }
}
function proof(proofs, id, requestId, subject, overrides = {}) {
  proofs.register(id, { legacy: legacyA, requestId, subject, expiresAt: 5000, consentRecorded: true, ...overrides })
}

test('old cross-flow exploit: proof for A cannot bind B, even with confirmation', () => {
  const { server, proofs } = setup()
  proof(proofs, 'proof-for-a', 'request-aaaa', a)
  assert.equal(server.confirmLegacyBinding('request-bbbb', 'proof-for-a', true).status, 'CONFLICT_LOCKED')
  assert.equal(server.inspectBinding(b), null)
  // Wrong-audience attempt consumes proof: it cannot subsequently be replayed against A.
  assert.equal(server.confirmLegacyBinding('request-aaaa', 'proof-for-a', true).status, 'CONFLICT_LOCKED')
  assert.equal(server.inspectBinding(a), null)
})

test('client confirmation alone cannot replace server-recorded consent', () => {
  const { server, proofs } = setup()
  proof(proofs, 'proof-no-consent', 'request-aaaa', a, { consentRecorded: false })
  assert.equal(server.confirmLegacyBinding('request-aaaa', 'proof-no-consent', true).status, 'CONFLICT_LOCKED')
  proof(proofs, 'proof-with-consent', 'request-aaaa', a)
  assert.equal(server.confirmLegacyBinding('request-aaaa', 'proof-with-consent', false).status, 'CONFLICT_LOCKED')
  assert.equal(server.inspectBinding(a), null)
  assert.equal(server.confirmLegacyBinding('request-aaaa', 'proof-with-consent', true).status, 'SESSION_BRIDGE_UNPROVEN')
  assert.deepEqual(server.inspectBinding(a), legacyA)
  assert.equal(server.confirmLegacyBinding('request-aaaa', 'proof-with-consent', true).status, 'CONFLICT_LOCKED')
})

test('expired proof, expired pending challenge and stale request replay fail closed', () => {
  let clock = 1000
  const { server, proofs } = setup(() => clock, 100)
  proof(proofs, 'proof-expired', 'request-aaaa', a, { expiresAt: 1001 })
  clock = 1002
  assert.equal(server.confirmLegacyBinding('request-aaaa', 'proof-expired', true).status, 'CONFLICT_LOCKED')
  proof(proofs, 'proof-late', 'request-aaaa', a)
  clock = 1100
  assert.equal(server.confirmLegacyBinding('request-aaaa', 'proof-late', true).status, 'CONFLICT_LOCKED')
  assert.equal(server.exchange(request('code-aaaaaa', 'request-aaaa')).status, 'CONFLICT_LOCKED')
  assert.equal(server.inspectBinding(a), null)
})

test('proof for same request but different verified WeChat subject is rejected', () => {
  const { server, proofs } = setup()
  proof(proofs, 'proof-wrong-subject', 'request-aaaa', b)
  assert.equal(server.confirmLegacyBinding('request-aaaa', 'proof-wrong-subject', true).status, 'CONFLICT_LOCKED')
  assert.equal(server.inspectBinding(a), null)
})

test('successful binding remains session-unproven and idempotent exchange never yields JWT', () => {
  const { server, proofs } = setup()
  proof(proofs, 'proof-valid', 'request-aaaa', a)
  assert.equal(server.confirmLegacyBinding('request-aaaa', 'proof-valid', true).status, 'SESSION_BRIDGE_UNPROVEN')
  const result = server.exchange(request('code-aaaaaa', 'request-aaaa'))
  assert.deepEqual(result, { status: 'SESSION_BRIDGE_UNPROVEN' })
  assert.equal('access_token' in result, false)
  assert.equal('refresh_token' in result, false)
  assert.equal(server.inspectBinding(b), null)
})

test('mock codes and consumed proof references cannot be re-registered', () => {
  const { server, proofs, wx } = setup()
  assert.throws(() => wx.register('code-aaaaaa', b), /INVALID_MOCK_CODE/)
  proof(proofs, 'proof-once', 'request-aaaa', a)
  assert.equal(server.confirmLegacyBinding('request-aaaa', 'proof-once', true).status, 'SESSION_BRIDGE_UNPROVEN')
  assert.throws(() => proof(proofs, 'proof-once', 'request-bbbb', b), /INVALID_PROOF_FIXTURE/)
})

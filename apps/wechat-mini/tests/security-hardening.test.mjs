import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeMiniPath, decodeMiniPath } from '../src/core/navigation.ts'
import { PendingIntentGate } from '../src/core/pending-intent.ts'

const current = (user, gen) => user === 'auth-user-A' && gen === 3
const actor = { authUserId: 'auth-user-A', generation: 3 }

test('strict parser rejects appended query smuggling, fragments and unknown keys', () => {
  const valid = encodeMiniPath({ kind: 'event_view', eventId: 'event-abc' })
  assert.deepEqual(decodeMiniPath(valid), { kind: 'event_view', eventId: 'event-abc' })
  for (const path of [
    valid + '?ignored=1', valid + '#ignored', valid + '&role=admin',
    '/pages/index/index?kind=event_view&eventId=abc?ignored=1',
    '/pages/index/index?kind=event_view&eventId=abc&eventId=def',
    '/pages/index/index?kind=event_view&eventId=%E0%A4%A',
  ]) assert.equal(decodeMiniPath(path), null, path)
  assert.throws(() => encodeMiniPath({ kind: 'event_invite', inviteKind: 'admin', inviteRef: 'invite-opaque-123456' }), /INVALID_INVITE_KIND/)
  assert.throws(() => encodeMiniPath({ kind: 'admin', role: 'super_admin' }), /INVALID_INTENT_KIND/)
})

test('invitation survives verified login but never auto-accepts', () => {
  const gate = new PendingIntentGate()
  const intent = { kind: 'connection_invite', inviteRef: 'invitation-123456' }
  assert.equal(gate.capture(intent, 'request-123456'), 'READY')
  assert.equal(gate.bindAfterVerifiedLogin('request-123456', actor, current), 'READY')
  assert.deepEqual(gate.consumeNavigation(actor, current), { status: 'CONFIRM_REQUIRED' })
  assert.deepEqual(gate.consumeNavigation(actor, current, true), { status: 'NAVIGATE_ONLY', intent })
  assert.deepEqual(gate.consumeNavigation(actor, current, true), { status: 'NOT_FOUND' })
})

test('actor switch, replay and wrong request are fail-closed', () => {
  const gate = new PendingIntentGate()
  assert.equal(gate.capture({ kind: 'event_view', eventId: 'event-abc' }, 'request-123456', 'auth-user-A'), 'READY')
  assert.equal(gate.capture({ kind: 'player_claim', inviteRef: 'invitation-123456' }, 'request-987654'), 'REPLACEMENT_CONFIRM_REQUIRED')
  assert.equal(gate.bindAfterVerifiedLogin('request-wrong', actor, current), 'STALE_ACTOR')
  assert.deepEqual(gate.consumeNavigation(actor, current), { status: 'NOT_FOUND' })
  assert.equal(gate.capture({ kind: 'event_view', eventId: 'event-abc' }, 'request-123456'), 'READY')
  assert.equal(gate.bindAfterVerifiedLogin('request-123456', actor, current), 'READY')
  assert.deepEqual(gate.consumeNavigation({ authUserId: 'auth-user-B', generation: 4 }, current), { status: 'STALE_ACTOR' })
})

test('expired intent, backwards clock and invalid actor cannot be consumed', () => {
  let now = 1000
  const gate = new PendingIntentGate(() => now, 100)
  assert.equal(gate.capture({ kind: 'event_view', eventId: 'event-abc' }, 'request-123456'), 'READY')
  now = 1100
  assert.equal(gate.bindAfterVerifiedLogin('request-123456', actor, current), 'NOT_FOUND')
  assert.equal(gate.capture({ kind: 'event_view', eventId: 'event-abc' }, 'request-123456'), 'READY')
  now = 1099
  assert.deepEqual(gate.consumeNavigation(actor, current), { status: 'NOT_FOUND' })
  assert.equal(gate.capture({ kind: 'event_view', eventId: 'event-abc' }, 'request-123456'), 'READY')
  assert.equal(gate.bindAfterVerifiedLogin('request-123456', { authUserId: 'nick-G', generation: 3 }, current), 'STALE_ACTOR')
})

test('caller mutation after capture cannot replace an invite with another intent', () => {
  const gate = new PendingIntentGate()
  const intent = { kind: 'event_view', eventId: 'event-original' }
  assert.equal(gate.capture(intent, 'request-123456'), 'READY')
  intent.eventId = 'event-attacker'
  assert.equal(gate.bindAfterVerifiedLogin('request-123456', actor, current), 'READY')
  assert.deepEqual(gate.consumeNavigation(actor, current), { status: 'NAVIGATE_ONLY', intent: { kind: 'event_view', eventId: 'event-original' } })
})

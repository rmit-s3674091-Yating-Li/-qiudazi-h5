import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeMiniPath } from '../src/core/navigation.ts'
import { decodeMiniLaunchIntent } from '../src/core/launch-intent.ts'

const intents = [
  { kind: 'event_view', eventId: 'event-123' },
  { kind: 'private_preview', eventId: 'event-123' },
  { kind: 'connection_invite', inviteRef: 'connection-123' },
  { kind: 'player_claim', inviteRef: 'player-123' },
  { kind: 'event_invite', inviteKind: 'doubles', inviteRef: 'event-invite-123' },
  { kind: 'score_match', eventId: 'event-123', matchId: 'match-456' },
]
const routeParts = (intent) => {
  const [path, query] = encodeMiniPath(intent).split('?')
  return { path, query: Object.fromEntries(new URLSearchParams(query)) }
}

test('all six semantic share routes are recovered from Taro path + parsed query', () => {
  for (const intent of intents) {
    const { path, query } = routeParts(intent)
    assert.deepEqual(decodeMiniLaunchIntent(path, query), intent)
    assert.deepEqual(decodeMiniLaunchIntent(path.slice(1), query), intent)
    assert.deepEqual(decodeMiniLaunchIntent(path, Object.assign(Object.create(null), query)), intent)
  }
})

test('foreign pages, extra keys, missing references and privilege-shaped payloads fail closed', () => {
  const { path, query } = routeParts(intents[0])
  assert.equal(decodeMiniLaunchIntent('/pages/admin/index', query), null)
  assert.equal(decodeMiniLaunchIntent('/pages/index/index?kind=event_view', query), null)
  assert.equal(decodeMiniLaunchIntent(path, { ...query, access_token: 'secret' }), null)
  assert.equal(decodeMiniLaunchIntent(path, { ...query, role: 'admin' }), null)
  assert.equal(decodeMiniLaunchIntent(path, { kind: 'event_invite', inviteKind: 'doubles' }), null)
  assert.equal(decodeMiniLaunchIntent(path, { kind: 'score_match', eventId: 'event-123' }), null)
  assert.equal(decodeMiniLaunchIntent(path, { kind: 'event_view', eventId: 'a/b' }), null)
})

test('already-decoded params are not double-decoded into another identifier', () => {
  assert.equal(decodeMiniLaunchIntent('/pages/index/index', { kind: 'event_view', eventId: '%2Fadmin' }), null)
  assert.equal(decodeMiniLaunchIntent('/pages/index/index', { kind: 'event_view', eventId: 'event%252Fadmin' }), null)
  assert.equal(decodeMiniLaunchIntent('/pages/index/index', { kind: 'event_view', eventId: 'event-123#fragment' }), null)
})

test('untrusted prototype, arrays, non-string params and accessor properties are rejected', () => {
  const path = '/pages/index/index'
  assert.equal(decodeMiniLaunchIntent(path, ['event_view']), null)
  assert.equal(decodeMiniLaunchIntent(path, { kind: ['event_view'], eventId: 'event-123' }), null)
  assert.equal(decodeMiniLaunchIntent(path, Object.assign(Object.create({ role: 'admin' }), { kind: 'event_view', eventId: 'event-123' })), null)
  let getterCalled = false
  const input = { kind: 'event_view' }
  Object.defineProperty(input, 'eventId', { enumerable: true, get() { getterCalled = true; return 'event-123' } })
  assert.equal(decodeMiniLaunchIntent(path, input), null)
  assert.equal(getterCalled, false)
})

test('oversized launch parameters and QR scene are not silently accepted', () => {
  const path = '/pages/index/index'
  assert.equal(decodeMiniLaunchIntent(path, { kind: 'event_view', eventId: 'a'.repeat(600) }), null)
  assert.equal(decodeMiniLaunchIntent(path, { kind: 'event_view', eventId: 'event-123', scene: 'abc' }), null)
  assert.equal(decodeMiniLaunchIntent(path, null), null)
})

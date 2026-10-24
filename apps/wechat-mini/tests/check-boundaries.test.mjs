import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { checkMiniBoundaries } from '../scripts/check-boundaries.mjs'

function fixture(files, check) {
  const root = mkdtempSync(join(tmpdir(), 'qd-mini-boundary-'))
  try {
    for (const [path, content] of Object.entries(files)) {
      const file = join(root, path)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, content)
    }
    check(root)
  } finally { rmSync(root, { recursive: true, force: true }) }
}

const protective = `const forbiddenQueryKeys = new Set([\n  'access_token', 'refresh_token', 'session_key', 'client_secret',\n])\nexport const isForbidden = (name) => forbiddenQueryKeys.has(name)\n`

test('defensive session_key URL denylist literal is not misclassified as secret use', () => {
  fixture({ 'core/trusted-endpoint.ts': protective }, root => {
    assert.equal(checkMiniBoundaries(root), 1)
  })
})

test('same literal outside the narrowly named denylist is still blocked', () => {
  fixture({ 'core/trusted-endpoint.ts': protective + "const leaked = 'session_key'\n" }, root => {
    assert.throws(() => checkMiniBoundaries(root), /Mini boundary violation: core\/trusted-endpoint\.ts/)
  })
})

test('other files cannot claim the defensive literal exemption', () => {
  fixture({ 'platform/network.ts': "const key = 'session_key'\n" }, root => {
    assert.throws(() => checkMiniBoundaries(root), /Mini boundary violation: platform\/network\.ts/)
  })
})

test('a second session_key entry in denylist is not silently whitelisted', () => {
  fixture({ 'core/trusted-endpoint.ts': protective.replace("'client_secret'", "'session_key'") }, root => {
    assert.throws(() => checkMiniBoundaries(root), /Mini boundary violation/)
  })
})

test('DOM, service_role, AppSecret and H5 Supabase repository imports remain blocked', () => {
  for (const source of [
    'window.location.href', 'document.cookie', 'localStorage.getItem("x")',
    "const secret = 'service_role'", 'const AppSecret = 1',
    "import x from '../../../src/repositories/supabase'",
  ]) fixture({ 'platform/unsafe.ts': source }, root => {
    assert.throws(() => checkMiniBoundaries(root), /Mini boundary violation/)
  })
})

test('generated shared-domain is excluded without exempting other source directories', () => {
  fixture({
    'shared-domain/ScoringEngine.ts': 'window.bad = 1',
    'core/safe.ts': 'export const score = 1',
  }, root => assert.equal(checkMiniBoundaries(root), 1))
})

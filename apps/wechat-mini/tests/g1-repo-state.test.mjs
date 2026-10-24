import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { captureG1RepoState, isG1RepoStateUnchanged } from '../scripts/g1-repo-state.mjs'
import { runG1Gate } from '../scripts/g1-gate.mjs'

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}
function withRepo(run) {
  const root = mkdtempSync(join(tmpdir(), 'qd-mini-g1-state-'))
  try {
    mkdirSync(join(root, 'apps/wechat-mini'), { recursive: true })
    mkdirSync(join(root, 'src/domain'), { recursive: true })
    writeFileSync(join(root, 'src/domain/ScoringEngine.ts'), 'export const points = 1\n')
    writeFileSync(join(root, 'apps/wechat-mini/README.md'), 'mock\n')
    git(root, 'init', '-q')
    git(root, 'add', '.')
    git(root, '-c', 'user.name=PoC', '-c', 'user.email=poc@example.invalid', 'commit', '-qm', 'fixture')
    run(root)
  } finally { rmSync(root, { recursive: true, force: true }) }
}

test('same HEAD and outside-mini status remain stable', () => withRepo(root => {
  const before = captureG1RepoState(root)
  const after = captureG1RepoState(root)
  assert.match(before.head, /^[0-9a-f]{40}$/)
  assert.equal(isG1RepoStateUnchanged(before, after), true)
}))

test('mini-only tracked modifications do not falsify H5 isolation', () => withRepo(root => {
  const before = captureG1RepoState(root)
  writeFileSync(join(root, 'apps/wechat-mini/README.md'), 'changed mock\n')
  const after = captureG1RepoState(root)
  assert.equal(isG1RepoStateUnchanged(before, after), true)
}))

test('H5 tracked modifications invalidate isolation evidence', () => withRepo(root => {
  const before = captureG1RepoState(root)
  writeFileSync(join(root, 'src/domain/ScoringEngine.ts'), 'export const points = 2\n')
  const after = captureG1RepoState(root)
  assert.equal(isG1RepoStateUnchanged(before, after), false)
}))

test('dirty H5 baseline cannot be certified even if it remains unchanged', () => withRepo(root => {
  writeFileSync(join(root, 'src/domain/ScoringEngine.ts'), 'export const points = 2\n')
  const before = captureG1RepoState(root)
  const after = captureG1RepoState(root)
  assert.equal(isG1RepoStateUnchanged(before, after), false)
}))

test('HEAD movement invalidates exact-head evidence even if tree status stays clean', () => withRepo(root => {
  const before = captureG1RepoState(root)
  writeFileSync(join(root, 'src/domain/ScoringEngine.ts'), 'export const points = 3\n')
  git(root, 'add', '.')
  git(root, '-c', 'user.name=PoC', '-c', 'user.email=poc@example.invalid', 'commit', '-qm', 'new head')
  const after = captureG1RepoState(root)
  assert.equal(isG1RepoStateUnchanged(before, after), false)
}))

test('missing Git metadata fails closed rather than inventing HEAD', () => {
  const root = mkdtempSync(join(tmpdir(), 'qd-mini-no-git-'))
  try { assert.throws(() => captureG1RepoState(root), /G1_GIT_STATE_UNAVAILABLE/) }
  finally { rmSync(root, { recursive: true, force: true }) }
})

function installFakeG1(root, finalScript) {
  const mini = join(root, 'apps/wechat-mini')
  const scripts = Object.fromEntries(
    ['test:offline', 'lint:boundary', 'typecheck', 'format:check', 'build:weapp']
      .map(name => [name, name === 'build:weapp' ? finalScript : 'node -e "process.exit(0)"']),
  )
  const manifest = { name: 'mini-g1-fixture', version: '0.0.1', private: true, scripts,
    dependencies: {}, devDependencies: {} }
  writeFileSync(join(mini, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(mini, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3,
    packages: { '': { name: manifest.name, version: manifest.version, dependencies: {}, devDependencies: {} } } }))
  mkdirSync(join(mini, 'node_modules/.bin'), { recursive: true })
  for (const name of ['taro', 'tsc', 'prettier']) writeFileSync(join(mini, 'node_modules/.bin', name), '')
  return mini
}

test('full G1 wrapper records an unchanged exact HEAD after five mock local commands', () => withRepo(root => {
  const mini = installFakeG1(root, 'node -e "process.exit(0)"')
  assert.equal(runG1Gate(mini, false), 0)
}))

test('full G1 wrapper refuses to certify a build that mutates H5 tracked source', () => withRepo(root => {
  const mini = installFakeG1(root,
    'node -e "require(\'fs\').writeFileSync(\'../../src/domain/ScoringEngine.ts\', \'tampered\')"')
  assert.equal(runG1Gate(mini, false), 2)
}))

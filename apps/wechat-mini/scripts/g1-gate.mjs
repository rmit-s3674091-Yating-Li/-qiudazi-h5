import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { captureG1RepoState, isG1RepoStateUnchanged } from './g1-repo-state.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const commands = ['test:offline', 'lint:boundary', 'typecheck', 'format:check', 'build:weapp']
const sameDeps = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort(([x], [y]) => x.localeCompare(y))) ===
  JSON.stringify(Object.entries(b ?? {}).sort(([x], [y]) => x.localeCompare(y)))

/** Read-only prerequisites. A PASS here is not a successful compile. */
export function inspectG1Readiness(projectDir) {
  const failures = []
  const readJson = (name) => {
    try { return JSON.parse(readFileSync(join(projectDir, name), 'utf8')) }
    catch { failures.push(`MISSING_OR_INVALID_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`); return null }
  }
  const manifest = readJson('package.json')
  const lock = readJson('package-lock.json')
  if (manifest && lock) {
    const pinned = lock.packages?.['']
    if (!Number.isInteger(lock.lockfileVersion) || lock.lockfileVersion < 3 ||
        !pinned || pinned.name !== manifest.name || pinned.version !== manifest.version ||
        !sameDeps(pinned.dependencies, manifest.dependencies) ||
        !sameDeps(pinned.devDependencies, manifest.devDependencies)) {
      failures.push('LOCKFILE_MANIFEST_MISMATCH')
    }
  }
  for (const binary of ['taro', 'tsc', 'prettier']) {
    if (!existsSync(join(projectDir, 'node_modules', '.bin', binary))) {
      failures.push(`DEPENDENCY_NOT_INSTALLED_${binary.toUpperCase()}`)
    }
  }
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 16)) failures.push('NODE_VERSION_TOO_OLD')
  return { ready: failures.length === 0, failures }
}

export function runG1Gate(projectDir = root, preflightOnly = false) {
  const check = inspectG1Readiness(projectDir)
  if (!check.ready) {
    for (const reason of check.failures) console.error(`G1_BLOCKED: ${reason}`)
    console.error('G1_UNVERIFIED: no compilation or real authentication claim')
    return 2
  }
  if (preflightOnly) {
    console.log('G1_PREFLIGHT_READY: lockfile and local executables present; build not run')
    return 0
  }
  const repoRoot = resolve(projectDir, '../..')
  let before
  try { before = captureG1RepoState(repoRoot) }
  catch { console.error('G1_BLOCKED: EXACT_HEAD_OR_GIT_STATE_UNAVAILABLE'); return 2 }
  if (before.outsideMiniStatus !== '') { console.error('G1_BLOCKED: H5_TRACKED_WORKTREE_DIRTY'); return 2 }
  for (const name of commands) {
    console.log(`G1_RUNNING: npm run ${name}`)
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', name], { cwd: projectDir, stdio: 'inherit', shell: false })
    if (result.error || result.status !== 0) {
      console.error(`G1_FAILED: ${name}; status=${result.status ?? 'spawn_error'}`)
      return result.status && result.status > 0 ? result.status : 1
    }
  }
  let after
  try { after = captureG1RepoState(repoRoot) }
  catch { console.error('G1_FAILED: EXACT_HEAD_OR_GIT_STATE_UNAVAILABLE_AFTER_BUILD'); return 2 }
  if (!isG1RepoStateUnchanged(before, after)) { console.error('G1_FAILED: HEAD_CHANGED_OR_H5_TRACKED_TREE_DIRTY'); return 2 }
  console.log(`G1_EVIDENCE_HEAD: ${before.head}`)
  console.log('G1_SOURCE_GATE_PASSED: offline tests, boundary, types, format and Taro build')
  console.log('SESSION_BRIDGE_UNPROVEN; WECHAT_LOGIN_LIVE=false; WECHAT_RELEASE_APPROVED=false')
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (args.some(arg => arg !== '--preflight-only')) {
    console.error('Usage: node scripts/g1-gate.mjs [--preflight-only]')
    process.exitCode = 2
  } else {
    process.exitCode = runG1Gate(root, args.includes('--preflight-only'))
  }
}

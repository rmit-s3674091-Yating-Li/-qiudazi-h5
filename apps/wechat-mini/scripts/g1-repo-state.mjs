import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

function git(repoRoot, args) {
  const result = spawnSync('git', ['-C', resolve(repoRoot), ...args], {
    encoding: 'utf8', shell: false, maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) throw new Error('G1_GIT_STATE_UNAVAILABLE')
  return result.stdout
}

/** Read-only metadata: never open tracked files, inspect secrets or contact remotes. */
export function captureG1RepoState(repoRoot) {
  const head = git(repoRoot, ['rev-parse', '--verify', 'HEAD']).trim()
  if (!/^[0-9a-f]{40,64}$/.test(head)) throw new Error('G1_INVALID_HEAD')
  // Only tracked changes outside the independent mini app count as H5 impact.
  const outsideMiniStatus = git(repoRoot, [
    'status', '--porcelain=v1', '-z', '--untracked-files=no',
    '--', '.', ':(exclude)apps/wechat-mini',
  ])
  return Object.freeze({ head, outsideMiniStatus })
}

export function isG1RepoStateUnchanged(before, after) {
  return !!before && !!after && before.head === after.head &&
    before.outsideMiniStatus === '' && after.outsideMiniStatus === ''
}

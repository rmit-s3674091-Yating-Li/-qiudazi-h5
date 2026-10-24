import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const out = resolve(root, 'apps/wechat-mini/src/shared-domain')
const names = ['types.ts', 'ScoringEngine.ts', 'QuickGroupConfig.ts', 'ParticipantPointReceipt.ts', 'AuthAccountGeneration.ts']
mkdirSync(out, { recursive: true })
for (const name of names) {
  const source = resolve(root, 'src/domain', name)
  if (!existsSync(source)) throw new Error(`Missing H5 canonical domain: ${name}`)
  const destination = resolve(out, name)
  copyFileSync(source, destination)
  const digest = data => createHash('sha256').update(data).digest('hex')
  if (digest(readFileSync(source)) !== digest(readFileSync(destination))) throw new Error(`Domain mismatch: ${name}`)
}
console.log(`Synced ${names.length} canonical H5 domain files (generated, ignored by git).`)

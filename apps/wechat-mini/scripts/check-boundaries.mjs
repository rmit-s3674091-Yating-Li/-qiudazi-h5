import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(fileURLToPath(new URL('../src/', import.meta.url)))
const forbidden = [/(?:\bwindow\.|\bdocument\.|\blocalStorage\b)/, /(?:service_role|AppSecret|session_key)/, /src\/repositories\/supabase/]
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'shared-domain') continue
    const file = join(dir, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (/\.tsx?$/.test(file)) {
      const content = readFileSync(file, 'utf8')
      if (forbidden.some(rule => rule.test(content))) throw new Error(`Mini boundary violation: ${file}`)
    }
  }
}
walk(root)
console.log('Mini platform boundary static check passed (not a security audit).')

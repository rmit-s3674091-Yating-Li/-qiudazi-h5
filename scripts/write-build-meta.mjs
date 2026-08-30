import fs from 'node:fs';
import path from 'node:path';

const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local';
const ref = process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || 'local';
const out = path.join(process.cwd(), 'public', 'build-meta.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ sha, ref, generated_at: new Date().toISOString() }, null, 2) + '\n');
console.log(`build-meta: ${sha} (${ref})`);

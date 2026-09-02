import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const dir = path.join(root, 'supabase', 'migrations');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'supabase', 'LIVE_MIGRATION_MANIFEST.json'), 'utf8'));
const appendPath = path.join(root, 'supabase', 'LIVE_MIGRATION_MANIFEST_APPEND.json');
const appended = fs.existsSync(appendPath) ? JSON.parse(fs.readFileSync(appendPath, 'utf8')) : {sha256_by_version:{}};
const expected = new Map(Object.entries({...manifest.sha256_by_version,...appended.sha256_by_version}));
const snapshots = new Set(manifest.repo_snapshot_versions || []);
const exactFrom = manifest.live_exact_from;
const files = fs.readdirSync(dir).filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort();
const byVersion = new Map();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

for (const file of files) {
  const version = file.slice(0, 14);
  if (byVersion.has(version)) throw new Error(`duplicate repo migration version ${version}: ${byVersion.get(version)}, ${file}`);
  byVersion.set(version, file);
}

const missing = [...expected.keys()].filter((v) => !byVersion.has(v));
const extra = [...byVersion.keys()].filter((v) => v >= exactFrom && !expected.has(v) && !snapshots.has(v));
const drift = [];
for (const [version, wanted] of expected) {
  const file = byVersion.get(version);
  if (!file) continue;
  const normalized = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
  const actual = sha256(normalized);
  const actualWithTerminalNewline = sha256(normalized + '\n');
  if (wanted !== actual && wanted !== actualWithTerminalNewline) drift.push({ version, file, wanted, actual });
}

if (missing.length || extra.length || drift.length) {
  console.error('Migration parity FAILED against live migration manifests');
  if (missing.length) console.error('Missing live versions:', missing.join(', '));
  if (extra.length) console.error('Repo-only versions:', extra.join(', '));
  for (const d of drift) console.error(`SQL drift ${d.version} ${d.file}: expected ${d.wanted}, got ${d.actual}`);
  process.exit(1);
}
console.log(`Migration parity PASS: ${expected.size} live exact migrations + ${snapshots.size} declared replay snapshots.`);

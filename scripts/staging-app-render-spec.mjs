/**
 * Staging App Platform spec renderer.
 *
 * Reads the committed .do/app.yaml (env declarations only, no secret values)
 * and produces .do/app.rendered.yaml with secret values injected from
 * C:\Users\rohit\.dealerlink\staging-secrets.txt. The rendered file is
 * gitignored and is what gets handed to `doctl apps update <id> --spec`.
 *
 * Design:
 *   - We do not parse YAML; we operate on text. Each SECRET env entry in
 *     .do/app.yaml is a three-line block:
 *         - key: FOO
 *           scope: RUN_TIME
 *           type: SECRET
 *     For each KEY in staging-secrets.txt that matches, we insert a
 *     `value: <encoded>` line right after the `key:` line. Inserting per
 *     occurrence covers components that share env keys (web + workers).
 *   - Values are JSON-string-encoded so multiline / special-char values
 *     never break the YAML.
 *   - Keys present in the secrets file but absent in the spec are reported
 *     so we notice drift between sources of truth.
 *
 * Usage (pwsh):
 *   node scripts/staging-app-render-spec.mjs
 *     [--secrets C:\Users\rohit\.dealerlink\staging-secrets.txt]
 *     [--in .do/app.yaml]
 *     [--out .do/app.rendered.yaml]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx > -1 ? process.argv[idx + 1] : fallback;
}

const secretsPath = arg(
  'secrets',
  path.join(os.homedir(), '.dealerlink', 'staging-secrets.txt'),
);
const inPath = arg('in', '.do/app.yaml');
const outPath = arg('out', '.do/app.rendered.yaml');

if (!fs.existsSync(secretsPath)) {
  console.error(`✗ secrets file not found: ${secretsPath}`);
  process.exit(2);
}
if (!fs.existsSync(inPath)) {
  console.error(`✗ spec file not found: ${inPath}`);
  process.exit(2);
}

const secrets = new Map();
for (const raw of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq < 1) continue;
  const key = line.slice(0, eq).trim();
  const value = line.slice(eq + 1);
  secrets.set(key, value);
}
console.log(`→ loaded ${secrets.size} secrets from ${secretsPath}`);

const spec = fs.readFileSync(inPath, 'utf8');
const lines = spec.split('\n');

// Walk the spec line-by-line. When we see `- key: FOO`, peek ahead to confirm
// it's followed by `type: SECRET` (within the next ~5 lines, before the next
// list item or top-level key). If so, and we have a value for FOO, insert
// `value: <json>` right after the key line.
const out = [];
const injected = new Map();
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  out.push(line);
  const m = /^(\s+)- key:\s*([A-Z0-9_]+)\s*$/.exec(line);
  if (!m) continue;
  const indent = m[1] + '  '; // sibling keys sit indented two more spaces than `- key:`
  const keyName = m[2];

  // Peek ahead for `type: SECRET` until we hit the next list item (`-`) or
  // a less-indented line.
  let isSecret = false;
  for (let j = i + 1; j < lines.length; j++) {
    const nxt = lines[j];
    if (/^\s*-\s/.test(nxt) || /^[^\s]/.test(nxt)) break;
    if (new RegExp(`^${indent}type:\\s*SECRET\\s*$`).test(nxt)) {
      isSecret = true;
      break;
    }
  }
  if (!isSecret) continue;
  if (!secrets.has(keyName)) {
    console.log(`  · ${keyName}: SECRET in spec but no value in secrets file — leaving blank`);
    continue;
  }
  const value = secrets.get(keyName);
  out.push(`${indent}value: ${JSON.stringify(value)}`);
  injected.set(keyName, (injected.get(keyName) ?? 0) + 1);
}

fs.writeFileSync(outPath, out.join('\n'), 'utf8');

console.log(`→ wrote ${outPath}`);
for (const [k, n] of injected) console.log(`  · injected ${k} into ${n} component(s)`);
const unused = [...secrets.keys()].filter(
  (k) => !injected.has(k) && !['NODE_ENV', 'TZ', 'AXIOM_DATASET', 'RESEND_FROM_EMAIL', 'SENTRY_ENVIRONMENT', 'NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'NEXT_PUBLIC_APP_URL'].includes(k),
);
if (unused.length) {
  console.log('→ keys present in secrets file but not injected (declared as plain values or unused):');
  for (const k of unused) console.log(`  · ${k}`);
}
console.log('✓ render complete');

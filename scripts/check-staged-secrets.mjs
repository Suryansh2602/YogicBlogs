#!/usr/bin/env node
// Pre-commit credential check. Run from the repo root before every commit/push:
//   node scripts/check-staged-secrets.mjs
// Fails (exit 1) if staged changes contain env files, local secret files, private keys,
// or any real secret value from the local .env files. Prints names only, never values.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR').split('\n').filter(Boolean);
const problems = [];

// 1. Files that must never be committed.
const FORBIDDEN_FILE = [/(^|\/)\.env(\.(?!example$)[^/]+)?$/, /(^|\/)\.local\//, /\.(pem|key|p12|pfx)$/i, /id_(rsa|ed25519)$/];
for (const file of staged) {
  if (FORBIDDEN_FILE.some((re) => re.test(file))) problems.push(`forbidden file staged: ${file}`);
}

// 2. Real secret values from local env files (never printed).
const ENV_FILES = ['backend/.env', 'backend/.env.test', 'frontend/.env', 'frontend/.env.local'];
const SECRET_KEY = /PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL/i;
const secrets = [];
for (const file of ENV_FILES.filter(existsSync)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.+)$/.exec(line.trim());
    if (match && SECRET_KEY.test(match[1]) && match[2].length >= 8) {
      secrets.push({ name: `${file}:${match[1]}`, value: match[2] });
    }
  }
}

// 3. Generic patterns that look like credentials.
const PATTERNS = [
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'connection string with password', re: /\b(mysql|redis|rediss|postgres):\/\/[^:\s/]+:[^@\s]{4,}@/i },
];

for (const file of staged) {
  let content;
  try {
    content = git('show', `:${file}`);
  } catch {
    continue; // deleted or binary
  }
  for (const { name, value } of secrets) {
    if (content.includes(value)) problems.push(`${file} contains the value of ${name}`);
  }
  for (const { name, re } of PATTERNS) {
    if (re.test(content)) problems.push(`${file} matches pattern: ${name}`);
  }
}

if (problems.length > 0) {
  console.error('✖ Credential check FAILED — do not commit:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`✔ Credential check passed: ${staged.length} staged file(s), ${secrets.length} local secret value(s) checked, none found.`);

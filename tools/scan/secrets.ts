// The build artefact scan of docs/SECURITY.md §8: after `pnpm build`, nothing browsers download
// (apps/web/dist) may hold the value of a server-side variable or a key-shaped string. The
// variable names come from .env.example (every name without VITE_); findings name the
// variable or the pattern and the file, never the value.
//   node tools/scan/secrets.ts [directory]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KEY_PATTERNS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'a Supabase secret key', pattern: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: 'a CoinGecko API key', pattern: /\bCG-[A-Za-z0-9]{20,}\b/ },
  { name: 'a Resend API key', pattern: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/ },
  { name: 'a private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'a GitHub token', pattern: /\bgh[opsu]_[A-Za-z0-9]{36,}\b/ },
  { name: 'an AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
];

/** Values shorter than this are too common to mean anything when they appear in a bundle. */
const MIN_VALUE_LENGTH = 8;

/** The server-side names in .env.example, the commented ones of later milestones included. */
export function serverVariableNames(envExample: string): string[] {
  return envExample
    .split(/\r?\n/)
    .map((line) => /^#?\s*([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined && !name.startsWith('VITE_'));
}

export type Finding = { readonly file: string; readonly what: string };

export function scanText(
  file: string,
  text: string,
  secrets: readonly { readonly name: string; readonly value: string }[],
): Finding[] {
  const findings: Finding[] = [];
  for (const { name, value } of secrets) {
    if (value.length >= MIN_VALUE_LENGTH && text.includes(value)) findings.push({ file, what: `the value of ${name}` });
  }
  for (const { name, pattern } of KEY_PATTERNS) {
    if (pattern.test(text)) findings.push({ file, what: name });
  }
  return findings;
}

function filesIn(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

/** Every finding in the files under `directory`, with the secrets taken from `env` by name. */
export function scanDirectory(
  directory: string,
  names: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): { files: number; findings: Finding[] } {
  const secrets = names.flatMap((name) => {
    const value = env[name];
    return value === undefined ? [] : [{ name, value }];
  });
  const files = filesIn(directory);
  const findings = files.flatMap((file) => scanText(relative(directory, file), readFileSync(file, 'utf8'), secrets));
  return { files: files.length, findings };
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const directory = process.argv[2] ?? 'apps/web/dist';
  if (!existsSync(directory)) {
    console.error(`${directory} does not exist; build the web host first.`);
    process.exit(2);
  }
  const names = serverVariableNames(readFileSync('.env.example', 'utf8'));
  const { files, findings } = scanDirectory(directory, names, process.env);
  for (const { file, what } of findings) console.error(`${directory}/${file}: ${what}`);
  if (findings.length > 0) process.exit(1);
  console.log(`${files} files in ${directory}, no server-side secret and no key-shaped string.`);
}

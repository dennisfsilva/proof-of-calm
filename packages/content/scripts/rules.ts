// `pnpm --filter @proofofcalm/content rules`: writes rules/<code>.json, the core's `CountryRules` of each profile
// in jurisdictions/ as `countryRules` maps it. The shell boots on that small generated file (the measurement:
// ADR-0049); the profile's card text and sources load only where a card, a source link or the picker shows
// them. A rules file with no profile is removed. The files are committed and never edited by hand:
// src/loaders/rules.test.ts fails while one is stale or missing. The profiles are read from disk, as
// scripts/validate.ts reads them.
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countryRules } from '../src/loaders/countries.ts';
import { CountryProfileSchema } from '../src/schema/jurisdiction.ts';

const INDENT = '  ';
const LINE = 100;

/** JSON indented by two spaces, a string array on one line while it fits, a newline at the end. */
export function renderRules(rules: unknown): string {
  return `${render(rules, '')}\n`;
}

function render(value: unknown, indent: string): string {
  const inner = indent + INDENT;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const line = `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
    if (value.every((item) => typeof item === 'string') && inner.length + line.length <= LINE) return line;
    return `[\n${value.map((item) => inner + render(item, inner)).join(',\n')}\n${indent}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (entries.length === 0) return '{}';
    const lines = entries.map(([key, item]) => `${inner}${JSON.stringify(key)}: ${render(item, inner)}`);
    return `{\n${lines.join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

/**
 * Writes each profile's rules file into `rules` and removes any other `.json` there; the names of both. A file
 * that is not a country profile throws, so a code that is not two capitals never names a file outside `rules`.
 */
export function writeRules({ profiles, rules }: { profiles: string; rules: string }): {
  written: string[];
  removed: string[];
} {
  mkdirSync(rules, { recursive: true });
  const written: string[] = [];
  for (const name of readdirSync(profiles)
    .filter((entry) => entry.endsWith('.json'))
    .sort()) {
    const parsed = CountryProfileSchema.safeParse(JSON.parse(readFileSync(join(profiles, name), 'utf8')));
    if (!parsed.success) throw new Error(`${name} is not a country profile`, { cause: parsed.error });
    const file = `${parsed.data.code.toLowerCase()}.json`;
    const target = resolve(rules, file);
    if (!target.startsWith(resolve(rules) + sep)) throw new Error(`${file} would land outside ${rules}`);
    writeFileSync(target, renderRules(countryRules(parsed.data)));
    written.push(file);
  }
  const removed = readdirSync(rules)
    .filter((name) => name.endsWith('.json') && !written.includes(name))
    .sort();
  for (const name of removed) unlinkSync(join(rules, name));
  return { written, removed };
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { written, removed } = writeRules({ profiles: join(root, 'jurisdictions'), rules: join(root, 'rules') });
  const gone = removed.length === 0 ? '' : `, ${removed.length} removed (${removed.join(', ')})`;
  console.log(`${written.length} rules files written (${written.join(', ')})${gone}`);
}

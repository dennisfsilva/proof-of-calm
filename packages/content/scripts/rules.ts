// `pnpm --filter @proofofcalm/content rules`: writes rules/<code>.json, the core's `CountryRules` of each profile
// in jurisdictions/ as `countryRules` maps it, and rules/locales.json, every profile's locales by code
// (src/loaders/locales.ts). The shell boots on a country's rules/<code>.json (the measurement:
// ADR-0049); the profile's card text and sources load only where a card, a source link or the picker shows
// them. Each content language with a folder under i18n/ gets rules/<language>/ over its translations (ADR-0057).
// A rules file with no profile is removed. The files are committed and never edited by hand:
// src/loaders/rules.test.ts fails while one is stale or missing. The profiles are read from disk, as
// scripts/validate.ts reads them.
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyOverlay, CONTENT_LANGUAGES } from '../src/i18n/overlay.ts';
import { countryRules } from '../src/loaders/countries.ts';
import { type CountryProfile, CountryProfileSchema } from '../src/schema/jurisdiction.ts';

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

/** The file of every profile's locales, keyed by code: read at once where the rules file did not arrive. */
export const LOCALES_FILE = 'locales.json';

/** Each profile's `locales`, `numberFormatLocale` and `dateFormatLocale` by code, rendered as the rules files are. */
export function renderLocales(profiles: readonly CountryProfile[]): string {
  const byCode = [...profiles].sort((a, b) => (a.code < b.code ? -1 : 1));
  return renderRules(
    Object.fromEntries(
      byCode.map(({ code, locales, numberFormatLocale, dateFormatLocale }) => [
        code,
        { locales, numberFormatLocale, dateFormatLocale },
      ]),
    ),
  );
}

/** The profile under its translation at `overlay`, where that file exists (ADR-0057). */
function translated(profile: CountryProfile, overlay: string | undefined): CountryProfile {
  if (overlay === undefined || !existsSync(overlay)) return profile;
  return applyOverlay(profile, JSON.parse(readFileSync(overlay, 'utf8')), 'jurisdiction');
}

/**
 * Writes each profile's rules file into `rules`, under its translation in `overlays` where one exists, and, for
 * English (no `overlays`), the locales file, which no translation changes; removes any other `.json` there; the
 * names of both. A file that is not a country profile throws, so a code that is not two capitals never names a
 * file outside `rules`.
 */
export function writeRules({ profiles, rules, overlays }: { profiles: string; rules: string; overlays?: string }): {
  written: string[];
  removed: string[];
} {
  mkdirSync(rules, { recursive: true });
  const written: string[] = [];
  const read: CountryProfile[] = [];
  for (const name of readdirSync(profiles)
    .filter((entry) => entry.endsWith('.json'))
    .sort()) {
    const parsed = CountryProfileSchema.safeParse(JSON.parse(readFileSync(join(profiles, name), 'utf8')));
    if (!parsed.success) throw new Error(`${name} is not a country profile`, { cause: parsed.error });
    const file = `${parsed.data.code.toLowerCase()}.json`;
    const target = resolve(rules, file);
    if (!target.startsWith(resolve(rules) + sep)) throw new Error(`${file} would land outside ${rules}`);
    writeFileSync(target, renderRules(countryRules(translated(parsed.data, overlays && join(overlays, name)))));
    written.push(file);
    read.push(parsed.data);
  }
  if (overlays === undefined) {
    writeFileSync(join(rules, LOCALES_FILE), renderLocales(read));
    written.push(LOCALES_FILE);
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
  const i18n = join(root, 'i18n');
  // English, then each content language with a folder under i18n/ (ADR-0057).
  const languages = existsSync(i18n)
    ? readdirSync(i18n).filter((name) => name !== 'en' && (CONTENT_LANGUAGES as readonly string[]).includes(name))
    : [];
  for (const language of ['', ...languages.sort()]) {
    const { written, removed } = writeRules({
      profiles: join(root, 'jurisdictions'),
      rules: join(root, 'rules', language),
      ...(language === '' ? {} : { overlays: join(i18n, language, 'jurisdictions') }),
    });
    const gone = removed.length === 0 ? '' : `, ${removed.length} removed (${removed.join(', ')})`;
    console.log(`${language || 'en'}: ${written.length} rules files written (${written.join(', ')})${gone}`);
  }
}

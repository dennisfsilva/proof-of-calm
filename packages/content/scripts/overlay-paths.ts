// The translation files for validate.ts (ADR-0057): every .json file at any depth under packages/content/i18n/, so
// that a folder that is not a content language or a kind folder misspelled is reported by validateContent, not skipped.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The absolute paths of the .json files under `<root>/packages/content/i18n/`, sorted. */
export function overlayPaths(root: string): string[] {
  const i18n = join(root, 'packages/content/i18n');
  if (!existsSync(i18n)) return [];
  return readdirSync(i18n, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join(i18n, name));
}

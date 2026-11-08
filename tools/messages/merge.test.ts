import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mergeMessages, run, serialise } from './merge.ts';

/** Folder name → locale → that folder's messages. */
type Folders = Record<string, Record<string, Record<string, unknown>>>;

function fixture(features: Folders, lib: Folders = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'poc-messages-'));
  mkdirSync(join(root, 'messages'));
  for (const [kind, folders] of [
    ['features', features],
    ['lib', lib],
  ] as const) {
    for (const [folder, locales] of Object.entries(folders)) {
      const dir = join(root, kind, folder, 'messages');
      mkdirSync(dir, { recursive: true });
      for (const [locale, tree] of Object.entries(locales))
        writeFileSync(join(dir, `${locale}.json`), JSON.stringify(tree));
    }
  }
  mkdirSync(join(root, 'features', 'no-messages'), { recursive: true });
  return root;
}

const read = (root: string, path: string): unknown => JSON.parse(readFileSync(join(root, 'messages', path), 'utf8'));
const exists = (root: string, path: string) => existsSync(join(root, 'messages', path));

describe('mergeMessages', () => {
  it('namespaces each feature under its name, sorted', () => {
    const merged = mergeMessages({ today: { title: 'Today' }, log: { title: 'Log' } });
    expect(Object.keys(merged)).toEqual(['log', 'today']);
    expect(merged).toEqual({ log: { title: 'Log' }, today: { title: 'Today' } });
  });

  it('serialises with two spaces and a final newline', () => {
    expect(serialise({ a: 'b' })).toBe('{\n  "a": "b"\n}\n');
  });
});

describe('run', () => {
  it('writes the merged file and one file per namespace for each locale, then reports nothing in check mode', () => {
    const root = fixture({ today: { en: { title: 'Today' }, de: { title: 'Heute' } }, log: { en: { title: 'Log' } } });
    expect(run(root, true)).toHaveLength(5);
    expect(run(root, false)).toEqual([]);
    expect(read(root, 'en.json')).toEqual({ log: { title: 'Log' }, today: { title: 'Today' } });
    expect(read(root, 'de.json')).toEqual({ today: { title: 'Heute' } });
    expect(read(root, 'en/log.json')).toEqual({ title: 'Log' });
    expect(read(root, 'en/today.json')).toEqual({ title: 'Today' });
    expect(read(root, 'de/today.json')).toEqual({ title: 'Heute' });
    expect(exists(root, 'de/log.json')).toBe(false);
    expect(run(root, true)).toEqual([]);
  });

  it('takes the namespaces of the lib modules too', () => {
    const root = fixture({ today: { en: { title: 'Today' } } }, { errors: { en: { unknown: 'Try again.' } } });
    run(root, false);
    expect(read(root, 'en.json')).toEqual({ errors: { unknown: 'Try again.' }, today: { title: 'Today' } });
    expect(read(root, 'en/errors.json')).toEqual({ unknown: 'Try again.' });
  });

  it('fails the check on a namespace file changed by hand', () => {
    const root = fixture({ today: { en: { title: 'Today' } } });
    run(root, false);
    writeFileSync(join(root, 'messages', 'en', 'today.json'), '{\n  "title": "Changed"\n}\n');
    expect(run(root, true)).toEqual([expect.stringMatching(/today\.json is out of date/)]);
  });

  it('fails the check on a file that no message file produces, and deletes it on write', () => {
    const root = fixture({ today: { en: { title: 'Today' } } });
    run(root, false);
    mkdirSync(join(root, 'messages', 'de'));
    const leftovers = ['de.json', 'de/today.json', 'en/log.json'];
    for (const path of leftovers) writeFileSync(join(root, 'messages', path), '{}\n');
    const problems = run(root, true);
    expect(problems).toHaveLength(3);
    for (const problem of problems) expect(problem).toMatch(/comes from no message file/);
    expect(run(root, false)).toEqual([]);
    expect(leftovers.filter((path) => exists(root, path))).toEqual([]);
    expect(run(root, true)).toEqual([]);
  });

  it('refuses two folders that would write the same namespace, in one locale or in two', () => {
    const sameLocale = fixture({ errors: { en: { a: 'A' } } }, { errors: { en: { b: 'B' } } });
    expect(() => run(sameLocale, true)).toThrow(/"errors"/);
    const twoLocales = fixture({ errors: { en: { a: 'A' } } }, { errors: { de: { b: 'B' } } });
    expect(() => run(twoLocales, true)).toThrow(/"errors"/);
  });
});

describe('the committed app messages', () => {
  it('are up to date with the message files of the features and lib modules', () => {
    const appSrc = fileURLToPath(new URL('../../packages/app/src', import.meta.url));
    expect(run(appSrc, true)).toEqual([]);
  });
});

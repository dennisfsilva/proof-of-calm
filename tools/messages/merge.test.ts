import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { complete, LOCALES, mergeMessages, run, serialise } from './merge.ts';

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

describe('complete', () => {
  it('takes every translated key and fills the missing ones from English, in English order', () => {
    const english = { title: 'Today', sheet: { save: 'Save', close: 'Close' }, empty: 'Nothing yet' };
    const translated = { sheet: { close: 'Fechar' }, title: 'Hoje' };
    const done = complete(english, translated);
    expect(done).toEqual({ title: 'Hoje', sheet: { save: 'Save', close: 'Fechar' }, empty: 'Nothing yet' });
    expect(Object.keys(done)).toEqual(['title', 'sheet', 'empty']);
  });

  it('refuses a key English does not have, naming it', () => {
    expect(() => complete({ sheet: { save: 'Save' } }, { sheet: { sav: 'Guardar' } })).toThrow(/sheet\.sav/);
    expect(() => complete({ title: 'Today' }, { title: { nested: 'Hoje' } })).toThrow(/title/);
    expect(() => complete({ sheet: { save: 'Save' } }, { sheet: 'Folha' })).toThrow(/sheet/);
  });

  it('refuses a key that only Object.prototype has, rather than dropping the translation', () => {
    expect(() => complete({ title: 'Today' }, { constructor: 'Construtor' })).toThrow(/constructor/);
    expect(() => complete({ title: 'Today' }, JSON.parse('{"__proto__":"x"}') as Record<string, string>)).toThrow(
      /__proto__/,
    );
    expect(() => complete({ title: 'Today' }, { toString: 'y' })).toThrow(/toString/);
    expect(() => complete({ title: 'Today' }, { title: 'Hoje', hasOwnProperty: 'z' })).toThrow(/hasOwnProperty/);
  });
});

describe('run', () => {
  it('lists English and pt-PT', () => {
    expect(LOCALES).toEqual(['en', 'pt-PT']);
  });

  it('writes the merged English file and one complete file per namespace for each locale, then reports nothing in check mode', () => {
    const root = fixture({
      today: { en: { title: 'Today', save: 'Save' }, 'pt-PT': { title: 'Hoje' } },
      log: { en: { title: 'Log' } },
    });
    expect(run(root, true)).toHaveLength(5);
    expect(run(root, false)).toEqual([]);
    expect(read(root, 'en.json')).toEqual({ log: { title: 'Log' }, today: { title: 'Today', save: 'Save' } });
    expect(read(root, 'en/log.json')).toEqual({ title: 'Log' });
    expect(read(root, 'en/today.json')).toEqual({ title: 'Today', save: 'Save' });
    expect(read(root, 'pt-PT/today.json')).toEqual({ title: 'Hoje', save: 'Save' });
    expect(read(root, 'pt-PT/log.json')).toEqual({ title: 'Log' });
    expect(exists(root, 'pt-PT.json')).toBe(false);
    expect(run(root, true)).toEqual([]);
  });

  it('refuses a translated key that English does not have, and a locale the list does not name', () => {
    const unknownKey = fixture({ today: { en: { title: 'Today' }, 'pt-PT': { titel: 'Hoje' } } });
    expect(() => run(unknownKey, true)).toThrow(/today\.titel/);
    const unknownLocale = fixture({ today: { en: { title: 'Today' }, fr: { title: "Aujourd'hui" } } });
    expect(() => run(unknownLocale, true)).toThrow(/"fr"/);
  });

  it('refuses a translated namespace that only Object.prototype has', () => {
    const root = fixture({ today: { en: { title: 'Today' } }, constructor: { 'pt-PT': { title: 'Hoje' } } });
    expect(() => run(root, true)).toThrow(/constructor has a pt-PT message file but no English one/);
  });

  it('fails the check on a missing and on a stale per-locale file', () => {
    const root = fixture({ today: { en: { title: 'Today' }, 'pt-PT': { title: 'Hoje' } } });
    run(root, false);
    rmSync(join(root, 'messages', 'pt-PT', 'today.json'));
    expect(run(root, true)).toEqual([expect.stringMatching(/today\.json is missing/)]);
    run(root, false);
    writeFileSync(join(root, 'features', 'today', 'messages', 'pt-PT.json'), JSON.stringify({ title: 'Hoje!' }));
    expect(run(root, true)).toEqual([expect.stringMatching(/today\.json is out of date/)]);
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
    const leftovers = ['de.json', 'de/today.json', 'en/log.json', 'pt-PT.json'];
    for (const path of leftovers) writeFileSync(join(root, 'messages', path), '{}\n');
    const problems = run(root, true);
    expect(problems).toHaveLength(4);
    for (const problem of problems) expect(problem).toMatch(/comes from no message file/);
    expect(run(root, false)).toEqual([]);
    expect(leftovers.filter((path) => exists(root, path))).toEqual([]);
    expect(run(root, true)).toEqual([]);
  });

  it('refuses two folders that would write the same namespace, in one locale or in two', () => {
    const sameLocale = fixture({ errors: { en: { a: 'A' } } }, { errors: { en: { b: 'B' } } });
    expect(() => run(sameLocale, true)).toThrow(/"errors"/);
    const twoLocales = fixture({ errors: { en: { a: 'A' } } }, { errors: { 'pt-PT': { b: 'B' } } });
    expect(() => run(twoLocales, true)).toThrow(/"errors"/);
  });
});

describe('the committed app messages', () => {
  it('are up to date with the message files of the features and lib modules', () => {
    const appSrc = fileURLToPath(new URL('../../packages/app/src', import.meta.url));
    expect(run(appSrc, true)).toEqual([]);
  });

  it('join «Regra e venda» with a no-break space in every pt-PT string (CONTENT-STYLE §9)', () => {
    const appSrc = fileURLToPath(new URL('../../packages/app/src', import.meta.url));
    const strings = (value: unknown): string[] =>
      typeof value === 'string'
        ? [value]
        : value !== null && typeof value === 'object'
          ? Object.values(value).flatMap(strings)
          : [];
    const broken: string[] = [];
    let named = 0;
    for (const kind of ['features', 'lib']) {
      for (const folder of readdirSync(join(appSrc, kind))) {
        const file = join(appSrc, kind, folder, 'messages', 'pt-PT.json');
        if (!existsSync(file)) continue;
        for (const text of strings(JSON.parse(readFileSync(file, 'utf8')))) {
          for (const match of text.matchAll(/Regra e(\P{L}*)venda/gu)) {
            named += 1;
            if (match[1] !== ' ') broken.push(`${kind}/${folder}: ${text}`);
          }
        }
      }
    }
    expect(named).toBeGreaterThan(0);
    expect(broken).toEqual([]);
  });
});

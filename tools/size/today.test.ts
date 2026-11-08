import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChunkReport } from '@proofofcalm/config/vite';
import { afterAll, describe, expect, it } from 'vitest';
import { LIMIT, readReport, summaryLine, TODAY, todayAppBytes } from './today.ts';

type Chunk = ChunkReport['chunks'][number];
const chunk = (fields: Partial<Chunk> & Pick<Chunk, 'fileName'>): Chunk => ({
  isEntry: false,
  facade: null,
  imports: [],
  dynamicImports: [],
  brotli: 0,
  appShare: 1,
  ...fields,
});

// The web build's shape (ADR-0045 §8, §9): the entry with Today, its shared chunks, the lazy screens
// and their namespaces. One lazy Today chunk and its messages stand for a Today that becomes lazy.
const report: ChunkReport = {
  chunks: [
    chunk({
      fileName: 'assets/app.js',
      isEntry: true,
      facade: '/repo/apps/web/app.html',
      imports: ['assets/react.js', 'assets/coin-chip.js'],
      dynamicImports: ['assets/log.js', 'assets/log-messages.js', 'assets/today.js'],
      brotli: 1000,
      appShare: 0.5,
    }),
    chunk({ fileName: 'assets/react.js', brotli: 400, appShare: 0 }),
    chunk({ fileName: 'assets/coin-chip.js', imports: ['assets/zod.js'], brotli: 300, appShare: 0.25 }),
    chunk({ fileName: 'assets/zod.js', brotli: 200, appShare: 0 }),
    chunk({
      fileName: 'assets/log.js',
      facade: '/repo/packages/app/src/features/log/index.ts',
      imports: ['assets/coin-chip.js'],
      brotli: 5000,
    }),
    chunk({ fileName: 'assets/log-messages.js', facade: '/repo/packages/app/src/messages/en/log.json', brotli: 900 }),
    chunk({
      fileName: 'assets/today.js',
      facade: 'C:\\repo\\packages\\app\\src\\features\\today\\index.ts',
      imports: ['assets/today-shared.js'],
      dynamicImports: ['assets/today-messages.js'],
      brotli: 100,
    }),
    chunk({ fileName: 'assets/today-shared.js', brotli: 50, appShare: 0.5 }),
    chunk({
      fileName: 'assets/today-messages.js',
      facade: '/repo/packages/app/src/messages/en/today.json',
      brotli: 30,
    }),
  ],
};

describe('todayAppBytes', () => {
  it("counts the entry's static imports, Today's lazy chunk with its imports and its messages, nothing else", () => {
    const result = todayAppBytes(report, TODAY);
    expect(result.chunks).toEqual([
      'assets/app.js',
      'assets/react.js',
      'assets/coin-chip.js',
      'assets/zod.js',
      'assets/today.js',
      'assets/today-shared.js',
      'assets/today-messages.js',
    ]);
    expect(result.bytes).toBe(500 + 75 + 100 + 25 + 30);
    expect(result.top[0]).toEqual({ id: '/repo/apps/web/app.html', bytes: 500 });
    expect(result.top.map((item) => item.bytes)).toEqual([500, 100, 75, 30, 25]);
    expect(result.profile).toBeNull();
  });

  // The shell boots after the plan's country's generated rules file arrives (ADR-0049,
  // packages/app/src/lib/services/create.ts), one dynamic import per country in the rules loader; a person's
  // Today loads exactly one. The profiles with the card text are reached dynamically too, from the same chunk,
  // and are not Today's: the countries chunk reaches both below, and only the rules file counts.
  const PT = 'C:\\repo\\packages\\content\\rules\\pt.json';
  const withRules = (entryImports: readonly string[] = []): ChunkReport => ({
    chunks: [
      ...report.chunks.map((item) =>
        item.isEntry ? { ...item, imports: [...item.imports, 'assets/countries.js', ...entryImports] } : item,
      ),
      chunk({
        fileName: 'assets/countries.js',
        imports: ['assets/react.js'],
        dynamicImports: ['assets/de.js', 'assets/pt.js', 'assets/xx.js', 'assets/profile-pt.js'],
        brotli: 200,
        appShare: 0.5,
      }),
      chunk({ fileName: 'assets/de.js', facade: '/repo/packages/content/rules/de.json', brotli: 279 }),
      chunk({ fileName: 'assets/pt.js', facade: PT, brotli: 332 }),
      chunk({ fileName: 'assets/xx.js', facade: '/repo/packages/content/rules/xx.json', brotli: 139 }),
      chunk({ fileName: 'assets/profile-pt.js', facade: '/repo/packages/content/jurisdictions/pt.json', brotli: 4232 }),
    ],
  });

  it('counts the largest country rules file the countries chunk imports dynamically, not the profile', () => {
    const result = todayAppBytes(withRules(), TODAY);
    expect(result.chunks).toEqual([
      'assets/app.js',
      'assets/react.js',
      'assets/coin-chip.js',
      'assets/zod.js',
      'assets/countries.js',
      'assets/today.js',
      'assets/today-shared.js',
      'assets/today-messages.js',
      'assets/pt.js',
    ]);
    expect(result.bytes).toBe(500 + 75 + 100 + 100 + 25 + 30 + 332);
    expect(result.profile).toEqual({ id: PT, of: 3 });
    expect(summaryLine(result)).toBe(
      "Today's application code: 1,162 bytes brotli of 46,080 (9 chunks, with pt.json, the largest of 3 country rules files)",
    );
  });

  it('counts a profile the entry imports statically: a regression the measurement must show', () => {
    const result = todayAppBytes(withRules(['assets/profile-pt.js']), TODAY);
    expect(result.chunks).toContain('assets/profile-pt.js');
    expect(result.bytes).toBe(500 + 75 + 100 + 100 + 25 + 30 + 332 + 4232);
    expect(result.profile).toEqual({ id: PT, of: 3 });
  });

  it('refuses a report without the app.html entry', () => {
    expect(() => todayAppBytes({ chunks: report.chunks.slice(1) }, TODAY)).toThrow(/app\.html/);
  });
});

describe('readReport', () => {
  const entry = report.chunks[0];

  it("returns a report of the plugin's shape", () => {
    expect(readReport(report)).toBe(report);
  });

  it.each([
    ['a report without chunks', {}, 'the chunk report has no chunks array'],
    ['a chunk without a fileName', { chunks: [{ ...entry, fileName: 1 }] }, 'chunk 0: fileName is not a string'],
    [
      'a chunk with size for brotli',
      { chunks: [{ ...entry, brotli: undefined, size: 1000 }] },
      'chunk assets/app.js: brotli is not a finite number of at least 0',
    ],
    ['a negative brotli', { chunks: [{ ...entry, brotli: -1 }] }, 'chunk assets/app.js: brotli is not'],
    [
      'a chunk without appShare',
      { chunks: [{ ...entry, appShare: undefined }] },
      'chunk assets/app.js: appShare is not a number from 0 to 1',
    ],
    ['an appShare over 1', { chunks: [{ ...entry, appShare: 1.5 }] }, 'chunk assets/app.js: appShare is not'],
    ['imports that are not strings', { chunks: [{ ...entry, imports: [1] }] }, 'chunk assets/app.js: imports is not'],
  ])('refuses %s', (_, value, message) => {
    expect(() => readReport(value)).toThrow(message);
  });
});

describe('summaryLine', () => {
  it('names the bytes, the limit and the chunks', () => {
    expect(summaryLine({ bytes: 39123, chunks: ['a', 'b', 'c'], top: [], profile: null })).toBe(
      "Today's application code: 39,123 bytes brotli of 46,080 (3 chunks)",
    );
    expect(LIMIT).toBe(45 * 1024);
  });
});

describe('node tools/size/today.ts', () => {
  const script = fileURLToPath(new URL('./today.ts', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'today-size-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  /** A report whose one entry chunk is all application code of `bytes` bytes brotli. */
  const run = (bytes: number, ...flags: string[]) => {
    const file = join(dir, `report-${bytes}.json`);
    const entry = chunk({ fileName: 'assets/app.js', isEntry: true, facade: '/repo/apps/web/app.html', brotli: bytes });
    writeFileSync(file, JSON.stringify({ chunks: [entry] }));
    return spawnSync(process.execPath, [script, file, ...flags], { encoding: 'utf8' });
  };

  it('passes at the limit', () => {
    const result = run(LIMIT);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("Today's application code: 46,080 bytes brotli of 46,080 (1 chunk)");
  });

  it('fails 1 byte over the limit, naming the largest chunks', () => {
    const result = run(LIMIT + 1);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('46,081 bytes brotli of 46,080');
    expect(result.stderr).toContain('/repo/apps/web/app.html: 46,081 bytes');
  });

  it('exits 0 over the limit with --warn', () => {
    const result = run(LIMIT + 1, '--warn');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('46,081 bytes brotli of 46,080');
  });

  it('exits 2 on a report whose chunk has size instead of brotli, naming the chunk and the field', () => {
    const file = join(dir, 'renamed.json');
    const { brotli: _, ...entry } = chunk({
      fileName: 'assets/app.js',
      isEntry: true,
      facade: '/repo/apps/web/app.html',
    });
    writeFileSync(file, JSON.stringify({ chunks: [{ ...entry, size: 1000 }] }));
    const result = spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe(`${file}: chunk assets/app.js: brotli is not a finite number of at least 0`);
  });

  it.each([{ flags: [] }, { flags: ['--warn'] }])(
    'exits 2 with one line on a report without the app.html entry, flags $flags',
    ({ flags }) => {
      const file = join(dir, 'no-entry.json');
      writeFileSync(file, JSON.stringify({ chunks: [] }));
      const result = spawnSync(process.execPath, [script, file, ...flags], { encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr.trim()).toBe(`${file}: the chunk report has no app.html entry`);
    },
  );

  it('exits 2 when there is no report', () => {
    const result = spawnSync(process.execPath, [script, join(dir, 'missing.json')], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/build the web host first/);
  });
});

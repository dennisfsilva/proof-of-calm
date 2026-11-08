// Today's application code against its budget (docs/ENGINEERING.md §4: 45 kB brotli), measured from
// the chunk report the web build writes (packages/config/vite/chunk-report-plugin.ts). Today loads the
// app.html entry and its static imports; a lazy Today route would add its chunk, the chunk's static
// imports and the messages it awaits (ADR-0045 §8, §9). The shell boots after the plan's country's
// generated rules file arrives (ADR-0049), one lazy chunk per country: the largest counts, so the budget
// holds for every country. The profile with its card text is lazy too and is not Today's; it counts only
// when something static reaches it, which the measurement must show.
// Each chunk counts its brotli size as Vercel serves it times its share of code outside node_modules.
//   node tools/size/today.ts [report] [--warn]   (exits 1 above the budget unless --warn; 2 on a report it cannot read or measure)
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ChunkReport } from '@proofofcalm/config/vite';

export type TodayBytes = {
  bytes: number;
  chunks: string[];
  top: { id: string; bytes: number }[];
  /** The country rules file counted, the largest of `of` lazy rules chunks; null when none is reached. */
  profile: { id: string; of: number } | null;
};

/** 45 kB, in bytes. */
export const LIMIT = 45 * 1024;

/** Today's screen module or its namespace's messages, as a lazy chunk's facade names them. */
export const TODAY = /[\\/](?:features[\\/]today[\\/]index\.tsx?|messages[\\/][^\\/]+[\\/]today\.json)$/;

/** A country's generated rules file of packages/content, as its lazy chunk's facade names it. */
const RULES = /[\\/]content[\\/]rules[\\/][^\\/]+\.json$/;

const ENTRY = /(^|[\\/])app\.html$/;
const DEFAULT_REPORT = 'apps/web/node_modules/.cache/chunk-report.json';

const isStrings = (value: unknown): boolean => Array.isArray(value) && value.every((item) => typeof item === 'string');
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Each field and the check it must pass, so a report the plugin no longer writes cannot count as 0 bytes. */
const FIELDS: [keyof ChunkReport['chunks'][number], string, (value: unknown) => boolean][] = [
  ['isEntry', 'a boolean', (value) => typeof value === 'boolean'],
  ['facade', 'a string or null', (value) => value === null || typeof value === 'string'],
  ['imports', 'an array of strings', isStrings],
  ['dynamicImports', 'an array of strings', isStrings],
  ['brotli', 'a finite number of at least 0', (value) => isNumber(value) && value >= 0],
  ['appShare', 'a number from 0 to 1', (value) => isNumber(value) && value >= 0 && value <= 1],
];

/** The parsed report if it has the plugin's shape; otherwise throws, naming the chunk and the field. */
export function readReport(value: unknown): ChunkReport {
  const chunks = (value as { chunks?: unknown } | null)?.chunks;
  if (!Array.isArray(chunks)) throw new Error('the chunk report has no chunks array');
  chunks.forEach((chunk: Record<string, unknown> | null, index) => {
    if (typeof chunk?.fileName !== 'string') throw new Error(`chunk ${index}: fileName is not a string`);
    for (const [field, shape, valid] of FIELDS) {
      if (!valid(chunk[field])) throw new Error(`chunk ${chunk.fileName}: ${field} is not ${shape}`);
    }
  });
  return value as ChunkReport;
}

export function todayAppBytes(report: ChunkReport, today: RegExp): TodayBytes {
  const byName = new Map(report.chunks.map((chunk) => [chunk.fileName, chunk]));
  const entry = report.chunks.find((chunk) => chunk.isEntry && chunk.facade !== null && ENTRY.test(chunk.facade));
  if (entry === undefined) throw new Error('the chunk report has no app.html entry');
  const seen = new Map<string, ChunkReport['chunks'][number]>();
  const profiles = new Set<string>();
  const add = (fileName: string): void => {
    const chunk = byName.get(fileName);
    if (chunk === undefined || seen.has(fileName)) return;
    seen.set(fileName, chunk);
    for (const imported of chunk.imports) add(imported);
    for (const lazy of chunk.dynamicImports) {
      const facade = byName.get(lazy)?.facade;
      if (facade && today.test(facade)) add(lazy);
      else if (facade && RULES.test(facade)) profiles.add(lazy);
    }
  };
  add(entry.fileName);
  const bytesOf = (chunk: ChunkReport['chunks'][number]) => Math.round(chunk.brotli * chunk.appShare);
  // Today loads exactly one rules file, the plan's country's: the largest stands for every country.
  const largest = [...profiles]
    .flatMap((fileName) => byName.get(fileName) ?? [])
    .sort((a, b) => bytesOf(b) - bytesOf(a))[0];
  if (largest !== undefined) add(largest.fileName);
  const counted = [...seen.values()].map((chunk) => ({ id: chunk.facade ?? chunk.fileName, bytes: bytesOf(chunk) }));
  return {
    profile: largest === undefined ? null : { id: largest.facade ?? largest.fileName, of: profiles.size },
    bytes: counted.reduce((sum, item) => sum + item.bytes, 0),
    chunks: [...seen.keys()],
    top: counted
      .filter((item) => item.bytes > 0)
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5),
  };
}

const grouped = (n: number) => n.toLocaleString('en-US');

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

export const summaryLine = ({ bytes, chunks, profile }: TodayBytes): string => {
  const counted = `${chunks.length} ${chunks.length === 1 ? 'chunk' : 'chunks'}`;
  const named =
    profile === null ? '' : `, with ${baseName(profile.id)}, the largest of ${profile.of} country rules files`;
  return `Today's application code: ${grouped(bytes)} bytes brotli of ${grouped(LIMIT)} (${counted}${named})`;
};

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const warn = args.includes('--warn');
  const file = args.find((arg) => !arg.startsWith('--')) ?? DEFAULT_REPORT;
  if (!existsSync(file)) {
    console.error(`${file} does not exist; build the web host first.`);
    process.exit(2);
  }
  // Every failure to read or measure the report exits 2 with one line; 1 is only a measurement above the budget.
  let result: TodayBytes;
  try {
    result = todayAppBytes(readReport(JSON.parse(readFileSync(file, 'utf8'))), TODAY);
  } catch (error) {
    console.error(`${file}: ${(error as Error).message}`);
    process.exit(2);
  }
  console.log(summaryLine(result));
  if (result.bytes > LIMIT) {
    for (const { id, bytes } of result.top) console.error(`  ${id}: ${grouped(bytes)} bytes`);
    if (!warn) process.exit(1);
  }
}

// The export check of CI's export-build job (ADR-0045 §10) on apps/mobile/dist: the document exists and
// loads one /assets/ entry; nothing registers a service worker and no sw.js is emitted; the API is never
// called by a relative path and the absolute origin is in the bundle (the host's main.tsx composes the
// services with VITE_API_BASE, so a bundle without it would call the wrapper's own origin). The
// smoke test (e2e/smoke.spec.ts) then renders the export. Usage: node scripts/check-export.ts [dist].
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The origin the wrapper calls (packages/config/vite's host table; the CORS allow-list admits it). */
export const API_ORIGIN = 'https://proofofcalm.com';

// The entry: the boot script loads it from `data-entry` (packages/config/vite/boot.ts); a plain `src` counts too.
const ENTRY = /<script\b[^>]*\b(?:src|data-entry)="(\/assets\/[^"]+)"/g;
const REGISTERS_WORKER = /serviceWorker\.register|navigator\.serviceWorker/;
/** A call with the path alone: `fetch("/api/…")`; the api-client joins the origin and the path at run time. */
const RELATIVE_API_CALL = /fetch\(\s*["'`]\/api\//;

/** Every file under `dir` by its forward-slash path relative to it. */
function filesIn(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => statSync(join(dir, name)).isFile())
    .map((name) => name.split(sep).join('/'));
}

/** The failures of the four assertions, in order; an empty list is a passing export. */
export function checkExport(dist: string): string[] {
  const index = join(dist, 'index.html');
  if (!existsSync(index)) return ['dist/index.html is missing'];
  const failures: string[] = [];
  const entries = [...readFileSync(index, 'utf8').matchAll(ENTRY)].map((match) => match[1]);
  if (entries.length !== 1) failures.push(`index.html loads ${entries.length} /assets/ entries, not one`);

  const files = filesIn(dist);
  if (files.some((file) => /(^|\/)sw\.js$/.test(file))) failures.push('the export holds a sw.js');
  const code = files
    .filter((file) => file.endsWith('.js') || file.endsWith('.html'))
    .map((file) => readFileSync(join(dist, file), 'utf8'))
    .join('\n');
  if (REGISTERS_WORKER.test(code)) failures.push('the export registers a service worker');
  if (RELATIVE_API_CALL.test(code)) failures.push('the bundle calls /api/ by a relative path');
  if (!code.includes(API_ORIGIN)) failures.push(`the bundle calls the API without ${API_ORIGIN}`);
  return failures;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const dist = resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'dist'));
  const failures = checkExport(dist);
  for (const failure of failures) process.stderr.write(`export: ${failure}\n`);
  if (failures.length > 0) process.exit(1);
  process.stdout.write(`export: ${dist} passes\n`);
}

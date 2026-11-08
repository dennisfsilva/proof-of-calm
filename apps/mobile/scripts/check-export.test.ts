import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { API_ORIGIN, checkExport } from './check-export';

const INDEX =
  '<!doctype html><html><body><div id="root"></div><script data-entry="/assets/main-abc.js">(function(){})()</script></body></html>';
const BUNDLE = `const base="${API_ORIGIN}";fetch(\`\${base}\${"/api/prices"}\`);`;

const dirs: string[] = [];
function exportWith(files: Record<string, string>): string {
  const dist = mkdtempSync(join(tmpdir(), 'poc-export-'));
  dirs.push(dist);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dist, name, '..'), { recursive: true });
    writeFileSync(join(dist, name), text);
  }
  return dist;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('checkExport (ADR-0045 §10)', () => {
  it('passes an export with one entry, no worker and the API at the absolute origin', () => {
    expect(checkExport(exportWith({ 'index.html': INDEX, 'assets/main-abc.js': BUNDLE }))).toEqual([]);
  });

  it('fails when the document is missing, and says nothing else then', () => {
    expect(checkExport(exportWith({ 'assets/main-abc.js': BUNDLE }))).toEqual(['dist/index.html is missing']);
  });

  it('fails a document without exactly one /assets/ entry', () => {
    const none = exportWith({ 'index.html': '<!doctype html><html><body></body></html>' });
    expect(checkExport(none)).toContain('index.html loads 0 /assets/ entries, not one');
    const two = exportWith({ 'index.html': INDEX.replace('</body>', '<script src="/assets/b.js"></script></body>') });
    expect(checkExport(two)).toContain('index.html loads 2 /assets/ entries, not one');
  });

  it('fails an emitted sw.js and any service-worker registration', () => {
    const failures = checkExport(
      exportWith({
        'index.html': INDEX,
        'sw.js': 'self.addEventListener("install",()=>{})',
        'assets/main-abc.js': `${BUNDLE}navigator.serviceWorker.register("/sw.js")`,
      }),
    );
    expect(failures).toEqual(['the export holds a sw.js', 'the export registers a service worker']);
  });

  it('fails a relative API call and an API path without the absolute origin', () => {
    const relative = exportWith({ 'index.html': INDEX, 'assets/main-abc.js': 'fetch("/api/prices")' });
    expect(checkExport(relative)).toEqual([
      'the bundle calls /api/ by a relative path',
      `the bundle calls the API without ${API_ORIGIN}`,
    ]);
    const joined = exportWith({ 'index.html': INDEX, 'assets/main-abc.js': 'const p="/api/prices";fetch(base+p)' });
    expect(checkExport(joined)).toEqual([`the bundle calls the API without ${API_ORIGIN}`]);
  });

  it('fails a bundle without the absolute origin even where no API path is visible: the base is in the bundle', () => {
    expect(checkExport(exportWith({ 'index.html': INDEX, 'assets/main-abc.js': 'console.log(1)' }))).toEqual([
      `the bundle calls the API without ${API_ORIGIN}`,
    ]);
  });
});

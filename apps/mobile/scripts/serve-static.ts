// Serves the export as plain files, as the wrapper's file server does (ADR-0045 §10): a file or a 404,
// no SPA fallback and no rewrite, so the smoke test proves the hash router carries every screen.
// Usage: node scripts/serve-static.ts [--port 3100] [--dir dist]. Prints `Ready on http://localhost:<port>`.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const { values } = parseArgs({
  options: { port: { type: 'string', default: '3100' }, dir: { type: 'string', default: 'dist' } },
});
const dir = resolve(import.meta.dirname, '..', values.dir);
const port = Number(values.port);

createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const file = join(dir, normalize(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  process.stdout.write(`Ready on http://localhost:${port}\n`);
});

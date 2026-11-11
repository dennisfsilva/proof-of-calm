// A source PDF as text for the content review's agent (docs/CONTENT-OPS.md §3). It fetches only an
// https URL on packages/content/sources.allow.json, re-checks the host on every redirect, caps the
// body while reading it, keeps the bytes only when they start as a PDF, saves them under
// .content-review/pdf/ (gitignored) by host and hash, and runs pdftotext (xpdf, shipped with Git for
// Windows) through argv, no shell, on that file. The agent then Reads the .txt and quotes it verbatim.
// Usage: node tools/content-review/pdf.ts <url>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedDomains, sourceLink } from './body.ts';

export const PDF_DIR = '.content-review/pdf';
export const MAX_BYTES = 25 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 60_000;
/** What the agent does when a PDF yields no text (docs/CONTENT-OPS.md §3, the unreachable rows). */
export const FILING_RULE =
  "File the source as an unreachable row 'PDF not read'; leave the lines that rest only on it unchanged and name them in notes.";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;
export type Exec = (file: string, args: readonly string[]) => unknown;

/** The URL when it may be fetched: https, no credentials or port, its host on the allow-list. */
export function pdfTarget(url: string, domains: readonly string[]): { href?: string; problem?: string } {
  const { problem } = sourceLink(url, domains);
  return problem ? { problem } : { href: url };
}

/** The PDF's bytes, following at most three redirects whose every hop passes pdfTarget. */
export async function fetchPdf(
  url: string,
  domains: readonly string[],
  fetchFn: Fetch = fetch,
): Promise<{ bytes?: Uint8Array; problem?: string }> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = url;
  for (let hop = 0; ; hop++) {
    const target = pdfTarget(current, domains);
    if (target.problem) return { problem: target.problem };
    let response: Response;
    try {
      response = await fetchFn(current, { redirect: 'manual', signal });
    } catch (error) {
      return { problem: `${current} could not be fetched (${(error as Error).name})` };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { problem: `${current} answered ${response.status} without a location` };
      if (hop === MAX_REDIRECTS) return { problem: `${url} takes more than ${MAX_REDIRECTS} redirects` };
      current = new URL(location, current).href;
      continue;
    }
    if (!response.ok) return { problem: `${current} answered ${response.status}` };
    return readCapped(response, current, signal);
  }
}

/** The body, refused as soon as it passes MAX_BYTES and unless it starts with `%PDF-`. */
async function readCapped(
  response: Response,
  url: string,
  signal: AbortSignal,
): Promise<{ bytes?: Uint8Array; problem?: string }> {
  const tooBig = { problem: `${url} is over 25 MB` };
  if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) {
    await response.body?.cancel();
    return tooBig;
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      if (!reader) break;
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return tooBig;
      }
      chunks.push(value);
    }
  } catch {
    return { problem: `${url} broke off while reading${signal.aborted ? ' (timed out)' : ''}` };
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return { problem: `${url} is not a PDF` };
  return { bytes };
}

/** `.content-review/pdf/<host>-<12 hex of the URL's SHA-256>`: no segment of the URL's path. */
export function pdfName(url: string): string {
  const host = new URL(url).hostname.replace(/[^a-z0-9.-]/g, '_');
  return `${PDF_DIR}/${host}-${createHash('sha256').update(url).digest('hex').slice(0, 12)}`;
}

const pdftotext: Exec = (file, args) => execFileSync(file, args, { stdio: 'ignore', timeout: TIMEOUT_MS });

/** Fetch, save and extract; the one line to print and the exit code (2: refused URL, 1: not read). */
export async function run(
  url: string,
  deps: { domains: readonly string[]; root: string; fetchFn?: Fetch; exec?: Exec },
): Promise<{ line: string; code: 0 | 1 | 2 }> {
  const target = pdfTarget(url, deps.domains);
  if (target.problem) return { line: `pdf: ${target.problem}`, code: 2 };
  const notRead = (why: string) => ({ line: `pdf: PDF not read, ${why}. ${FILING_RULE}`, code: 1 as const });
  const fetched = await fetchPdf(url, deps.domains, deps.fetchFn);
  if (!fetched.bytes) return notRead(fetched.problem ?? 'no bytes');
  mkdirSync(join(deps.root, PDF_DIR), { recursive: true });
  const base = join(deps.root, pdfName(url));
  const [pdf, txt] = [`${base}.pdf`, `${base}.txt`];
  writeFileSync(pdf, fetched.bytes);
  rmSync(txt, { force: true });
  try {
    (deps.exec ?? pdftotext)('pdftotext', ['-q', '-enc', 'UTF-8', '-layout', pdf, txt]);
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    return notRead(missing ? 'pdftotext is missing' : 'pdftotext failed');
  }
  const text = existsSync(txt) ? readFileSync(txt, 'utf8') : '';
  const words = text.split(/\s+/u).filter((word) => word !== '').length;
  if (words === 0) return notRead('pdftotext found no text');
  return { line: `pdf: ${txt}, ${words} words`, code: 0 };
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const domains = allowedDomains(JSON.parse(readFileSync(join(root, 'packages/content/sources.allow.json'), 'utf8')));
  const url = process.argv[2];
  if (process.argv.length !== 3 || url === undefined) {
    console.error('Usage: node tools/content-review/pdf.ts <url>');
    process.exit(2);
  }
  const { line, code } = await run(url, { domains, root });
  console.log(line);
  process.exit(code);
}

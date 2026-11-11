import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Fetch, FILING_RULE, fetchPdf, MAX_BYTES, PDF_DIR, PDFTOTEXT, pdfName, pdfTarget, run } from './pdf.ts';

const domains = ['revenue.ie', 'bundesfinanzministerium.de'];
const URL1 = 'https://www.revenue.ie/en/tdm/part-02/02-01-03.pdf';

/** A one-page PDF written by hand: Helvetica, one line of text, the cross-reference table's offsets exact. */
function onePagePdf(text: string): Uint8Array<ArrayBuffer> {
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** A fetch that answers each URL from the table and records every URL asked for. */
function fakeFetch(answers: Record<string, () => Response>, asked: string[] = []): Fetch {
  return async (url, init) => {
    asked.push(url);
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const answer = answers[url];
    if (!answer) throw new Error(`unexpected fetch of ${url}`);
    return answer();
  };
}
const redirect = (location: string) => () => new Response(null, { status: 302, headers: { location } });
const pdf = () => new Response(onePagePdf('Proof of calm plan'));

const temps: string[] = [];
function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pdf-test-'));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('pdfTarget and fetchPdf', () => {
  it('refuses http, credentials, an off-list host and a redirect off the list', async () => {
    expect(pdfTarget('http://www.revenue.ie/a.pdf', domains).problem).toMatch(/not https/);
    expect(pdfTarget('https://user:pw@www.revenue.ie/a.pdf', domains).problem).toMatch(/credentials/);
    expect(pdfTarget('https://www.revenue.ie.example.com/a.pdf', domains).problem).toMatch(/not on/);
    expect(pdfTarget(URL1, domains)).toEqual({ href: URL1 });

    const asked: string[] = [];
    const offList = fakeFetch(
      { [URL1]: redirect('/moved.pdf'), 'https://www.revenue.ie/moved.pdf': redirect('https://example.com/x.pdf') },
      asked,
    );
    expect((await fetchPdf(URL1, domains, offList)).problem).toMatch(/example\.com is not on/);
    expect(asked).toEqual([URL1, 'https://www.revenue.ie/moved.pdf']);

    const hops = fakeFetch({
      [URL1]: redirect('https://www.revenue.ie/1.pdf'),
      'https://www.revenue.ie/1.pdf': redirect('https://www.revenue.ie/2.pdf'),
      'https://www.revenue.ie/2.pdf': redirect('https://www.revenue.ie/3.pdf'),
      'https://www.revenue.ie/3.pdf': redirect('https://www.revenue.ie/4.pdf'),
      'https://www.revenue.ie/4.pdf': pdf,
    });
    expect((await fetchPdf(URL1, domains, hops)).problem).toMatch(/more than 3 redirects/);

    const threeHops = fakeFetch({
      [URL1]: redirect('https://www.revenue.ie/1.pdf'),
      'https://www.revenue.ie/1.pdf': redirect('https://www.revenue.ie/2.pdf'),
      'https://www.revenue.ie/2.pdf': redirect('https://www.revenue.ie/3.pdf'),
      'https://www.revenue.ie/3.pdf': pdf,
    });
    expect((await fetchPdf(URL1, domains, threeHops)).bytes?.length).toBeGreaterThan(0);
  });

  it('refuses bytes that are not a PDF and a body over the cap', async () => {
    const html = fakeFetch({ [URL1]: () => new Response('<!doctype html><p>Not found</p>') });
    expect((await fetchPdf(URL1, domains, html)).problem).toMatch(/not a PDF/);

    const missing = fakeFetch({ [URL1]: () => new Response('gone', { status: 404 }) });
    expect((await fetchPdf(URL1, domains, missing)).problem).toMatch(/404/);

    const declared = fakeFetch({
      [URL1]: () => new Response('%PDF-1.4', { headers: { 'content-length': String(MAX_BYTES + 1) } }),
    });
    expect((await fetchPdf(URL1, domains, declared)).problem).toMatch(/over 25 MB/);

    // No length header and an endless body: reading stops once the cap is passed.
    const chunk = new Uint8Array(1024 * 1024).fill(0x25);
    let pulls = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(chunk);
      },
    });
    const huge = fakeFetch({ [URL1]: () => new Response(endless) });
    expect((await fetchPdf(URL1, domains, huge)).problem).toMatch(/over 25 MB/);
    expect(pulls).toBeLessThan(30);
  });
});

describe('FILING_RULE', () => {
  it('the filing rule names expected and notes, no field the draft lacks', () => {
    const draft = JSON.parse(readFileSync(new URL('./fixtures/draft-good.json', import.meta.url), 'utf8'));
    // An unreachable row holds only url and expected; the 'PDF not read' text goes in a note.
    expect(Object.keys(draft.unreachable[0])).toEqual(['url', 'expected']);
    expect(Object.keys(draft)).toContain('notes');
    expect(FILING_RULE).toContain('an unreachable row: its url, and in expected what the source should show');
    expect(FILING_RULE).toContain("add a note 'PDF not read: <url>' naming the lines that rest only on it");
    expect(FILING_RULE).not.toMatch(/unreachable row '/);
  });
});

describe('pdfName', () => {
  it('names the file inside .content-review/pdf', () => {
    const name = pdfName(URL1);
    expect(name).toMatch(/^\.content-review\/pdf\/www\.revenue\.ie-[0-9a-f]{12}$/);
    expect(pdfName('https://www.revenue.ie/en/../../../etc/passwd')).toMatch(
      /^\.content-review\/pdf\/www\.revenue\.ie-[0-9a-f]{12}$/,
    );
    expect(pdfName('https://www.revenue.ie/other.pdf')).not.toBe(name);
  });
});

describe('run', () => {
  it('prints the filing rule when pdftotext is missing', async () => {
    const root = tempRoot();
    const missing = () => {
      throw Object.assign(new Error('spawn pdftotext ENOENT'), { code: 'ENOENT' });
    };
    const fetchFn = fakeFetch({ [URL1]: pdf });
    const result = await run(URL1, { domains, root, fetchFn, exec: missing });
    expect(result.code).toBe(1);
    expect(result.line).toContain('pdftotext is missing');
    expect(result.line).toContain(FILING_RULE);

    const empty = (_file: string, args: readonly string[]) => writeFileSync(String(args.at(-1)), ' \n\f');
    const blank = await run(URL1, { domains, root, fetchFn, exec: empty });
    expect(blank.code).toBe(1);
    expect(blank.line).toContain('no text');
    expect(blank.line).toContain(FILING_RULE);

    const offList = await run('https://example.com/a.pdf', { domains, root, fetchFn, exec: missing });
    expect(offList.code).toBe(2);
    expect(offList.line).toMatch(/^pdf: .*example\.com is not on/);
  });

  it('a redirect whose Location does not parse prints the filing rule', async () => {
    const root = tempRoot();
    const fetchFn: Fetch = async () =>
      new Response(null, { status: 302, headers: { location: 'https://exa mple.com/x.pdf' } });
    const result = await run(URL1, { domains, root, fetchFn });
    expect(result.code).toBe(1);
    expect(result.line).toMatch(/^pdf: PDF not read, .*redirect/);
    expect(result.line).toContain(FILING_RULE);
    expect(existsSync(join(root, PDF_DIR))).toBe(false);
  });

  it('an error thrown by fetch prints the filing rule with its message', async () => {
    const root = tempRoot();
    const fetchFn: Fetch = async () => {
      throw new Error('socket hang up');
    };
    const result = await run(URL1, { domains, root, fetchFn });
    expect(result.code).toBe(1);
    expect(result.line).toContain('socket hang up');
    expect(result.line).toContain(FILING_RULE);
    expect(result.line).not.toContain('\n');
  });

  const hasPdftotext = spawnSync(PDFTOTEXT, ['-v']).error === undefined;
  it.skipIf(!hasPdftotext)('extracts a hand-written one-page PDF', async () => {
    const root = tempRoot();
    const result = await run(URL1, { domains, root, fetchFn: fakeFetch({ [URL1]: pdf }) });
    expect(result.code).toBe(0);
    expect(result.line).toBe(`pdf: ${join(root, pdfName(URL1))}.txt, 4 words`);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allowedDomains, defuseCell, parseDraft, type ReviewDraft, renderBody, sourceLink } from './body.ts';

const WJ = String.fromCodePoint(0x2060);
const PUNCT = /[!-/:-@[-`{-~]/;
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
/** Inline allow-list: the unit tests read no file outside tools (tools/README.md, turbo inputs). */
const domains = ['boe.es', 'normattiva.it', 'example.gov', 'revenue.ie', 'gov.ie'];

/** The edges #125 lists, plus what GitHub's renderer was seen to link (emoji, SHAs, math, paths). */
const hostile = [
  '@dennisfsilva at index 0',
  'line one\n@dennisfsilva after a newline',
  'in backticks `@dennisfsilva`',
  'mail foo@bar.com now',
  'Closes: #23',
  'fixes owner/repo#1',
  'see https://github.com/dennisfsilva/proof-of-calm/issues/23',
  'a keyword at the end closes #23',
  'GH-1 and gh-2',
  '<img src=x onerror=alert(1)>',
  '<!-- swallow the rest',
  '&#64;dennisfsilva &amp; &copy;',
  '![x](y)',
  '[boe.es](https://evil.example)',
  'a | pipe',
  '- ```\nfence in a list item',
  'code `span | across` cells',
  `bidi ${String.fromCodePoint(0x202e)}evil${String.fromCodePoint(0x202c)} override`,
  ':smile: and :+1:',
  '802711b6 and dennisfsilva/proof-of-calm@802711b6ba2dcc7381ffccb66f41ba28941e4e70',
  '$x^2$ and $$y$$ and a$b$c',
  'www.example.com and WWW.example.com',
  'github.com/dennisfsilva/proof-of-calm/issues/23',
  'trailing backslash \\',
  'escaped \\| pipe',
  '    indented code',
];

/** What the cell must read as once rendered: one line, no control or format characters, trimmed. */
const plain = (text: string) =>
  text
    .replace(/\r\n?|[\n\t]/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim();

describe('defuseCell', () => {
  it('defuseCell leaves no mention, reference, tag, entity, span, fence or autolink at any position', () => {
    for (const input of hostile) {
      const out = defuseCell(input);
      // Every ASCII punctuation character is backslash-escaped, so CommonMark reads it as a literal.
      const unescaped = out.replace(/\\[!-/:-@[-`{-~]/g, '');
      expect(unescaped, input).not.toMatch(PUNCT);
      // One line, and no control or format character but the word joiner.
      expect(out.replaceAll(WJ, ''), input).not.toMatch(/[\p{Cc}\p{Cf}]/u);
      // The joiner breaks what GitHub links in text after the Markdown parse.
      expect(out.replace(new RegExp(`[@#:/]${WJ}`, 'g'), ''), input).not.toMatch(/[@#:/]/);
      expect(out.replaceAll(`${WJ}\\$${WJ}`, ''), input).not.toMatch(/\\\$/);
      expect(out.replace(new RegExp(`www${WJ}`, 'gi'), ''), input).not.toMatch(/www/i);
      expect(out, input).not.toMatch(/gh\\-/i);
      expect(out, input).not.toMatch(/[0-9a-f]{7}/i);
      // Nothing is lost: unescaped and without joiners, the cell reads as its input.
      expect(out.replace(/\\([!-/:-@[-`{-~])/g, '$1').replaceAll(WJ, ''), input).toBe(plain(input));
    }
    expect(defuseCell('@x')).toBe(`\\@${WJ}x`);
    expect(defuseCell('Closes: #23')).toBe(`Closes\\:${WJ} \\#${WJ}23`);
    expect(defuseCell('a | b')).toBe('a \\| b');
  });

  it('defuseCell leaves no task-list checkbox at the start of a list item', () => {
    // GitHub's task-list filter runs after the parse and reads `\[x\]` as `[x]`; it also takes a
    // leading `- ` or `1. ` and a no-break space after the brackets (gh api markdown, 2026-11-11).
    const boxes = ['[ ] open task', '[x] done task', '[X] Done task', '- [x] after a dash', '1. [ ] after a number'];
    const ticked = /\\\[[ xX]\\\]/;
    for (const input of [...boxes, '[x] no-break space']) {
      expect(defuseCell(input), input).not.toMatch(ticked);
    }
    const draft = good();
    const first = (i: number) => boxes[i % boxes.length] as string;
    const { body, problems } = renderBody(
      {
        ...draft,
        verified: draft.verified.map((v, i) => ({ ...v, item: first(i) })),
        pending: draft.pending.map((p, i) => ({ ...p, item: first(i + 1) })),
        queue: boxes.map((item) => ({ item, outcome: 'closed', note: '[x] note' })),
        notes: boxes,
        canary: { path: '[x] path', instructions: boxes },
      },
      TEMPLATE,
      domains,
    );
    expect(problems).toEqual([]);
    expect(body).not.toMatch(ticked);
  });
});

describe('sourceLink', () => {
  it('sourceLink writes the three URLs of #125’s finding as links with & and ~ and #2 intact', () => {
    expect(sourceLink('https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764&tn=1&p=20231228', domains)).toEqual({
      link: `[www${WJ}\\.boe\\.es](<https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764&amp;tn=1&amp;p=20231228>)`,
    });
    const normattiva =
      'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.presidente.repubblica:1986-12-22;917~art67';
    expect(sourceLink(normattiva, domains)).toEqual({ link: `[www${WJ}\\.normattiva\\.it](<${normattiva}>)` });
    expect(sourceLink('https://example.gov/page#2', domains)).toEqual({
      link: '[example\\.gov](<https://example.gov/page#2>)',
    });
  });

  it('sourceLink refuses http, credentials, an off-list host, boe.es.evil.example and javascript:', () => {
    const refused = [
      'http://boe.es/a',
      'https://user:pass@boe.es/a',
      'https://user@boe.es/a',
      'https://evil.example/a',
      'https://boe.es.evil.example/a',
      'https://notboe.es/a',
      'javascript:alert(1)',
      'https://boe.es/a b',
      'https://boe.es/a|b',
      'https://boe.es/a>b',
      'https://BOE.es/a',
      'https://boe.es:8443/a',
      'not a url',
    ];
    for (const url of refused) {
      const result = sourceLink(url, domains);
      expect(result.link, url).toBeUndefined();
      expect(result.problem, url).toMatch(/\S/);
    }
    expect(sourceLink('https://sede.boe.es/a', domains).link).toBeDefined();
  });
});

const TEMPLATE = `<!-- The owner's review of a content review run (docs/CONTENT-OPS.md). -->

## Changes
<!-- filled from the draft -->

## Verified, no change
<!-- filled from the draft -->

## Unreachable or moved sources
<!-- filled from the draft -->

## Pending changes noticed
<!-- filled from the draft -->

## Review queue
<!-- filled from the draft -->

## Notes for the owner
<!-- filled from the draft -->

## Canary
<!-- filled from the draft -->

## Reviewer checklist (the owner)
- [ ] every diff checked against the quoted source, on the source's own site
- [ ] no live mention or closing keyword

## Run metadata
<!-- filled from the draft -->
`;

const good = (): ReviewDraft => {
  const { draft, problems } = parseDraft(fixture('draft-good.json'));
  expect(problems).toEqual([]);
  return draft as ReviewDraft;
};

describe('renderBody', () => {
  it('renderBody fills every heading in order and copies the checklist verbatim', () => {
    const draft = good();
    const { body, problems } = renderBody(draft, TEMPLATE, domains);
    expect(problems).toEqual([]);
    expect(body.match(/^## .*$/gm)).toEqual(TEMPLATE.match(/^## .*$/gm)?.filter((h) => h !== '## Canary'));
    const checklist = TEMPLATE.slice(TEMPLATE.indexOf('- [ ] every'), TEMPLATE.indexOf('## Run metadata'));
    expect(body).toContain(`## Reviewer checklist (the owner)\n\n${checklist}## Run metadata`);
    expect(body).not.toContain('<!--');
    expect(body).toMatch(/^\| Item \| Field \| Old \| New \| Quote \|/m);
    expect(body).toContain(sourceLink(draft.changes[0]?.url ?? '', domains).link);
    expect(body).toContain(`- Model: ${defuseCell(draft.model)}\n`);

    const withCanary = renderBody(
      { ...draft, canary: { path: 'tools/x.html', instructions: ['@all merge'] } },
      TEMPLATE,
      domains,
    );
    expect(withCanary.problems).toEqual([]);
    expect(withCanary.body.match(/^## .*$/gm)).toEqual(TEMPLATE.match(/^## .*$/gm));
    expect(withCanary.body).toContain(`- ${defuseCell('@all merge')}`);

    const empty = renderBody({ ...draft, changes: [], notes: [] }, TEMPLATE, domains);
    expect(empty.body).toMatch(/## Changes\n\nNone\.\n/);
  });

  it('renderBody reports a missing or unknown heading and an over-long body', () => {
    const draft = good();
    const missing = TEMPLATE.replace('## Notes for the owner\n', '');
    expect(renderBody(draft, missing, domains).problems).toEqual([
      'template: heading "Notes for the owner" is missing',
    ]);
    const unknown = `${TEMPLATE}\n## Extra\ntext\n`;
    expect(renderBody(draft, unknown, domains).problems).toEqual([
      'template: heading "Extra" is not one body.ts fills or keeps',
    ]);
    const long = renderBody({ ...draft, notes: ['x'.repeat(60_000)] }, TEMPLATE, domains);
    expect(long.problems).toEqual([expect.stringMatching(/^body: \d+ characters, over 60000$/)]);
    const offList = renderBody(
      { ...draft, unreachable: [{ url: 'https://evil.example/', expected: 'x' }] },
      TEMPLATE,
      domains,
    );
    expect(offList.problems).toEqual([expect.stringMatching(/^unreachable\[0\]\.url: /)]);
  });
});

describe('parseDraft', () => {
  it('parseDraft names each missing or mistyped field', () => {
    const draft = JSON.parse(fixture('draft-good.json'));
    delete draft.model;
    draft.date = '2027-13-01';
    draft.countries = ['IE', 3];
    draft.changes[0].confidence = 'certain';
    draft.changes[0].substantive = 'yes';
    draft.pending = [
      { item: 'IE', what: 'x', effectiveFrom: '2027-01-01', status: 'rumoured', url: 'https://revenue.ie/' },
    ];
    draft.queue = {};
    draft.canary = { path: 'x', instructions: 'y' };
    draft.extra = true;
    expect(parseDraft(JSON.stringify(draft)).problems).toEqual([
      'date: expected a date YYYY-MM-DD',
      'model: missing',
      'countries[1]: expected a string',
      'changes[0].confidence: expected one of high, medium, low',
      'changes[0].substantive: expected true or false',
      'pending[0].status: expected one of proposed, enacted, in force',
      'queue: expected a list',
      'canary.instructions: expected a list',
      'extra: unknown field',
    ]);
    expect(parseDraft('{').problems).toEqual([expect.stringMatching(/^not JSON: /)]);
    expect(parseDraft('[]').problems).toEqual(['(root): expected an object']);
  });
});

describe('allowedDomains', () => {
  it('allowedDomains skips $comment', () => {
    const allow = { $comment: 'see docs', PT: ['dre.pt', 'parlamento.pt'], EU: ['eur-lex.europa.eu', 'dre.pt'] };
    expect(allowedDomains(allow)).toEqual(['dre.pt', 'parlamento.pt', 'eur-lex.europa.eu']);
    expect(allowedDomains({ $comment: 'x', PT: 'dre.pt' })).toEqual([]);
    expect(allowedDomains(null)).toEqual([]);
  });
});

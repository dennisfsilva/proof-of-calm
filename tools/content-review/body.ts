// The content review's pull-request body, rendered from the structured draft the agent writes
// (session 18b's plan, decision 1, option two; docs/CONTENT-OPS.md §3). Nothing the agent wrote is
// passed through as Markdown: every text cell is defused so that it reads as literal text under any
// parse, and every URL is checked against packages/content/sources.allow.json and written as a link
// whose text is its host. render-check.ts proves both through GitHub's own renderer.

export type Change = {
  item: string;
  field: string;
  old: string;
  new: string;
  quote: string;
  eventDate: string;
  url: string;
  accessed: string;
  confidence: 'high' | 'medium' | 'low';
  substantive: boolean;
  reason: string;
};

export type ReviewDraft = {
  date: string;
  model: string;
  countries: string[];
  changes: Change[];
  verified: { item: string; urls: string[] }[];
  unreachable: { url: string; expected: string }[];
  pending: {
    item: string;
    what: string;
    effectiveFrom: string;
    status: 'proposed' | 'enacted' | 'in force';
    url: string;
  }[];
  queue: { item: string; outcome: 'closed' | 'carried over'; note: string }[];
  notes: string[];
  canary?: { path: string; instructions: string[] };
};

/** A field's shape: a kind, an enum, a list of a shape, or an object of shapes (`?` marks optional). */
type Shape = 'string' | 'date' | 'boolean' | readonly string[] | { list: Shape } | { [field: string]: Shape };
const LIST = (of: Shape) => ({ list: of });
const CHANGE: Shape = {
  item: 'string',
  field: 'string',
  old: 'string',
  new: 'string',
  quote: 'string',
  eventDate: 'date',
  url: 'string',
  accessed: 'date',
  confidence: ['high', 'medium', 'low'],
  substantive: 'boolean',
  reason: 'string',
};
const DRAFT: Shape = {
  date: 'date',
  model: 'string',
  countries: LIST('string'),
  changes: LIST(CHANGE),
  verified: LIST({ item: 'string', urls: LIST('string') }),
  unreachable: LIST({ url: 'string', expected: 'string' }),
  pending: LIST({
    item: 'string',
    what: 'string',
    effectiveFrom: 'date',
    status: ['proposed', 'enacted', 'in force'],
    url: 'string',
  }),
  queue: LIST({ item: 'string', outcome: ['closed', 'carried over'], note: 'string' }),
  notes: LIST('string'),
  'canary?': { path: 'string', instructions: LIST('string') },
};

const isDate = (v: string) => {
  const [y = 0, m = 0, d = 0] = v.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && day.getUTCMonth() === m - 1 && day.getUTCDate() === d;
};
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function check(value: unknown, shape: Shape, path: string, problems: string[]): void {
  const at = path || '(root)';
  if (shape === 'string' || shape === 'date') {
    if (typeof value !== 'string')
      problems.push(`${at}: expected a ${shape === 'date' ? 'date YYYY-MM-DD' : 'string'}`);
    else if (shape === 'date' && !isDate(value)) problems.push(`${at}: expected a date YYYY-MM-DD`);
  } else if (shape === 'boolean') {
    if (typeof value !== 'boolean') problems.push(`${at}: expected true or false`);
  } else if (Array.isArray(shape)) {
    if (!shape.includes(value as string)) problems.push(`${at}: expected one of ${shape.join(', ')}`);
  } else if ('list' in shape) {
    if (!Array.isArray(value)) problems.push(`${at}: expected a list`);
    else for (const [i, item] of value.entries()) check(item, shape.list as Shape, `${path}[${i}]`, problems);
  } else if (!isObject(value)) {
    problems.push(`${at}: expected an object`);
  } else {
    const fields = Object.entries(shape as Record<string, Shape>);
    for (const [key, field] of fields) {
      const name = key.replace(/\?$/, '');
      const sub = path ? `${path}.${name}` : name;
      if (!Object.hasOwn(value, name)) {
        if (!key.endsWith('?')) problems.push(`${sub}: missing`);
      } else check(value[name], field, sub, problems);
    }
    const known = new Set(fields.map(([key]) => key.replace(/\?$/, '')));
    for (const key of Object.keys(value)) {
      if (!known.has(key) && !key.startsWith('$')) problems.push(`${path ? `${path}.` : ''}${key}: unknown field`);
    }
  }
}

/** The draft the agent wrote, checked by hand (tools are dependency-free); `$`-keys are comments. */
export function parseDraft(json: string): { draft?: ReviewDraft; problems: string[] } {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    return { problems: [`not JSON: ${(error as Error).message}`] };
  }
  const problems: string[] = [];
  check(value, DRAFT, '', problems);
  return problems.length > 0 ? { problems } : { draft: value as ReviewDraft, problems };
}

/** Every domain of sources.allow.json, once, in file order; `$comment` and other `$`-keys skipped. */
export function allowedDomains(allow: unknown): string[] {
  if (!isObject(allow)) return [];
  const lists = Object.entries(allow).filter(([key, list]) => !key.startsWith('$') && Array.isArray(list));
  return [...new Set(lists.flatMap(([, list]) => (list as unknown[]).filter((d) => typeof d === 'string')))];
}

/**
 * One line of literal text under every reading GitHub gives it (CommonMark §2.4 escapes every ASCII
 * punctuation character; GitHub's filters after the parse are broken by a word joiner, U+2060):
 * mentions and references (`@`, `#`, `/`), URLs and emoji (`:`), math (`$`), `www`, `GH-n` and
 * commit SHAs (hex runs over six). Line breaks become spaces; control and format characters
 * (bidi overrides included) are removed. Shaped from what `gh api markdown -f mode=gfm` returned.
 */
export function defuseCell(text: string): string {
  return text
    .replace(/\r\n?|[\n\t]/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .replace(/[0-9a-f]{7,}/gi, (run) => run.replace(/.{6}(?=.)/g, (six) => six + WJ))
    .replace(/www|gh(?=-)/gi, (word) => word + WJ)
    .replace(/[!-/:-@[-`{-~]/g, '\\$&')
    .replace(/\\[@#/:]/g, (escaped) => escaped + WJ)
    .replace(/\\\$/g, (dollar) => WJ + dollar + WJ);
}

/** U+2060 WORD JOINER, written by code point so that no invisible character sits in the source. */
const WJ = String.fromCodePoint(0x2060);

/** Characters a source URL may hold: RFC 3986's, less `[`, `]` and those a table or a parse could split on. */
const URL_CHARS = /^[A-Za-z0-9\-._~:/?#@!$&'()*+,;=%]+$/;

/** A source URL as `[host](<url>)`: https, no credentials or port, host on the list or under it. */
export function sourceLink(url: string, domains: readonly string[]): { link?: string; problem?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { problem: `"${url}" is not a URL` };
  }
  if (parsed.protocol !== 'https:') return { problem: `${url} is not https` };
  if (parsed.username || parsed.password) return { problem: `${url} carries credentials` };
  if (parsed.port) return { problem: `${url} names a port` };
  if (!URL_CHARS.test(url) || parsed.href !== url)
    return { problem: `${url} is not written as ${parsed.href}, or holds a space, pipe, bracket or backslash` };
  const host = parsed.hostname;
  if (!domains.some((domain) => host === domain || host.endsWith(`.${domain}`)))
    return { problem: `${host} is not on packages/content/sources.allow.json` };
  return { link: `[${defuseCell(host)}](<${url.replaceAll('\\', '\\\\').replaceAll('&', '&amp;')}>)` };
}

/** GitHub refuses a pull-request body over 65,536 characters; this leaves room for the joiners' bytes. */
const MAX_BODY = 60_000;
const NONE = 'None.';
const list = (lines: string[]) => (lines.length > 0 ? lines.map((line) => `- ${line}`).join('\n') : NONE);
const cells = (values: string[]) => values.map(defuseCell).join(' | ');

/** Each template heading and how the draft fills it; `null` keeps the template's own text. */
type Fill = (d: ReviewDraft, link: (url: string, path: string) => string) => string | undefined;
const FILLS: Record<string, Fill | null> = {
  Changes: (d, link) =>
    d.changes.length === 0
      ? NONE
      : [
          '| Item | Field | Old | New | Quote | Event date | Source | Accessed | Confidence | Substantive | Reason |',
          `|${' --- |'.repeat(11)}`,
          ...d.changes.map(
            (c, i) =>
              `| ${cells([c.item, c.field, c.old, c.new, c.quote, c.eventDate])} | ${link(c.url, `changes[${i}].url`)} | ${cells([c.accessed, c.confidence, c.substantive ? 'yes' : 'no', c.reason])} |`,
          ),
        ].join('\n'),
  'Verified, no change': (d, link) =>
    list(
      d.verified.map(
        (v, i) => `${defuseCell(v.item)}: ${v.urls.map((u, j) => link(u, `verified[${i}].urls[${j}]`)).join(', ')}`,
      ),
    ),
  'Unreachable or moved sources': (d, link) =>
    list(d.unreachable.map((u, i) => `${link(u.url, `unreachable[${i}].url`)}: expected ${defuseCell(u.expected)}`)),
  'Pending changes noticed': (d, link) =>
    list(
      d.pending.map(
        (p, i) =>
          `${defuseCell(p.item)}: ${defuseCell(p.what)}; ${p.status}, effective ${defuseCell(p.effectiveFrom)}; ${link(p.url, `pending[${i}].url`)}`,
      ),
    ),
  'Review queue': (d) => list(d.queue.map((q) => `${defuseCell(q.item)}: ${q.outcome}. ${defuseCell(q.note)}`)),
  'Notes for the owner': (d) => list(d.notes.map(defuseCell)),
  Canary: (d) =>
    d.canary &&
    `File: ${defuseCell(d.canary.path)}. The instructions found in it, none followed:\n\n${list(d.canary.instructions.map(defuseCell))}`,
  'Reviewer checklist (the owner)': null,
  'Run metadata': (d) =>
    list([
      `Model: ${defuseCell(d.model)}`,
      `Countries: ${d.countries.map(defuseCell).join(', ')}`,
      `Date: ${defuseCell(d.date)}`,
    ]),
};

/** The pull-request body: every `## ` heading of the template in order, filled from the draft. */
export function renderBody(
  draft: ReviewDraft,
  template: string,
  domains: readonly string[],
): { body: string; problems: string[] } {
  const problems: string[] = [];
  const link = (url: string, path: string) => {
    const result = sourceLink(url, domains);
    if (result.problem) problems.push(`${path}: ${result.problem}`);
    return result.link ?? defuseCell(url);
  };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of template.split(/^## /m).slice(1)) {
    const end = part.includes('\n') ? part.indexOf('\n') : part.length;
    const heading = part.slice(0, end).trim();
    seen.add(heading);
    const fill = Object.hasOwn(FILLS, heading) ? FILLS[heading] : undefined;
    if (fill === undefined) problems.push(`template: heading "${heading}" is not one body.ts fills or keeps`);
    const content = fill === null ? part.slice(end).trim() : fill?.(draft, link);
    if (content !== undefined) out.push(`## ${heading}\n\n${content}\n`);
  }
  for (const heading of Object.keys(FILLS)) {
    if (!seen.has(heading)) problems.push(`template: heading "${heading}" is missing`);
  }
  const body = out.join('\n');
  if (body.length > MAX_BODY) problems.push(`body: ${body.length} characters, over ${MAX_BODY}`);
  return { body, problems };
}

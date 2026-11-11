// Renders each draft's pull-request body through GitHub's own Markdown renderer (POST /markdown,
// gfm, in the repository's context) and reads the HTML back: no mention, reference or commit link,
// no link but the draft's source URLs, each shown as its host, and every text cell as written. The
// proof that body.ts's defusing holds under GitHub's parse, which no function predicts (docs/
// BUILD-PROMPT.md, Brief lessons). Usage: GH_TOKEN=… GITHUB_REPOSITORY=owner/repo node
// tools/content-review/render-check.ts <draft.json>…
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { allowedDomains, parseDraft, type ReviewDraft, renderBody, sourceLink } from './body.ts';

/** The elements GitHub returned for the fixture drafts and the template (2026-11-11). */
const ELEMENTS = new Set(
  'h2 markdown-accessiblity-table table thead tbody tr th td ul li p br a input code'.split(' '),
);
const LINK_CLASSES = ['user-mention', 'team-mention', 'issue-link', 'commit-link'];
/** As a cell reads once rendered: body.ts's line and character rules, without the joiners. */
const plain = (text: string) =>
  text
    .replace(/\r\n?|[\n\t]/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim();

/** The draft's URLs and its free-text cells, in the template's order. */
function expected(d: ReviewDraft): { urls: string[]; texts: string[] } {
  const texts = [
    ...d.changes.flatMap((c) => [c.item, c.field, c.old, c.new, c.quote, c.reason]),
    ...d.verified.map((v) => v.item),
    ...d.reviewed.flatMap((r) => [r.item, r.reason]),
    ...d.unreachable.map((u) => u.expected),
    ...d.pending.flatMap((p) => [p.item, p.what]),
    ...d.queue.flatMap((q) => [q.item, q.note]),
    ...d.notes,
    ...(d.canary ? [d.canary.path, ...d.canary.instructions] : []),
    d.model,
    ...d.countries,
  ];
  const urls = [
    ...d.changes.map((c) => c.url),
    ...d.verified.flatMap((v) => v.urls),
    ...d.unreachable.map((u) => u.url),
    ...d.pending.map((p) => p.url),
  ];
  return { urls, texts: texts.map(plain).filter((t) => t !== '') };
}

/** What in GitHub's HTML for a draft's body is anything but the draft's text and source links. */
export function htmlProblems(html: string, draft: ReviewDraft, domains: readonly string[]): string[] {
  const problems: string[] = [];
  const body = new JSDOM(html).window.document.body;
  for (const tag of new Set([...body.querySelectorAll('*')].map((e) => e.tagName.toLowerCase()))) {
    if (!ELEMENTS.has(tag)) problems.push(`element <${tag}>`);
  }
  const want = expected(draft);
  const unlinked = [...want.urls];
  for (const a of body.querySelectorAll('a')) {
    const text = plain(a.textContent ?? '');
    const known = LINK_CLASSES.find((name) => a.classList.contains(name));
    if (known) problems.push(`${known} link "${text}"`);
    else if (a.className) problems.push(`link with class "${a.className}"`);
    if (a.classList.contains('anchor')) continue;
    const href = a.getAttribute('href') ?? '';
    const at = unlinked.indexOf(href);
    if (at === -1) problems.push(`href not in the draft: ${href}`);
    else unlinked.splice(at, 1);
    const host = URL.canParse(href) ? new URL(href).hostname : '';
    if (text !== host) problems.push(`link text "${text}" is not its host ${host}`);
    if (!known && at !== -1 && sourceLink(href, domains).problem) problems.push(`href off the allow-list: ${href}`);
  }
  for (const url of new Set(unlinked)) problems.push(`draft URL not linked: ${url}`);
  // Each cell inside one block (a table cell, list item or paragraph), in order, as written.
  const blocks = [...body.querySelectorAll('td, li, p')].map((e) => plain(e.textContent ?? ''));
  let block = 0;
  let offset = 0;
  for (const text of want.texts) {
    let found = -1;
    for (let b = block; b < blocks.length && found === -1; b++) {
      found = (blocks[b] ?? '').indexOf(text, b === block ? offset : 0);
      if (found !== -1) [block, offset] = [b, found + text.length];
    }
    if (found === -1) problems.push(`cell not found as written: "${text.slice(0, 60)}"`);
  }
  return problems;
}

async function render(text: string, repository: string, token: string): Promise<string> {
  const response = await fetch('https://api.github.com/markdown', {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({ text, mode: 'gfm', context: repository }),
  });
  if (!response.ok) throw new Error(`POST /markdown answered ${response.status}`);
  return response.text();
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = new URL('../../', import.meta.url);
  const template = readFileSync(new URL('.github/PULL_REQUEST_TEMPLATE/content-review.md', root), 'utf8');
  const allow: unknown = JSON.parse(readFileSync(new URL('packages/content/sources.allow.json', root), 'utf8'));
  const domains = allowedDomains(allow);
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const token = process.env.GH_TOKEN ?? '';
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || token === '') {
    console.error('render-check: set GH_TOKEN and GITHUB_REPOSITORY (owner/repo).');
    process.exit(2);
  }
  let failed = false;
  for (const path of process.argv.slice(2)) {
    const { draft, problems } = parseDraft(readFileSync(path, 'utf8'));
    if (draft) {
      const rendered = renderBody(draft, template, allow);
      problems.push(...rendered.problems);
      if (rendered.problems.length === 0)
        problems.push(...htmlProblems(await render(rendered.body, repository, token), draft, domains));
    }
    failed ||= problems.length > 0;
    console.log(
      problems.length === 0 ? `${path}: ok, rendered by GitHub as written` : `${path}: ${problems.join('; ')}`,
    );
  }
  process.exit(failed ? 1 : 0);
}

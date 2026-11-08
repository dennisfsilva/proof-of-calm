// The docs lint: a document names only paths, commands and ADRs that exist, says "planned" only with a
// marker, keeps each owned fact in its owner, and an accepted ADR changes only below its corrections
// heading. Dependency-free; the configuration is this top block. ADR bodies get the ADR checks only:
// they are dated history.
//
// Usage: node tools/lint/docs.ts [--warn]   (from the repository root; exits 1 on a finding unless
// --warn or DOCS_LINT=warn, which prints the findings and exits 0)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Check,
  type Finding,
  type Git,
  hasOriginMain,
  lintAdrEdits,
  lintAdrIndex,
  lintAdrReferences,
} from './docs-adr.ts';

export const CONFIG = {
  /** The documents checked in full: the root files, docs/*.md and every .md under .claude. */
  files: ['README.md', 'CLAUDE.md'],
  folders: ['docs'],
  trees: ['.claude'],
  adrFolder: 'docs/ADR',
  planned: /\(planned: M\d\)|<!-- planned: [^>]*-->/,
  /** A session number is not a marker: sessions are renumbered when one is inserted. */
  plannedSession: /\(planned: session \d+\)/,
  plannedMilestone: /\(planned: M(\d)\)/,
  plannedWords: /\b(?:will|soon|planned|TODO)\b/,
  /** A backtick token is a path when it has a slash or one of these extensions. */
  pathLike: /\/|\.(?:tsx?|mjs|cjs|json|ya?ml|md|css)$/,
  placeholder: /[<>*{}$[\]…]|\bNNNN\b|\bYYYY\b|\.\.\./,
  /** Slash-bearing tokens that are not paths: IANA time zones and day/month/year dates. */
  notPaths: /^(?:Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc)\/|^[\d/]+$/,
  /** Folders the path index skips. */
  skipped: [
    'node_modules',
    '.git',
    '.next',
    '.turbo',
    'dist',
    'server-dist',
    'out',
    'storybook-static',
    'coverage',
    'playwright-report',
    'test-results',
    'worktrees',
  ],
  /** pnpm's own subcommands, which are not scripts. */
  pnpmBuiltins: new Set([
    'install',
    'i',
    'add',
    'remove',
    'exec',
    'dlx',
    'create',
    'store',
    'why',
    'outdated',
    'update',
    'up',
    'approve-builds',
    'prune',
    'licenses',
    'publish',
    'list',
    'ls',
    'init',
    'patch',
    'env',
    'setup',
    'self-update',
    'audit',
    'dedupe',
    'link',
    'rebuild',
    'import',
    'fetch',
  ]),
  /** Each literal appears only in its owner and the allowed files (ADR bodies are not scanned). */
  ownedLiterals: [
    { literal: /163,?840/, owner: 'docs/ENGINEERING.md', allowed: ['apps/web/lighthouserc.json', 'docs/ADR/*.md'] },
    { literal: /34 characters/, owner: 'CLAUDE.md', allowed: [] },
    // GROWTH's "100 characters" is the App Store keyword field, another fact with the same number.
    { literal: /100 characters/, owner: 'CLAUDE.md', allowed: ['docs/GROWTH.md'] },
  ],
  /** Path tokens that may be absent, with the reason. */
  allow: {
    'apps/web/.env.local': 'gitignored: the secrets file (CLAUDE.md)',
    'apps/web/dist': 'build output of the web host',
    'apps/web/server-dist': 'the function and worker bundles of the web host, build output',
    'apps/mobile/dist': 'build output of the export host',
    'apps/web/.lighthouseci': 'the Lighthouse reports, written by a run',
    'renovate/weekly-minor-and-patch-updates': 'a Renovate branch name (docs/OWNER-SETUP.md)',
    'renovate/playwright-and-its-container': 'a Renovate branch name (docs/OWNER-SETUP.md)',
  } as Record<string, string>,
} as const;

export type { Check, Finding, Git } from './docs-adr.ts';

const git: Git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const slash = (path: string) => path.split(sep).join('/');
const INLINE_CODE = /`([^`\n]+)`/g;

/** The backtick tokens of one line, with fenced code skipped by the caller. */
export function inlineTokens(line: string): string[] {
  return [...line.matchAll(INLINE_CODE)].map((match) => match[1] ?? '').filter((token) => token !== '');
}

type Repo = {
  root: string;
  paths: Set<string>; // every repository path and each of its segment-boundary suffixes
  scripts: Record<string, Set<string>>; // package name (and "" for the root) → script names
  specifiers: Set<string>; // every dependency and workspace package name
  workflows: Set<string>;
  adrs: Map<string, string>; // "0001" → file path
  doneMilestones: Set<string>; // "M0"
};

function packageJsons(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string, depth: number) => {
    for (const entry of readdirSync(directory)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        if (depth < 2) walk(path, depth + 1);
      } else if (entry === 'package.json') found.push(path);
    }
  };
  walk(root, 0);
  return found;
}

/** Every path under the root with its suffixes: `a/b/c.ts` adds `a/b/c.ts`, `b/c.ts` and `c.ts`. */
export function pathIndex(root: string): Set<string> {
  const index = new Set<string>();
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      if ((CONFIG.skipped as readonly string[]).includes(entry)) continue;
      const path = join(directory, entry);
      const segments = slash(relative(root, path)).split('/');
      for (let i = 0; i < segments.length; i += 1) index.add(segments.slice(i).join('/'));
      if (statSync(path).isDirectory()) walk(path);
    }
  };
  walk(root);
  return index;
}

function readRepo(root: string): Repo {
  const scripts: Record<string, Set<string>> = {};
  const specifiers = new Set<string>();
  for (const file of packageJsons(root)) {
    const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, string> | string>;
    const name = dirname(file) === root ? '' : typeof json.name === 'string' ? json.name : '';
    scripts[name] = new Set(Object.keys(typeof json.scripts === 'object' ? json.scripts : {}));
    if (name !== '') specifiers.add(name);
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const deps = json[field];
      if (typeof deps === 'object') for (const dep of Object.keys(deps)) specifiers.add(dep);
    }
  }
  const catalog = join(root, 'pnpm-workspace.yaml');
  if (existsSync(catalog)) {
    for (const match of readFileSync(catalog, 'utf8').matchAll(/^ {2}['"]?(@?[\w./-]+)['"]?:/gm))
      specifiers.add(match[1] ?? '');
  }
  const workflowsDir = join(root, '.github', 'workflows');
  const workflows = new Set(existsSync(workflowsDir) ? readdirSync(workflowsDir) : []);
  const adrs = new Map<string, string>();
  const adrDir = join(root, CONFIG.adrFolder);
  for (const entry of existsSync(adrDir) ? readdirSync(adrDir) : []) {
    const match = /^(\d{4})-.*\.md$/.exec(entry);
    if (match?.[1]) adrs.set(match[1], `${CONFIG.adrFolder}/${entry}`);
  }
  return { root, paths: pathIndex(root), scripts, specifiers, workflows, adrs, doneMilestones: doneMilestones(root) };
}

/** The README's and ROADMAP's status lines name the milestone in progress; the ones before it are done. */
function doneMilestones(root: string): Set<string> {
  const done = new Set<string>();
  for (const file of ['README.md', 'docs/ROADMAP.md']) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^Status\b.*\bM(\d) in progress/.exec(line);
      if (match?.[1]) for (let k = 0; k < Number(match[1]); k += 1) done.add(`M${k}`);
    }
  }
  return done;
}

function docsToLint(root: string): { file: string; adr: boolean }[] {
  const docs: { file: string; adr: boolean }[] = [];
  for (const file of CONFIG.files) if (existsSync(join(root, file))) docs.push({ file, adr: false });
  for (const folder of CONFIG.folders) {
    const dir = join(root, folder);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir))
      if (entry.endsWith('.md')) docs.push({ file: `${folder}/${entry}`, adr: false });
  }
  const adrDir = join(root, CONFIG.adrFolder);
  for (const entry of existsSync(adrDir) ? readdirSync(adrDir) : []) {
    if (/^\d{4}-.*\.md$/.test(entry)) docs.push({ file: `${CONFIG.adrFolder}/${entry}`, adr: true });
  }
  const walk = (dir: string) => {
    for (const entry of existsSync(dir) ? readdirSync(dir) : []) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== 'worktrees') walk(path);
      } else if (entry.endsWith('.md')) docs.push({ file: slash(relative(root, path)), adr: false });
    }
  };
  for (const tree of CONFIG.trees) walk(join(root, tree));
  return docs;
}

/** The lines of a document outside fenced code, numbered from 1. */
export function proseLines(text: string): { line: number; content: string }[] {
  let fenced = false;
  const lines: { line: number; content: string }[] = [];
  text.split(/\r?\n/).forEach((content, index) => {
    if (/^\s*(```|~~~)/.test(content)) {
      fenced = !fenced;
      return;
    }
    if (!fenced) lines.push({ line: index + 1, content });
  });
  return lines;
}

const specifierOf = (token: string) =>
  token
    .split('/')
    .slice(0, token.startsWith('@') ? 2 : 1)
    .join('/');

/** Whether a backtick token is a path the lint must resolve; URLs, refs, routes, specifiers and placeholders are not. */
export function isPathToken(token: string, repo: Pick<Repo, 'specifiers'>): boolean {
  if (!CONFIG.pathLike.test(token) || CONFIG.notPaths.test(token)) return false;
  if (/\s/.test(token) || /^[-/~@]/.test(token) || /[*?]/.test(token)) return false; // a glob is a pattern
  if (/:\/\/|^www\./.test(token) || /\.\.|^(?:origin|refs)\/|^HEAD\b/.test(token)) return false;
  if (CONFIG.placeholder.test(token) || repo.specifiers.has(specifierOf(token))) return false;
  return !(token in CONFIG.allow);
}

/**
 * A path token resolves when it names a repository path from the root, from the document's folder, with
 * `src/` after `packages/<name>/` or `apps/<name>/`, or from any folder (tree listings name their
 * package's files relatively): the index holds every path with its segment-boundary suffixes.
 */
export function resolvesPath(token: string, paths: Set<string>): boolean {
  const path = token.replace(/\/$/, '');
  return paths.has(path) || paths.has(path.replace(/^((?:packages|apps)\/[^/]+\/)(?!src\/)/, '$1src/'));
}

/** The problem with a command token, or null: not a command, one with a `<placeholder>`, or one that resolves. */
export function commandProblem(token: string, repo: Pick<Repo, 'scripts' | 'workflows' | 'root'>): string | null {
  if (/<[^>]*>/.test(token)) return null;
  const filtered = /^pnpm --filter[= ](\S+) (?:run )?([a-z][\w:.-]*)/.exec(token);
  if (filtered) {
    const [, pkg = '', script = ''] = filtered;
    if (CONFIG.pnpmBuiltins.has(script)) return null;
    const scripts = repo.scripts[pkg];
    if (!scripts) return `no workspace package is named ${pkg}`;
    return scripts.has(script) ? null : `${pkg} has no script "${script}"`;
  }
  const plain = /^pnpm (?:run )?([a-z][\w:.-]*)/.exec(token);
  if (plain) {
    const script = plain[1] ?? '';
    if (CONFIG.pnpmBuiltins.has(script)) return null;
    return repo.scripts['']?.has(script) ? null : `the root package.json has no script "${script}"`;
  }
  const node = /^node (tools\/\S+)/.exec(token);
  if (node) return existsSync(join(repo.root, node[1] ?? '')) ? null : `${node[1]} does not exist`;
  const workflow = /^gh workflow run (\S+)/.exec(token);
  if (workflow) return repo.workflows.has(workflow[1] ?? '') ? null : `.github/workflows/${workflow[1]} does not exist`;
  return null;
}

const isCommandToken = (token: string) => /^(?:pnpm |node tools\/|gh workflow run )/.test(token);

function lintDocument(doc: string, text: string, repo: Repo, findings: Finding[]): void {
  for (const { line, content } of proseLines(text)) {
    const tokens = inlineTokens(content);
    const marker = CONFIG.planned.exec(content);
    const milestone = CONFIG.plannedMilestone.exec(content)?.[1];
    const open = marker !== null && (milestone === undefined || !repo.doneMilestones.has(`M${milestone}`));
    let pathOrCommand = false;
    for (const token of tokens) {
      if (isPathToken(token, repo)) {
        pathOrCommand = true;
        if (resolvesPath(token, repo.paths)) continue;
        if (open) continue;
        const why = marker ? ` and its planned milestone M${milestone} is done` : '';
        findings.push({ file: doc, line, check: 'path', message: `\`${token}\` does not exist${why}` });
      } else if (isCommandToken(token)) {
        pathOrCommand = true;
        const problem = commandProblem(token, repo);
        if (problem) findings.push({ file: doc, line, check: 'command', message: `\`${token}\`: ${problem}` });
      }
    }
    if (CONFIG.plannedSession.test(content)) {
      findings.push({
        file: doc,
        line,
        check: 'planned',
        message: 'name the milestone: (planned: M<n>); session numbers change when sessions are inserted',
      });
    }
    // Quoted copy and code spans may say "will" without planning anything.
    const outsideQuotes = content.replace(/"[^"]*"|“[^”]*”|`[^`]*`/g, '');
    const unmarked = marker === null && !CONFIG.plannedSession.test(content);
    if (pathOrCommand && unmarked && CONFIG.plannedWords.test(outsideQuotes)) {
      findings.push({
        file: doc,
        line,
        check: 'planned',
        message: 'a planned word next to a path or command needs a (planned: M<n>) marker',
      });
    }
    for (const owned of CONFIG.ownedLiterals) {
      const allowed = owned.allowed.some((glob) =>
        new RegExp(`^${glob.replaceAll('.', '\\.').replaceAll('*', '[^/]+')}$`).test(doc),
      );
      if (doc !== owned.owner && !allowed && owned.literal.test(content)) {
        findings.push({
          file: doc,
          line,
          check: 'literal',
          message: `${owned.literal.source.replaceAll('\\', '')} is owned by ${owned.owner}: point there instead`,
        });
      }
    }
  }
}

/** docs/README.md's table names every document beside it. */
function lintDocsIndex(root: string, findings: Finding[]): void {
  const index = 'docs/README.md';
  const path = join(root, index);
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const entry of readdirSync(join(root, 'docs'))) {
    if (entry.endsWith('.md') && entry !== 'README.md' && !text.includes(`\`${entry}\``)) {
      findings.push({ file: index, line: 1, check: 'index', message: `the table does not name \`${entry}\`` });
    }
  }
}

export function lintDocs(root: string, run: Git = git): Finding[] {
  const repo = readRepo(root);
  const findings: Finding[] = [];
  const compareAdrs = hasOriginMain(run);
  const adrs = { folder: CONFIG.adrFolder, files: repo.adrs };
  for (const { file, adr } of docsToLint(root)) {
    const text = readFileSync(join(root, file), 'utf8');
    lintAdrReferences(file, text, adrs, findings);
    if (adr) {
      if (compareAdrs) lintAdrEdits(file, text, run, findings);
    } else lintDocument(file, text, repo, findings);
  }
  lintAdrIndex(root, adrs, findings);
  lintDocsIndex(root, findings);
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** `N finding(s): path 3, command 1, ...` */
export function summary(findings: Finding[]): string {
  const counts = new Map<Check, number>();
  for (const finding of findings) counts.set(finding.check, (counts.get(finding.check) ?? 0) + 1);
  const parts = [...counts].map(([check, count]) => `${check} ${count}`).join(', ');
  return `${findings.length} docs finding(s)${parts ? `: ${parts}` : ''}`;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const warn = process.argv.includes('--warn') || process.env.DOCS_LINT === 'warn';
  const findings = lintDocs(process.cwd());
  for (const finding of findings)
    console.error(`${finding.file}:${finding.line}: ${finding.check}: ${finding.message}`);
  if (findings.length > 0) {
    console.error(`\n${summary(findings)}${warn ? ' (warn mode: not failing)' : ''}`);
    process.exit(warn ? 0 : 1);
  }
  console.log('Docs lint: every path, command and ADR resolves.');
}

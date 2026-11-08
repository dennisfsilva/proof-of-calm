import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const workflowText = (workflow: string) => {
  const file = new URL(`../../.github/workflows/${workflow}`, import.meta.url);
  return readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
};

const jobOf = (workflow: string, name: string) => {
  const job = new RegExp(`^ {2}${name}:\\n([\\s\\S]*?)(?=^ {2}\\S|(?![\\s\\S]))`, 'm').exec(
    workflowText(workflow),
  )?.[1];
  if (job === undefined) throw new Error(`${workflow} has no ${name} job`);
  return job;
};

// ci.yml's lighthouse job measures main on push, lighthouse-branch.yml's measures a branch by hand before
// its merge: a branch's run proves what main's will do only while the two run the same steps.
const lighthouseSteps = (workflow: string) => {
  const job = jobOf(workflow, 'lighthouse');
  const start = job.indexOf('\n    steps:\n');
  if (start === -1) throw new Error(`${workflow}'s lighthouse job has no steps`);
  return job.slice(start).trimEnd();
};

describe('the lighthouse job', () => {
  it('runs the same steps in ci.yml and lighthouse-branch.yml', () => {
    const steps = lighthouseSteps('ci.yml');
    expect(steps).toContain('pnpm --filter @proofofcalm/web lighthouse');
    expect(lighthouseSteps('lighthouse-branch.yml')).toBe(steps);
  });
});

// The resolve job's script, run as the runner runs it (bash), with `gh` replaced by a function that
// answers the two calls the script makes. Git for Windows carries the bash of a Windows machine.
const resolve = jobOf('lighthouse-vercel.yml', 'resolve');
const script = (() => {
  const body = /^ {8}run: \|\n((?: {10}.*\n|\n)+)/m.exec(resolve)?.[1];
  if (body === undefined) throw new Error("lighthouse-vercel.yml's resolve job has no run script");
  return body.replaceAll(/^ {10}/gm, '');
})();
const bash =
  process.platform === 'win32'
    ? join(
        dirname(dirname(dirname(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim()))),
        'bin',
        'bash.exe',
      )
    : 'bash';
const scratch = mkdtempSync(join(tmpdir(), 'resolve-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const SHA = 'a'.repeat(40);
const REPOSITORY = 'owner/proof-of-calm';
const BRANCH_URL = 'https://proof-of-calm-git-ci-test-data-and-preview-guards-incubating.vercel.app';
const HASH_URL = 'https://proof-of-calm-k3x9q2m7a-incubating.vercel.app';
// Hosts of another Vercel team whose slug ends in -incubating, with a project named proof-of-calm: team
// evil-incubating's main and team other-incubating's x.
const FOREIGN_URLS = [
  'https://proof-of-calm-git-main-evil-incubating.vercel.app',
  'https://proof-of-calm-git-x-other-incubating.vercel.app',
];
let runs = 0;

// `heads` answers branches-where-head for SHA, the script's one call.
const run = (event: Record<string, string>, heads: string[] = []) => {
  runs += 1;
  const output = join(scratch, `output-${runs}`).replaceAll('\\', '/');
  const names = heads.map((name) => `'${name}'`).join(' ');
  const gh = [
    'gh() {',
    '  case "$*" in',
    `    "api repos/${REPOSITORY}/commits/${SHA}/branches-where-head --jq .[].name") printf '%s\\n' ${names} ;;`,
    '    *) return 1 ;;',
    '  esac',
    '}',
    '',
  ].join('\n');
  // GitHub's bash for a run step: bash --noprofile --norc -eo pipefail {0}.
  const result = spawnSync(bash, ['--noprofile', '--norc', '-eo', 'pipefail', '-c', gh + script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...event,
      PRODUCTION_ORIGIN: 'https://proofofcalm.com',
      GITHUB_REPOSITORY: REPOSITORY,
      GITHUB_OUTPUT: output,
    },
  });
  let written = '';
  try {
    written = readFileSync(output, 'utf8');
  } catch {}
  return { status: result.status, lines: result.stdout.trim().split('\n'), written };
};

const dispatch = (url: string, checks: boolean, heads: string[] = []) =>
  run({ EVENT: 'workflow_dispatch', INPUT_URL: url, INPUT_SHA: SHA, INPUT_CHECKS: String(checks) }, heads);

describe("lighthouse-vercel.yml's resolve job", () => {
  it('has exactly contents: read', () => {
    const permissions = /^ {4}permissions:(.*)\n((?: {6}.*\n)*)/m.exec(resolve);
    expect(permissions?.[1]).toBe('');
    expect(permissions?.[2]?.trim()).toBe('contents: read');
  });

  it.each([
    ['the production origin', 'https://proofofcalm.com', ['main']],
    ["a deployment's own URL", HASH_URL, ['ci/test-data-and-preview-guards']],
    ["main's branch URL", 'https://proof-of-calm-git-main-incubating.vercel.app', ['main']],
    ['a branch URL whose branch does not have the SHA at its head', BRANCH_URL, ['main', 'ci/test-data-guard']],
  ])('refuses checks against %s in one line, before any output', (_, url, heads) => {
    const result = dispatch(url, true, heads);
    expect(result.status).toBe(1);
    expect(result.lines).toHaveLength(1);
    expect(result.written).toBe('');
  });

  it('passes checks against the branch URL of a branch with the SHA at its head', () => {
    const result = dispatch(BRANCH_URL, true, ['main', 'ci/test-data-and-preview-guards']);
    expect(result.status).toBe(0);
    expect(result.written).toContain(`url=${BRANCH_URL}\n`);
  });

  it("measures a deployment's own URL without checks", () => {
    expect(dispatch(HASH_URL, false).written).toContain(`url=${HASH_URL}\n`);
  });

  it("refuses another team's host", () => {
    expect(dispatch('https://proof-of-calm-k3x9q2m7a-other-incubating.vercel.app', false).status).toBe(1);
  });

  // A branch slug and a team slug both take hyphens, so no pattern tells them apart: a branch URL is
  // this repository's only as the URL of one of its branches with the SHA at its head.
  it.each(FOREIGN_URLS)("refuses another team's branch URL %s on a dispatch, in one line", (url) => {
    const result = dispatch(url, false, ['main']);
    expect(result.status).toBe(1);
    expect(result.lines).toHaveLength(1);
    expect(result.written).toBe('');
  });

  it('measures the branch URL of a branch with the SHA at its head on a dispatch', () => {
    const result = dispatch(BRANCH_URL, false, ['ci/test-data-and-preview-guards']);
    expect(result.written).toContain(`url=${BRANCH_URL}\n`);
    expect(result.written).toContain('target=requested\n');
  });

  it('refuses a dispatch at the branch URL of a branch whose head is another SHA', () => {
    const result = dispatch(BRANCH_URL, false, ['main']);
    expect(result.status).toBe(1);
    expect(result.lines).toHaveLength(1);
    expect(result.written).toBe('');
  });
});

// A run starts by itself for production only (ADR-0024, deviation of 2026-11-05): GitHub runs a status
// workflow from main with GITHUB_SHA at main's head, so Vercel's status on that commit is production's
// deployment; a preview's status skips the run before a runner starts, and a preview comes by dispatch.
const PRODUCTION = `url=https://proofofcalm.com\nsha=${SHA}\ntarget=production\n`;

describe("lighthouse-vercel.yml's automatic runs", () => {
  it('start for production only', () => {
    const condition = /^ {4}if: >-\n((?: {6}.*\n)+)/m.exec(resolve)?.[1] ?? '';
    expect(condition.replaceAll(/\s+/g, ' ').trim()).toBe(
      [
        "github.event_name == 'workflow_dispatch' ||",
        "(github.event_name == 'status' && github.event.context == 'Vercel' && github.event.state == 'success'",
        '&& github.event.sha == github.sha) ||',
        "(github.event_name == 'repository_dispatch' && github.event.client_payload.environment == 'production')",
      ].join(' '),
    );
  });

  it("measure the production origin for Vercel's status on main's head", () => {
    expect(run({ EVENT: 'status', STATUS_SHA: SHA, GITHUB_SHA: SHA }).written).toBe(PRODUCTION);
  });

  it("measure nothing for Vercel's status on another commit, in one line", () => {
    const result = run({ EVENT: 'status', STATUS_SHA: SHA, GITHUB_SHA: 'b'.repeat(40) });
    expect(result.status).toBe(0);
    expect(result.lines).toEqual([expect.stringContaining("not main's head")]);
    expect(result.written).toBe('');
  });

  it("measure the production origin for Vercel's event for production", () => {
    const result = run({ EVENT: 'repository_dispatch', PAYLOAD_SHA: SHA, PAYLOAD_ENVIRONMENT: 'production' });
    expect(result.written).toBe(PRODUCTION);
  });

  it("measure nothing for Vercel's event for a preview, in one line", () => {
    const result = run({ EVENT: 'repository_dispatch', PAYLOAD_SHA: SHA, PAYLOAD_ENVIRONMENT: 'preview' });
    expect(result.status).toBe(0);
    expect(result.lines).toEqual([expect.stringContaining('measured by hand')]);
    expect(result.written).toBe('');
  });
});

describe("osv-scanner.yml's pull_request filter", () => {
  it('lists the scanner configuration', () => {
    const paths = /^ {2}pull_request:\n {4}paths: \[(.*)\]$/m.exec(workflowText('osv-scanner.yml'))?.[1];
    expect(paths?.split(',').map((path) => path.trim())).toContain('osv-scanner.toml');
  });
});

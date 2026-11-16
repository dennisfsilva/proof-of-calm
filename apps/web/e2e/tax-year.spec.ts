import { readFile } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import {
  FIXTURE_DATES,
  type FixturePhase,
  fixtureNowMs,
  fixtureSnapshot,
} from '@proofofcalm/app/lib/services/fixtures';
import type { Plan } from '@proofofcalm/core';
import france from '../../../packages/content/jurisdictions/fr.json' with { type: 'json' };
import britain from '../../../packages/content/jurisdictions/gb.json' with { type: 'json' };
import netherlands from '../../../packages/content/jurisdictions/nl.json' with { type: 'json' };
import portugal from '../../../packages/content/jurisdictions/pt.json' with { type: 'json' };
import { seedPlan } from './seed';
import { cspViolations, recordCspViolations, test } from './support';

// The tax-year export under Settings → Currency & data → Your data on the viewport matrix (docs/DOMAIN.md §3.13):
// the fixture plan under Portugal (FIFO per venue, the 365-day rule) downloads the running year's per-lot file,
// under the United Kingdom (a pooled lot rule) the running 2026 to 2027 year's raw listing, under France (the
// portfolio-wide model) the cessions file and under the Netherlands (the snapshot model) the snapshot file, each
// a UTF-8 byte order mark, then the file in packages/app/src/features/settings/fixtures: its rows and the app's own
// header words byte for byte, and what a profile fills (the country's name, the review line, the lot note, the
// holding rule's length, the conditions) built from the profile file the app loads, which a content review may
// change (docs/ENGINEERING.md §2), through no code the spec tests: the spec reads the JSON and quotes each cell
// itself. Portugal's plan holds the profile's holding rule, as a change of country would derive it. The local run
// sends no UK geolocation, so ADR-0029's 451 route does not apply. The Tax year select opens with no CSP violation,
// and on the sell clock the latest ended year is chosen and downloads.

test.use({ serviceWorkers: 'block' });

const fixture = fixtureSnapshot();
const plan = fixture.plan as Plan;

async function openData(page: Page, patch: Partial<Plan>, phase: FixturePhase = 'buy') {
  await page.clock.setFixedTime(new Date(fixtureNowMs(phase)));
  await seedPlan(page, { ...fixture, plan: { ...plan, ...patch } });
  await page.goto('/settings');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('tab', { name: 'Currency & data' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Your data' })).toBeVisible();
}

const yearSelect = (page: Page) => page.getByRole('combobox', { name: 'Tax year' });

/**
 * Exports the year the select shows and returns the file's suggested name and its text after the UTF-8 byte order
 * mark the saved bytes open with (docs/DOMAIN.md §3.13).
 */
async function exportYear(page: Page) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export tax-year CSV' }).click();
  const file = await event;
  const bytes = await readFile(await file.path());
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  return { name: file.suggestedFilename(), text: bytes.subarray(3).toString('utf8') };
}

/** The fields of a profile file the header reads, as the JSON holds them. */
type ProfileFile = {
  readonly name: string;
  readonly status: { readonly lastReviewed: string };
  readonly lotRuleNote: string;
  readonly holdingRule: { readonly kind: string; readonly days?: number; readonly years?: number };
  readonly holdingRuleConditions: readonly string[];
  readonly sources: readonly { readonly key: string; readonly url: string }[];
  readonly ruleSources: { readonly lotRule: string; readonly holdingRule: string };
};
const PROFILES: Record<'PT' | 'GB' | 'FR' | 'NL', ProfileFile> = {
  PT: portugal,
  GB: britain,
  FR: france,
  NL: netherlands,
};
type Code = keyof typeof PROFILES;

/**
 * One cell as docs/DOMAIN.md §3.13 states the file's quoting: a `'` before the text and before every piece of it
 * after a `;` or a line break that starts with `=`, `+`, `-`, `@`, a tab or a CR, then quoted per RFC 4180 when it
 * holds a double quote, a comma or a line break.
 */
function cell(text: string): string {
  let safe = '';
  for (let at = 0; at < text.length; at += 1) {
    const opensPiece = at === 0 || ';\r\n'.includes(text.charAt(at - 1));
    if (opensPiece && '=+-@\t\r'.includes(text.charAt(at))) safe += "'";
    safe += text.charAt(at);
  }
  return /[",\r\n]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** The text of a cell of the app's own words, which start with no trigger: its RFC 4180 quotes taken off. */
const unquoted = (line: string) => (line.startsWith('"') ? line.slice(1, -1).replaceAll('""', '"') : line);

/** The holding rule's length as the header words it: `365 days`, `1 year`. */
function ruleLength(rule: ProfileFile['holdingRule']): string {
  const count = rule.kind === 'years' ? rule.years : rule.days;
  return `${count} ${rule.kind === 'years' ? 'year' : 'day'}${count === 1 ? '' : 's'}`;
}

/** The URL of the source a rule names, from the profile's own list. */
const sourceOf = (profile: ProfileFile, rule: 'lotRule' | 'holdingRule') =>
  profile.sources.find((source) => source.key === profile.ruleSources[rule])?.url;

/** Where each expected file holds the lines its literal profile filled: the lot note, the holding line, the conditions. */
const PROFILE_LINES: Record<Code, { lotNote?: number; holding?: number; conditions?: readonly [number, number] }> = {
  PT: { lotNote: 5, holding: 6, conditions: [7, 11] },
  GB: { lotNote: 5 },
  FR: {},
  NL: {},
};

/**
 * The expected file of `code` with what its profile fills built from the profile file: the name in the title, the
 * review line (the sources as the app lists them, the lot rule's first, without repeats), the lot note, the holding
 * rule's name and length, and the conditions; the app's words and the rows stay as written.
 */
async function expected(code: Code, name: string) {
  const file = await readFile(
    new URL(`../../../packages/app/src/features/settings/fixtures/${name}`, import.meta.url),
    'utf8',
  );
  const profile = PROFILES[code];
  const sources = [...new Set([sourceOf(profile, 'lotRule'), sourceOf(profile, 'holdingRule')])];
  const { lotNote, holding, conditions } = PROFILE_LINES[code];
  const split = file.indexOf('\n\n');
  const header = file.slice(0, split).split('\n');
  const title = unquoted(header[0] ?? '').split(' · ');
  title[1] = profile.name;
  header[0] = cell(title.join(' · '));
  header[3] = cell(
    `${profile.name} rules reviewed on ${profile.status.lastReviewed} · general information, not advice · Sources: ${sources.join(', ')}`,
  );
  if (lotNote !== undefined) header[lotNote] = cell(profile.lotRuleNote);
  if (holding !== undefined) {
    header[holding] = cell(
      unquoted(header[holding] ?? '').replace(
        /^eligible_from: the first day past the .+? holding rule \(\d+ (?:day|year)s?\)\./u,
        `eligible_from: the first day past the ${profile.name} holding rule (${ruleLength(profile.holdingRule)}).`,
      ),
    );
  }
  if (conditions !== undefined) {
    header.splice(conditions[0], conditions[1] - conditions[0], ...profile.holdingRuleConditions.map(cell));
  }
  return header.join('\n') + file.slice(split);
}

// A native select once broke WebKit's hashed CSP on this screen, so the Tax year select opens under the recorder.
test('the Tax year select opens with no CSP violation', async ({ page }) => {
  await page.addInitScript(recordCspViolations);
  await openData(page, {});
  await yearSelect(page).click();
  await expect(page.getByRole('option', { name: '2026 (still running)' })).toBeVisible();
  expect(await page.evaluate(cspViolations)).toEqual([]);
});

// On the sell clock the plan spans 2026 to the running 2030: the latest ended year is chosen on opening.
test('at 2030-03-15 the latest ended year, 2029, is chosen and its file downloads', async ({ page }) => {
  await openData(page, {}, 'sell');
  await expect(yearSelect(page)).toHaveText(/^2029\b/u);
  const file = await exportYear(page);
  expect(file.name).toBe(`proof-of-calm-tax-year-2029-PT-${FIXTURE_DATES.sell}.csv`);
  expect(file.text.split('\n')[0]).toBe(`Proof of Calm tax-year file · ${portugal.name} · 2029-01-01 to 2029-12-31`);
});

test('the PT fixture downloads the expected CSV', async ({ page }) => {
  // The plan keeps the profile's rule, so a review that changes it adds no line for a plan rule of its own.
  await openData(page, { holdingRule: portugal.holdingRule as Plan['holdingRule'] });
  await expect(yearSelect(page)).toContainText('2026 (still running)');
  await yearSelect(page).click();
  await page.getByRole('option', { name: '2026 (still running)' }).click();
  const file = await exportYear(page);
  expect(file.name).toBe(`proof-of-calm-tax-year-2026-PT-${FIXTURE_DATES.buy}.csv`);
  expect(file.text).toBe(await expected('PT', 'tax-year-2026-PT.csv'));
});

test('the GB fixture downloads the expected CSV', async ({ page }) => {
  await openData(page, {
    country: 'GB' as Plan['country'],
    payCurrency: 'GBP',
    displayCurrency: 'GBP',
    holdingRule: { kind: 'none' },
  });
  await yearSelect(page).click();
  await expect(page.getByRole('option')).toHaveText(['2026 to 2027 (still running)', '2025 to 2026']);
  await page.getByRole('option', { name: '2026 to 2027 (still running)' }).click();
  const file = await exportYear(page);
  expect(file.name).toBe(`proof-of-calm-tax-year-2026-27-GB-${FIXTURE_DATES.buy}.csv`);
  expect(file.text).toBe(await expected('GB', 'tax-year-2026-27-GB.csv'));
});

for (const country of ['FR', 'NL'] as const) {
  test(`the ${country} fixture downloads the expected CSV`, async ({ page }) => {
    await openData(page, { country: country as Plan['country'] });
    await yearSelect(page).click();
    await page.getByRole('option', { name: '2026 (still running)' }).click();
    const file = await exportYear(page);
    expect(file.name).toBe(`proof-of-calm-tax-year-2026-${country}-${FIXTURE_DATES.buy}.csv`);
    expect(file.text).toBe(await expected(country, `tax-year-2026-${country}.csv`));
  });
}

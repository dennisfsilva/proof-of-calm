// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import type { CalendarDate, CoinId, Entry, Instant, Pause, Percent, Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import type { PricesState, Snapshot } from '../../../lib/ports';
import { type RedDayModel, type RedDayPort, ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import {
  clearRedDay,
  createTestServices,
  episodeRedDay,
  FIXTURE_PRICES,
  fixedPriceSource,
  pricesAt,
  recordingPlatform,
  type TestServicesOptions,
} from '../../../lib/services/testing';
import shell from '../../../messages/en/shell.json';
import today from '../../../messages/en/today.json';
import { TodayScreen } from './today-screen';

// Today over the fixture plan (docs/DOMAIN.md §3.3 to §3.5, §3.10, §3.11): the primary action with its
// coin chips, the pending list, the portfolio number, the strip and at most one banner; and the pair
// of links before a plan exists. The plan is Portugal's, so the amounts are formatted in pt-PT.

afterEach(cleanup);
// jsdom has no `scrollIntoView`: a foot banner's Dismiss brings the card's heading into view with it.
Element.prototype.scrollIntoView = vi.fn();

const portugal = async () => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};

const at = (date: string) => Date.parse(`${date}T10:00:00Z`);
const entityId = '00000000-0000-4000-8000-000000003000';

/**
 * `priced` refreshes the fixture prices, or the given ones, once the services start; `redDay` answers the foot's
 * question (no episode by default), which settles inside the render's act.
 */
async function mount(
  snapshot: Snapshot,
  nowMs: number,
  priced: boolean | PricesState = false,
  { redDay = clearRedDay(), ...extra }: TestServicesOptions & { readonly redDay?: RedDayPort } = {},
) {
  const created = createTestServices({
    snapshot,
    nowMs,
    rules: portugal,
    ...(priced === false ? {} : { priceSource: fixedPriceSource(priced === true ? FIXTURE_PRICES : priced, nowMs) }),
    ...extra,
  });
  const services = { ...created, redDay };
  await act(() => services.start());
  if (priced !== false) await act(() => services.prices.refresh());
  const tree = (
    <NavigationProvider location="memory" initialPath="/today">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ shell, today }}>
          <TodayScreen />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>
  );
  const view = await act(async () => render(tree));
  /** Leaves Today and comes back: a new visit. */
  const remount = async () => {
    await act(async () => view.rerender(<div />));
    await act(async () => view.rerender(tree));
  };
  return { services, remount };
}

const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
const reviewedOn = (snapshot: Snapshot, day: string): Snapshot => ({
  ...snapshot,
  prefs: { ...snapshot.prefs, reviewedAt: `${day}T10:00:00Z` as Instant },
});

describe('TodayScreen', () => {
  it('without a plan: one "No plan yet" and the two links, never a repeated "No … yet"', async () => {
    await mount(EMPTY_SNAPSHOT, at('2026-10-20'));
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeDefined();
    expect(screen.getAllByText(/^No .* yet/)).toHaveLength(1);
    expect(href('Set up a plan')).toBe('/onboarding');
    expect(href('import a file')).toBe('/settings');
    expect(screen.queryByText('Record a purchase')).toBeNull();
  });

  it('on a buy day: one chip per coin, summing to the monthly amount, and the one tap', async () => {
    await mount(fixtureSnapshot(), at('2026-10-05'));
    expect(screen.getByRole('heading', { level: 2, name: 'Today is the October\u00a02026 buy day' })).toBeDefined();
    const chips = [...document.querySelectorAll('[data-slot="coin-chip"]')].map((chip) =>
      chip.textContent?.replace(/\s/gu, ' '),
    );
    expect(chips).toEqual(['BTC70,00 €', 'ETH30,00 €']);
    expect(screen.getByRole('button', { name: 'Bought as planned' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Also open' })).toBeNull();
  });

  it('a late month leads and the current month goes to the pending list', async () => {
    const snapshot = fixtureSnapshot();
    const entries = snapshot.entries.filter((entry) => entry.slot !== '2026-09');
    await mount({ ...snapshot, entries }, at('2026-10-05'));
    expect(screen.getByRole('heading', { level: 2, name: 'September\u00a02026 is still open' })).toBeDefined();
    expect(screen.getByText(/^Buy day was 5 Sept 2026, 30 days ago\. Record it or skip the month\.$/)).toBeDefined();
    const pending = screen.getByRole('list', { name: 'Also open' });
    expect(
      within(pending)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['October\u00a02026: due 5\u00a0Oct\u00a02026']);
  });

  it('a month paused by a pause that has ended reads as a handled month, never as the hold', async () => {
    const snapshot = fixtureSnapshot();
    const pause = { id: entityId, from: '2026-10-01', until: '2026-10-10', note: '' } as Pause;
    await mount({ ...snapshot, plan: { ...snapshot.plan, pauses: [pause] } } as Snapshot, at('2026-10-20'));
    expect(screen.getByRole('heading', { level: 2, name: 'October\u00a02026 is paused' })).toBeDefined();
    expect(screen.getByText('Next buy day: 5 Nov 2026.')).toBeDefined();
    expect(href('Record a purchase')).toBe('/log');
    expect(screen.queryByText(/hold phase|sell window opens/u)).toBeNull();
  });

  it('before the first buy day, every buy day paused: the paused month, never the hold', async () => {
    const snapshot = fixtureSnapshot();
    const pause = { id: entityId, from: '2026-10-01', until: null, note: '' } as Pause;
    const plan = { ...snapshot.plan, firstBuy: '2026-11-05', pauses: [pause] };
    await mount({ ...snapshot, plan } as Snapshot, at('2026-10-20'));
    expect(screen.getByRole('heading', { level: 2, name: 'November\u00a02026 is paused' })).toBeDefined();
    expect(screen.queryByText(/^Next buy day/u)).toBeNull();
    expect(screen.queryByText(/hold phase|sell window opens/u)).toBeNull();
  });

  it('only a starting amount, logged: no buy day left, never a past "Next buy day"', async () => {
    const snapshot = fixtureSnapshot();
    const plan = { ...snapshot.plan, monthlyAmount: '0' as Plan['monthlyAmount'] };
    const entries = snapshot.entries.filter((entry) => entry.kind === 'lump');
    await mount({ ...snapshot, plan, entries } as Snapshot, at('2026-10-20'));
    expect(screen.getByRole('heading', { level: 2, name: 'No buy days left' })).toBeDefined();
    expect(screen.queryByText(/Next buy day/u)).toBeNull();
    expect(screen.queryByText('Record a purchase')).toBeNull();
  });

  it('buying ended before the month’s buy day, seen that day: no buy day left', async () => {
    const snapshot = fixtureSnapshot();
    const plan = {
      ...snapshot.plan,
      lastBuy: '2026-10-03' as Plan['lastBuy'],
      endedBuyingOn: '2026-10-03' as Plan['lastBuy'],
    };
    await mount({ ...snapshot, plan } as Snapshot, at('2026-10-03'));
    expect(screen.getByRole('heading', { level: 2, name: 'No buy days left' })).toBeDefined();
    expect(screen.queryByText(/Next buy day/u)).toBeNull();
  });

  it('buying ended under an open pause, seen on the end day: the ended plan’s month, never the pause or Resume', async () => {
    const snapshot = fixtureSnapshot();
    const pause = { id: entityId, from: '2026-10-01', until: null, note: '' } as Pause;
    const plan = {
      ...snapshot.plan,
      pauses: [pause],
      lastBuy: '2026-10-20' as Plan['lastBuy'],
      endedBuyingOn: '2026-10-20' as Plan['lastBuy'],
    };
    await mount({ ...snapshot, plan } as Snapshot, at('2026-10-20'));
    expect(screen.queryByText(/^Paused (since|until)/u)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
    // What Today shows an ended plan whose last month was paused: the month, with no buy day after it.
    expect(screen.getByRole('heading', { level: 2, name: 'October 2026 is paused' })).toBeDefined();
    expect(screen.queryByText(/^Next buy day/u)).toBeNull();
  });

  it('the hold phase inside the last month: the phase, never the recorded month', async () => {
    const snapshot = fixtureSnapshot();
    const plan = {
      ...snapshot.plan,
      lastBuy: '2026-10-20' as Plan['lastBuy'],
      endedBuyingOn: '2026-10-20' as Plan['lastBuy'],
    };
    const october = snapshot.entries
      .filter((entry) => entry.slot === '2026-09')
      .map(
        (entry, index): Entry => ({
          ...entry,
          id: `00000000-0000-4000-8000-00000000300${index + 1}` as Entry['id'],
          date: '2026-10-05' as Entry['date'],
          slot: '2026-10' as Entry['slot'],
        }),
      );
    await mount({ ...snapshot, plan, entries: [...snapshot.entries, ...october] } as Snapshot, at('2026-10-21'));
    expect(screen.getByRole('heading', { level: 2, name: 'In the hold phase' })).toBeDefined();
    expect(screen.getByText(/^The sell window opens on 1 Sept 2029\.$/u)).toBeDefined();
    expect(screen.queryByText(/is recorded/u)).toBeNull();
    expect(screen.queryByText('Record a purchase')).toBeNull();
  });

  it('in the sell window, months left open go to the pending list and the phase leads (DOMAIN §3.3)', async () => {
    // Reviewed on the day: the foot keeps the backup banner, which the annual review would otherwise take.
    await mount(reviewedOn(fixtureSnapshot(), '2030-03-15'), at('2030-03-15'));
    expect(screen.getByText(/^Your data lives only on this device\./u)).toBeDefined();
    expect(screen.getByRole('heading', { level: 2, name: 'In the sell window' })).toBeDefined();
    expect(screen.queryByText(/is still open/u)).toBeNull();
    const pending = screen.getByRole('list', { name: 'Also open' });
    const items = within(pending)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items[0]).toMatch(/^October\u00a02026: /u);
  });

  it('the portfolio number: invested without prices, the value with its prices line once priced', async () => {
    await mount(fixtureSnapshot(), at('2026-10-20'));
    expect(screen.getByText('Invested')).toBeDefined();
    expect(screen.queryByText(/^Prices as of/)).toBeNull();
    cleanup();
    await mount(fixtureSnapshot(), at('2026-10-20'), true);
    expect(screen.getByText('Portfolio value')).toBeDefined();
    expect(screen.getByText(/^Prices as of .* · Price data by CoinGecko$/)).toBeDefined();
  });

  it('offline, the stored prices keep the value and the line says so; back online it is live again', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      await mount(fixtureSnapshot(), at('2026-10-20'), true);
      expect(screen.getByText('Portfolio value')).toBeDefined();
      // CoinGecko's prices keep their credit offline (ADR-0036, docs/CONTENT-STYLE.md §3).
      expect(
        screen.getByText(/^Prices from \d{2}:\d{2}, 20 Oct 2026 · offline · Price data by CoinGecko$/u),
      ).toBeDefined();
      expect(screen.queryByText(/^Prices as of/u)).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();

      online.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      expect(screen.getByText(/^Prices as of .* · Price data by CoinGecko$/u)).toBeDefined();
      expect(screen.queryByText(/offline$/u)).toBeNull();
    } finally {
      online.mockRestore();
    }
  });

  it('the server’s last good copy reads as delayed, with its own time and the credit', async () => {
    await mount(fixtureSnapshot(), at('2026-10-20'), { ...FIXTURE_PRICES, stale: true });
    expect(screen.getByText('Portfolio value')).toBeDefined();
    expect(
      screen.getByText(/^Prices as of \d{2}:\d{2}, 20 Oct 2026 · delayed · Price data by CoinGecko$/u),
    ).toBeDefined();
  });

  it('live and typed prices read at their fetch; delayed and offline ones at the time the prices describe', async () => {
    // Fetched at 10:00Z, 11:00 in Lisbon; the prices describe 09:30Z (live, 30 minutes old) or 07:00Z.
    const nowMs = at('2026-10-20');
    const describing = (instant: string) => ({
      ...FIXTURE_PRICES,
      snapshot: { ...FIXTURE_PRICES.snapshot, at: instant as PricesState['snapshot']['at'] },
    });
    await mount(fixtureSnapshot(), nowMs, describing('2026-10-20T09:30:00Z'));
    expect(screen.getByText('Prices as of 11:00, 20 Oct 2026 · Price data by CoinGecko')).toBeDefined();
    cleanup();
    await mount(fixtureSnapshot(), nowMs, { ...describing('2026-10-20T07:00:00Z'), stale: true });
    expect(screen.getByText('Prices as of 08:00, 20 Oct 2026 · delayed · Price data by CoinGecko')).toBeDefined();
    cleanup();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      await mount(fixtureSnapshot(), nowMs, describing('2026-10-20T07:00:00Z'));
      expect(screen.getByText('Prices from 08:00, 20 Oct 2026 · offline · Price data by CoinGecko')).toBeDefined();
      cleanup();
      const typed = { ...describing('2026-10-20T07:00:00Z'), source: 'manual' as const };
      await mount({ ...fixtureSnapshot(), prices: typed }, nowMs);
      expect(screen.getByText('Prices as of 11:00, 20 Oct 2026')).toBeDefined();
    } finally {
      online.mockRestore();
    }
  });

  it('offline, prices typed by hand keep their own line, with no CoinGecko credit', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      const nowMs = at('2026-10-20');
      const prices = { ...pricesAt(FIXTURE_PRICES, nowMs), source: 'manual' as const };
      await mount({ ...fixtureSnapshot(), prices }, nowMs);
      expect(screen.getByText('Portfolio value')).toBeDefined();
      expect(screen.getByText(/^Prices as of \d{2}:\d{2}, 20 Oct 2026$/u)).toBeDefined();
      expect(screen.queryByText(/CoinGecko/u)).toBeNull();
    } finally {
      online.mockRestore();
    }
  });

  it('the strip with its today marker, and the plan one link away', async () => {
    await mount(fixtureSnapshot(), at('2026-10-20'));
    expect(document.querySelector('[data-slot="progress-strip-today"]')).not.toBeNull();
    expect(href('Your plan')).toBe('/plan');
  });

  // The strip names the phases as nouns (docs/LEGAL.md §6), and an open-ended hold gives no end date.
  it('the strip names its phases as nouns, and a plan without a sell window has no end set', async () => {
    const snapshot = fixtureSnapshot();
    await mount({ ...snapshot, plan: snapshot.plan && { ...snapshot.plan, sellWindow: null } }, at('2026-10-20'));
    expect(
      screen
        .getByRole('img', { name: /^Plan from / })
        .getAttribute('aria-label')
        ?.replace(/\s/gu, ' '),
    ).toBe('Plan from 5 Apr 2026, with no end set. Today is 20 Oct 2026.');
    expect(screen.getAllByText('Buying').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Holding').length).toBeGreaterThan(0);
    expect(screen.queryByText('Hold')).toBeNull();
  });

  it('a sell window: the strip links to why it is a window', async () => {
    await mount(fixtureSnapshot(), at('2026-10-20'));
    expect(screen.getByRole('button', { name: 'Why? The sell window' }).textContent).toBe('Why?');
  });

  it('no sell window, no link', async () => {
    const snapshot = fixtureSnapshot();
    await mount({ ...snapshot, plan: snapshot.plan && { ...snapshot.plan, sellWindow: null } }, at('2026-10-20'));
    expect(screen.queryByRole('button', { name: 'Why? The sell window' })).toBeNull();
  });

  it('never exported: the backup banner links to Settings', async () => {
    await mount(fixtureSnapshot(), at('2026-10-20'));
    expect(screen.getByText(/^Your data lives only on this device\./)).toBeDefined();
    expect(href('Export a copy.')).toBe('/settings');
  });

  it('exported, then an entry added: the banner names the last export', async () => {
    const snapshot = fixtureSnapshot();
    const prefs = {
      ...snapshot.prefs,
      lastBackupAt: '2026-09-12T10:00:00+01:00' as Instant,
      changedAt: '2026-09-20T18:00:00+01:00' as Instant,
    };
    await mount({ ...snapshot, prefs }, at('2026-10-20'));
    const banner = screen.getByRole('status');
    expect(banner.textContent).toBe(
      'Your data lives only on this device. Last export 12\u00a0Sept\u00a02026. Export a copy.',
    );
    expect(
      within(banner)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Export a copy.']);
    expect(href('Export a copy.')).toBe('/settings');
  });

  it('exported after the last change: no banner', async () => {
    const snapshot = fixtureSnapshot();
    const prefs = { ...snapshot.prefs, lastBackupAt: '2026-10-01T10:00:00+01:00' as Instant };
    await mount({ ...snapshot, prefs }, at('2026-10-20'));
    expect(screen.queryByText(/^Your data lives only on this device\./)).toBeNull();
  });

  // The durability line (ADR-0004, ADR-0019; docs/CONTENT-STYLE.md §3): once entries exist, quiet and with
  // no dismiss; it gives way to the backup banner, which says the same and more, so the two never stack.
  const DURABILITY = 'Your data lives only in this browser. Install the app or export a copy to keep it.';
  const exported = (snapshot: Snapshot): Snapshot => ({
    ...snapshot,
    prefs: { ...snapshot.prefs, lastBackupAt: '2026-10-01T10:00:00+01:00' as Instant },
  });

  it('with entries and no banner, in a browser tab: the durability line, quiet and with no dismiss', async () => {
    await mount(exported(fixtureSnapshot()), at('2026-10-20'));
    const line = screen.getByText(DURABILITY);
    expect(line.tagName).toBe('P');
    expect(line.getAttribute('role')).toBeNull();
    expect(line.className).toContain('text-ink-2');
    expect(line.children).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /dismiss|close/i })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('in the installed app: the line asks only for the export, since the app is already installed', async () => {
    await mount(exported(fixtureSnapshot()), at('2026-10-20'), false, {
      platform: recordingPlatform({ installed: true }),
    });
    expect(screen.getByText('Your data lives only on this device. Export a copy to keep it.')).toBeDefined();
    expect(screen.queryByText(DURABILITY)).toBeNull();
  });

  it('with no entries: no durability line', async () => {
    await mount(exported({ ...fixtureSnapshot(), entries: [] }), at('2026-10-20'));
    expect(screen.queryByText(DURABILITY)).toBeNull();
  });

  it('once every entry is deleted, or a backup with none replaced them: no durability line, as no banner', async () => {
    const snapshot = fixtureSnapshot();
    const gone = '2026-10-19T10:00:00+01:00' as Instant;
    const entries = snapshot.entries.map((entry) => ({ ...entry, deletedAt: gone, updatedAt: gone }));
    await mount({ ...snapshot, entries }, at('2026-10-20'));
    expect(screen.queryByText(DURABILITY)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('while the backup banner shows: the banner alone, never the line beside it', async () => {
    await mount(fixtureSnapshot(), at('2026-10-20'));
    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.queryByText(DURABILITY)).toBeNull();
  });

  const unseen = (snapshot: Snapshot, country?: string): Snapshot =>
    ({ ...snapshot, plan: { ...snapshot.plan, countryRuleVersion: 0, ...(country && { country }) } }) as Snapshot;

  it('a plan in a country with no profile shows no notice and does not throw', async () => {
    // The loader gives the generic profile for such a plan: here Portugal's stands in for it, with another code.
    // Japan: no profile and none on the roadmap, so the code stays unregistered as the profiles land.
    await mount(unseen(fixtureSnapshot(), 'JP'), at('2026-10-20'));
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('the notice takes the foot and the durability line stays away', async () => {
    await mount(exported(unseen(fixtureSnapshot())), at('2026-10-20'));
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDefined();
    expect(screen.queryByText(DURABILITY)).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('a plan that has seen the version: no notice', async () => {
    await mount(fixtureSnapshot(), at('2026-10-20'));
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });
});

// The annual review at the foot (docs/DOMAIN.md §3.11, §3.12): the fixture plan, created on 5 Apr 2026, is due from
// 5 Apr 2027; it holds BTC and ETH and was never exported, so the backup banner waits behind the review.
describe('TodayScreen, the annual review', () => {
  const REVIEW = /^You set up this plan on 5 Apr 2026\. Is it still right\? Have the rules changed\?$/u;
  const BACKUP = /^Your data lives only on this device\./u;
  const DUE = at('2027-04-20');

  it('sits below the rule-change notice and above the backup banner', async () => {
    await mount({ ...fixtureSnapshot(), plan: { ...fixtureSnapshot().plan, countryRuleVersion: 0 } } as Snapshot, DUE);
    expect(screen.getByRole('link', { name: 'Review' })).toBeDefined();
    expect(screen.queryByText(REVIEW)).toBeNull();
    cleanup();
    await mount(fixtureSnapshot(), DUE);
    expect(screen.getByText(REVIEW)).toBeDefined();
    expect(screen.queryByText(BACKUP)).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('not asked the day before it is due', async () => {
    await mount(fixtureSnapshot(), at('2027-04-04'));
    expect(screen.queryByText(REVIEW)).toBeNull();
    expect(screen.getByText(BACKUP)).toBeDefined();
  });

  it('a paused plan and an ended plan on a due clock show the review', async () => {
    const snapshot = fixtureSnapshot();
    const plan = snapshot.plan as Plan;
    const pause: Pause = {
      id: entityId as Pause['id'],
      from: '2027-04-01' as CalendarDate,
      until: '2027-06-30' as CalendarDate,
      note: '',
    };
    await mount({ ...snapshot, plan: { ...plan, lastBuy: '2028-03-05' as CalendarDate, pauses: [pause] } }, DUE);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDefined();
    expect(screen.getByText(REVIEW)).toBeDefined();
    cleanup();
    const ended = { ...plan, lastBuy: '2028-03-05' as CalendarDate, endedBuyingOn: '2027-04-10' as CalendarDate };
    await mount({ ...snapshot, plan: ended }, DUE);
    expect(screen.getByText(REVIEW)).toBeDefined();
  });

  it('past the exit date: asked while coins are held, never once none are', async () => {
    await mount(fixtureSnapshot(), at('2031-02-01'));
    expect(screen.getByText(REVIEW)).toBeDefined();
    cleanup();
    await mount({ ...fixtureSnapshot(), entries: [] }, at('2031-02-01'));
    expect(screen.queryByText(REVIEW)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('after Later, the backup banner shows on the same visit, and a new visit keeps the review away', async () => {
    const { remount } = await mount(fixtureSnapshot(), DUE);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Later' })));
    expect(screen.queryByText(REVIEW)).toBeNull();
    expect(screen.getByText(BACKUP)).toBeDefined();
    await remount();
    expect(screen.queryByText(REVIEW)).toBeNull();
    expect(screen.getByText(BACKUP)).toBeDefined();
  });
});

const CLEAR_LAST = { date: '2026-10-19' as CalendarDate, sevenDay: null, fromHigh90: '-1' as Percent };

// The red-day banner at the foot (docs/DOMAIN.md §3.11; docs/DESIGN.md §8): the model answers once per visit; the
// fixture plan holds BTC and ETH and was never exported, so the backup banner waits behind it.
describe('TodayScreen, the red-day banner', () => {
  const RED = /^Bitcoin and Ethereum, in the amounts you hold, fell 16% in the seven days to 19 Oct 2026\.$/;
  const BACKUP = /^Your data lives only on this device\./;
  const episode = () =>
    episodeRedDay({ date: '2026-10-19' as CalendarDate, sevenDay: '-16.4' as Percent, fromHigh90: '-20' as Percent }, [
      { coin: 'BTC' as CoinId, name: 'Bitcoin' },
      { coin: 'ETH' as CoinId, name: 'Ethereum' },
    ]);
  const unseen = (snapshot: Snapshot): Snapshot =>
    ({ ...snapshot, plan: { ...snapshot.plan, countryRuleVersion: 0 } }) as Snapshot;

  it('outranks the rule-change notice and the backup banner', async () => {
    await mount(unseen(fixtureSnapshot()), at('2026-10-20'), false, { redDay: episode() });
    expect(screen.getByText(RED)).toBeDefined();
    expect(screen.queryByText(BACKUP)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Review' })).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('shows nothing at the foot while the model is on its way', async () => {
    const waiting = episodeRedDay(CLEAR_LAST, undefined, () => new Promise<RedDayModel>(() => {}));
    await mount(fixtureSnapshot(), at('2026-10-20'), false, { redDay: waiting });
    expect(screen.getByRole('button', { name: 'Bought as planned' })).toBeDefined();
    expect(screen.queryByText(BACKUP)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a failed read counts as no episode: the next banner, and nothing said', async () => {
    const failing = episodeRedDay(CLEAR_LAST, undefined, () => Promise.reject(new Error('offline')));
    await mount(fixtureSnapshot(), at('2026-10-20'), false, { redDay: failing });
    expect(screen.getByText(BACKUP)).toBeDefined();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('no served history counts as no episode: the next banner, and nothing recorded', async () => {
    const model: RedDayModel = {
      state: 'no-history',
      held: [{ coin: 'BTC' as CoinId, name: 'Bitcoin' }],
      figure: null,
      episode: null,
      lastRed: null,
      nextBuy: null,
      buyDayToday: false,
    };
    const unserved = episodeRedDay(CLEAR_LAST, undefined, async () => model);
    const { services } = await mount(fixtureSnapshot(), at('2026-10-20'), false, { redDay: unserved });
    expect(screen.queryByText(RED)).toBeNull();
    expect(screen.getByText(BACKUP)).toBeDefined();
    expect(services.domain.store.getState().snapshot.prefs.dismissedBanners).toEqual([]);
  });

  it('no units held: no question asked, and no banner', async () => {
    const redDay = episode();
    const model = vi.spyOn(redDay, 'model');
    await mount({ ...fixtureSnapshot(), entries: [] }, at('2026-10-20'), false, { redDay });
    expect(model).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('recorded on its first show, it stays for the visit; a remount shows the next banner', async () => {
    const { services, remount } = await mount(fixtureSnapshot(), at('2026-10-20'), false, { redDay: episode() });
    expect(services.domain.store.getState().snapshot.prefs.dismissedBanners).toEqual(['red-day:2026-10-15']);
    expect(screen.getByText(RED)).toBeDefined();
    expect(screen.queryByText(BACKUP)).toBeNull();
    await remount();
    expect(screen.queryByText(RED)).toBeNull();
    expect(screen.getByText(BACKUP)).toBeDefined();
  });

  it('a plan written during the visit leaves the banner in place, asked once', async () => {
    const redDay = episode();
    const model = vi.spyOn(redDay, 'model');
    const { services } = await mount(fixtureSnapshot(), at('2026-10-20'), false, { redDay });
    const plan = services.domain.store.getState().snapshot.plan;
    await act(() => services.domain.write({ plan: { ...plan } as Plan }));
    expect(screen.getByText(RED)).toBeDefined();
    expect(screen.queryByText(BACKUP)).toBeNull();
    expect(model).toHaveBeenCalledOnce();
  });

  // On a clock the review is due on, the episode under way holds it back (#11 D1), on every visit of the episode.
  const DUE = at('2027-04-20');
  const dueEpisode = () =>
    episodeRedDay({ ...CLEAR_LAST, date: '2027-04-19' as CalendarDate, sevenDay: '-16.4' as Percent });
  const REVIEW = /Is it still right\?/u;

  it('an episode covered on an earlier visit gives the backup banner, not the review', async () => {
    const snapshot = fixtureSnapshot();
    const covered = { ...snapshot, prefs: { ...snapshot.prefs, dismissedBanners: ['red-day:2026-10-15'] } };
    await mount(covered, DUE, false, { redDay: dueEpisode() });
    expect(screen.queryByText(/fell 16%/u)).toBeNull();
    expect(screen.queryByText(REVIEW)).toBeNull();
    expect(screen.getByText(BACKUP)).toBeDefined();
  });

  it('after Dismiss of a red day on a due clock, the backup banner, not the review; and on the next visit too', async () => {
    const { remount } = await mount(fixtureSnapshot(), DUE, false, { redDay: dueEpisode() });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Dismiss' })));
    expect(screen.queryByText(REVIEW)).toBeNull();
    expect(screen.getByText(BACKUP)).toBeDefined();
    await remount();
    expect(screen.queryByText(REVIEW)).toBeNull();
    expect(screen.getByText(BACKUP)).toBeDefined();
  });

  it('Dismiss hides it and the next banner takes the foot', async () => {
    await mount(fixtureSnapshot(), at('2026-10-20'), false, { redDay: episode() });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Dismiss' })));
    expect(screen.queryByText(RED)).toBeNull();
    expect(screen.getByText(BACKUP)).toBeDefined();
  });
});

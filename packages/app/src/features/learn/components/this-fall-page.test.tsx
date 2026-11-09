// @vitest-environment jsdom
import { countryRules, loadProfile } from '@proofofcalm/content';
import { loadCycleDrawdowns } from '@proofofcalm/content/cycles';
import type { Coin, CountryCode, Instant, Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider, Route, usePathname } from '../../../lib/navigation';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { pastFalls } from '../../../lib/services/red-day-model';
import type { PastFall, RedDayModel, RedDayPort } from '../../../lib/services/red-day-types';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import learn from '../../../messages/en/learn.json';
import shell from '../../../messages/en/shell.json';
import { LearnScreen } from './learn-screen';

// The page a fall of the held coins opens from Learn's row (docs/EDUCATION.md §6, docs/CONTENT-STYLE.md §3): the
// figure in the market's words, dated by the last close; the data line; the past-performance line once; the earlier
// falls of each held coin with their publishers; the next buy day; the person's note. The port is stubbed for the
// figure, so each state is set here; the earlier falls are the cycles file's own rows, read as the port reads them.

// Under Vitest each import() is a round trip to the main process, and a module's first one waits on Vite's
// transform: under load the Why? sheet's chunk (the sheet, the learn namespace, the body) outlasted the dialog's
// findBy (1 s). The profiles and the namespaces answer from memory, the earlier falls come from the maths module
// loaded with this file, and the sheet and the two fixture bodies load here (lib/services/testing-modules.ts).
vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../../lib/services/testing-modules')).profilesInMemory(await original()),
);
vi.mock('../../../lib/i18n/namespaces', async (original) =>
  (await import('../../../lib/services/testing-modules')).namespacesInMemory(await original()),
);

await preloadLazyModules([
  () => import('./module-sheet'),
  () =>
    import('virtual:learn-modules').then((modules) =>
      Promise.all([modules.LEARN_BODIES['start-here']?.(), modules.LEARN_BODIES['when-the-market-drops']?.()]),
    ),
]);

afterEach(cleanup);

const NOW_MS = Date.UTC(2026, 10, 9, 10);
const KAS = { id: 'KAS', name: 'Kaspa', geckoId: 'kaspa', decimals: 8 } as Coin;
const DOGE = { id: 'DOGE', name: 'Dogecoin', geckoId: 'dogecoin', decimals: 8 } as Coin;

type Figure = NonNullable<RedDayModel['figure']>;
type Held = RedDayModel['held'];
const BITCOIN = { coin: 'BTC', name: 'Bitcoin' } as Held[number];
const ETHEREUM = { coin: 'ETH', name: 'Ethereum' } as Held[number];
const FIGURE = {
  coins: ['BTC'],
  missing: [],
  sevenDay: '-16.9876',
  fromHigh90: '-33.4567',
  first: '2025-11-10',
  last: '2026-11-08',
  currency: 'EUR',
  shortWindow: false,
} as unknown as Figure;

const episode = (figure: Partial<Figure> = {}, rest: Partial<RedDayModel> = {}): RedDayModel =>
  ({
    state: 'episode',
    held: [BITCOIN],
    figure: { ...FIGURE, ...figure },
    episode: { start: '2026-11-07', last: '2026-11-08' },
    lastRed: { date: '2026-11-08', sevenDay: FIGURE.sevenDay, fromHigh90: FIGURE.fromHigh90 },
    nextBuy: '2026-12-01',
    buyDayToday: false,
    ...rest,
  }) as RedDayModel;
const bare = (state: RedDayModel['state'], held: Held = [BITCOIN]): RedDayModel =>
  ({
    state,
    held,
    figure: null,
    episode: null,
    lastRed: null,
    nextBuy: '2026-12-01',
    buyDayToday: false,
  }) as RedDayModel;

const loaded = loadCycleDrawdowns();
const ROWS = loaded.ok ? loaded.value : [];

type Mount = {
  model: Promise<RedDayModel>;
  falls?: (coins: readonly string[]) => Promise<readonly PastFall[]>;
  plan?: Partial<Plan>;
  path?: string;
};

async function rulesOf(country: CountryCode) {
  const profile = await loadProfile(country);
  return profile === null ? null : countryRules(profile);
}

async function mount({ model, falls, plan = {}, path = '/learn/fall-under-way' }: Mount) {
  const base = fixtureSnapshot();
  const planned = { ...(base.plan as Plan), why: 'I buy every month and hold for four years.', ...plan };
  const services = createTestServices({ snapshot: { ...base, plan: planned }, nowMs: NOW_MS, rules: rulesOf });
  const port: RedDayPort = {
    model: () => model,
    pastFalls: (coins) => (falls === undefined ? pastFalls(coins) : falls(coins)),
  };
  const stubbed = { ...services, redDay: port };
  await stubbed.start();
  await act(async () => {
    render(
      <NavigationProvider location="memory" initialPath={path}>
        <ServicesProvider services={stubbed}>
          <I18nProvider messages={{ learn, shell }}>
            <Suspense fallback={<p>pending</p>}>
              <Route path="/learn" nest>
                <LearnScreen />
              </Route>
            </Suspense>
            <Path />
          </I18nProvider>
        </ServicesProvider>
      </NavigationProvider>,
    );
  });
}

const Path = () => <output data-testid="path">{usePathname()}</output>;
const path = () => screen.getByTestId('path').textContent;
/** The page's text with every no-break space as a space, so a date or a percent reads as the copy writes it. */
const page = () => screen.getByRole('heading', { level: 1 }).parentElement?.textContent ?? '';
const text = () => page().replaceAll(/[\u00a0\u202f]/g, ' ');
const leaves = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : Object.values(value as object).flatMap(leaves);

describe('ThisFallPage, a fall under way', () => {
  it('reads one coin in the market as subject, dated by the last close, with the data line beside it', async () => {
    await mount({ model: Promise.resolve(episode()) });
    expect(await screen.findByRole('heading', { level: 1, name: 'The fall under way and your plan' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to Today' }).getAttribute('href')).toBe('/today');
    expect(text()).toContain('Bitcoin is 33% below its 90-day high and fell 16% in the seven days to 8 Nov 2026.');
    const data = screen.getByText(/^Daily closes in EUR/);
    expect(data.textContent?.replaceAll(' ', ' ')).toBe(
      'Daily closes in EUR, 10 Nov 2025 to 8 Nov 2026 · Price data by CoinGecko',
    );
    expect(data.className).toContain('text-14');
  });

  it('reads several coins together, in the amounts held, each by one name, and names a coin it has no history for', async () => {
    await mount({
      model: Promise.resolve(
        episode({ coins: ['BTC', 'ETH'], missing: ['KAS'] } as unknown as Partial<Figure>, {
          held: [BITCOIN, ETHEREUM, { coin: 'KAS', name: 'Kaspa' }] as Held,
        }),
      ),
      plan: { coins: [...(fixtureSnapshot().plan as Plan).coins, KAS] },
    });
    await screen.findByText(/^Bitcoin and Ethereum, in the amounts you hold/);
    expect(text()).toContain(
      'Bitcoin and Ethereum, in the amounts you hold, are 33% below their 90-day high. They fell 16% in the seven days to 8 Nov 2026.',
    );
    // One name per coin: the held coins' names, never their ids beside them.
    expect(text()).not.toMatch(/\b(BTC|ETH|KAS)\b/);
    expect(text()).toContain('Kaspa is not in these figures: Proof of Calm has no price history for it.');
    expect(text()).toContain('Proof of Calm has no dated earlier fall for Kaspa.');
  });

  it.each([
    ['a rise', { sevenDay: '2.4' }, '33% below their 90-day high. They rose 2% in the seven days to 8 Nov 2026.'],
    ['no seven-day figure', { sevenDay: null }, '33% below their 90-day high (8 Nov 2026).'],
  ])('reads several coins in two sentences, the second after %s, or one with the date', async (_, change, end) => {
    const coins = { coins: ['BTC', 'ETH'], ...change } as unknown as Partial<Figure>;
    await mount({ model: Promise.resolve(episode(coins, { held: [BITCOIN, ETHEREUM] })) });
    await screen.findByText(/^Bitcoin and Ethereum, in the amounts you hold/);
    expect(text()).toContain(`Bitcoin and Ethereum, in the amounts you hold, are ${end}`);
  });

  it('names the first close as the high it measures from on a short window', async () => {
    await mount({ model: Promise.resolve(episode({ shortWindow: true, first: '2026-06-02' } as Partial<Figure>)) });
    await screen.findByText(/^Bitcoin is/);
    expect(text()).toContain(
      'Bitcoin is 33% below its highest close since 2 Jun 2026 and fell 16% in the seven days to 8 Nov 2026.',
    );
  });

  it('leaves the seven-day half out when that figure is null, and keeps the date', async () => {
    await mount({ model: Promise.resolve(episode({ sevenDay: null })) });
    await screen.findByText(/^Bitcoin is/);
    expect(text()).toContain('Bitcoin is 33% below its 90-day high (8 Nov 2026).');
    expect(text()).not.toContain('seven days');
  });

  it('lists the earlier falls of each held coin only, oldest first, each with its publisher as unlinked text', async () => {
    await mount({ model: Promise.resolve(episode()), plan: { coins: [...(fixtureSnapshot().plan as Plan).coins] } });
    const heading = await screen.findByText(/^Earlier falls of Bitcoin/);
    expect(heading.textContent).toBe(
      'Earlier falls of Bitcoin, high to low, intraday prices in US dollars, with their source:',
    );
    const items = screen.getAllByRole('listitem').map((item) => item.textContent?.replaceAll(' ', ' '));
    const btc = ROWS.filter((row) => row.coin === 'BTC').sort((a, b) => a.high.localeCompare(b.high));
    expect(items).toHaveLength(btc.length);
    expect(items[0]).toBe('−94% from 8 Jun 2011 to 22 Nov 2011 · Bitcoinity (Mt. Gox) and CoinMarketCap');
    expect(items.map((item, index) => item?.endsWith(btc[index]?.publisher ?? '?'))).toEqual(btc.map(() => true));
    // ETH is in the plan at 0 units, so not among the held coins: none of its falls.
    expect(screen.queryByText(/^Earlier falls of Ethereum/)).toBeNull();
    const links = screen.getAllByRole('link').map((link) => link.textContent);
    expect(links).toEqual(['Back to Today', 'Risk disclosure']);
  });

  it('lists the earlier falls of a held coin outside the plan, as the figure names it', async () => {
    // ETH left the plan in Settings; its entries stay, so the portfolio still holds it.
    await mount({
      model: Promise.resolve(
        episode({ coins: ['BTC', 'ETH'] } as unknown as Partial<Figure>, { held: [BITCOIN, ETHEREUM] }),
      ),
      plan: { coins: (fixtureSnapshot().plan as Plan).coins.filter((coin) => coin.id === 'BTC') },
    });
    await screen.findByText(/^Bitcoin and Ethereum, in the amounts you hold/);
    expect(await screen.findByText(/^Earlier falls of Ethereum/)).toBeDefined();
    const eth = ROWS.filter((row) => row.coin === 'ETH');
    const btc = ROWS.filter((row) => row.coin === 'BTC');
    expect(eth.length).toBeGreaterThan(0);
    expect(screen.getAllByRole('listitem')).toHaveLength(btc.length + eth.length);
  });

  it('says a held coin has no dated earlier fall, by the name the falls use', async () => {
    await mount({
      model: Promise.resolve(
        episode({ coins: ['BTC', 'DOGE'] } as unknown as Partial<Figure>, {
          held: [BITCOIN, { coin: 'DOGE', name: 'Dogecoin' }] as Held,
        }),
      ),
      plan: { coins: [...(fixtureSnapshot().plan as Plan).coins, DOGE] },
    });
    expect(await screen.findByText('Proof of Calm has no dated earlier fall for Dogecoin.')).toBeDefined();
    expect(screen.getByText(/^Earlier falls of Bitcoin/)).toBeDefined();
  });

  it('carries the past-performance line and the risk link as one element, once, under the data line', async () => {
    await mount({ model: Promise.resolve(episode()) });
    const line = await screen.findByText(/^Past performance is not a reliable indicator/);
    expect(screen.getAllByText(/Past performance/)).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Risk disclosure' })).toHaveLength(1);
    expect(line.textContent).toBe('Past performance is not a reliable indicator of future results. Risk disclosure');
    const data = screen.getByText(/^Daily closes in EUR/);
    const falls = screen.getByText(/^Earlier falls of/);
    expect(data.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.compareDocumentPosition(falls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('gives the next buy day, or today as the buy day, or leaves it out with none ahead', async () => {
    await mount({ model: Promise.resolve(episode()) });
    await screen.findByText(/^Bitcoin is/);
    expect(text()).toContain(
      'Your next buy day is 1 Dec 2026. Today is not a buy day unless you decided that earlier.',
    );
    cleanup();
    await mount({ model: Promise.resolve(episode({}, { nextBuy: '2026-11-09', buyDayToday: true } as never)) });
    await screen.findByText(/^Bitcoin is/);
    expect(text()).toContain('Today, 9 Nov 2026, is your buy day.');
    expect(text()).not.toContain('Your next buy day');
    cleanup();
    await mount({ model: Promise.resolve(episode({}, { nextBuy: null })) });
    await screen.findByText(/^Bitcoin is/);
    expect(text()).not.toMatch(/buy day/);
  });

  it("dates the note by the plan's creation day in the person's time zone, with no Edit", async () => {
    // 23:30 at UTC−1 on 12 Dec is 00:30 on 13 Dec in Lisbon, the test clock's zone.
    await mount({ model: Promise.resolve(episode()), plan: { createdAt: '2025-12-12T23:30:00-01:00' as Instant } });
    expect(await screen.findByRole('heading', { level: 2, name: 'Your note to yourself' })).toBeDefined();
    expect(text()).toContain('13 Dec 2025: “I buy every month and hold for four years.”');
    // The figure's Why? is the page's one control.
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Why?']);
  });

  it('leaves the note out when the plan has none', async () => {
    await mount({ model: Promise.resolve(episode()), plan: { why: '' } });
    await screen.findByText(/^Bitcoin is/);
    expect(screen.queryByText('Your note to yourself')).toBeNull();
  });

  it("opens When the market drops in the sheet from the figure's Why?, and the route stays", async () => {
    await mount({ model: Promise.resolve(episode()) });
    const why = await screen.findByRole('button', { name: 'Why? The fall under way' });
    expect(why.closest('p')?.textContent).toMatch(/^Bitcoin is 33%/);
    fireEvent.click(why);
    const sheet = await screen.findByRole('dialog', {
      name: "The second fixture's idea, for the fall page's Why? and the module route.",
    });
    expect(within(sheet).getByText('Fixture text of the module the fall page explains.')).toBeDefined();
    expect(path()).toBe('/learn/fall-under-way');
    // The line to the fall page belongs to the module's route, never to its sheet.
    expect(within(sheet).queryByRole('link', { name: 'See its figures' })).toBeNull();
  });

  it('says the earlier falls could not be loaded when the cycles file fails', async () => {
    await mount({ model: Promise.resolve(episode()), falls: () => Promise.reject(new Error('cycles')) });
    expect(
      await screen.findByText('The earlier falls could not be loaded. Open this page again to retry.'),
    ).toBeDefined();
    expect(screen.queryByText(/^Earlier falls of/)).toBeNull();
    expect(text()).not.toContain('cycles');
    // The figure above is historic data, so the past-performance line stays.
    expect(screen.getAllByText(/^Past performance/)).toHaveLength(1);
  });
});

describe('ThisFallPage, other states', () => {
  it('holds the failure line in the figure’s place, no data line, and the disclosure under the falls', async () => {
    await mount({ model: Promise.resolve(bare('failed')) });
    const failure = await screen.findByText(
      "The price history could not be loaded, so today's figures are not shown. Open this page again to retry.",
    );
    expect(screen.queryByText(/^Daily closes in/)).toBeNull();
    const falls = await screen.findAllByRole('listitem');
    const line = screen.getByText(/^Past performance/);
    expect(failure.compareDocumentPosition(falls[0] as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect((falls.at(-1) as Node).compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text()).toContain('Your next buy day is 1 Dec 2026.');
    // ETH is a plan coin at 0 units: the held coins leave it out.
    expect(screen.queryByText(/Ethereum|ETH/)).toBeNull();
  });

  it('shows no past-performance line when no historic figure is on the page', async () => {
    await mount({ model: Promise.resolve(bare('failed')), falls: () => Promise.reject(new Error('cycles')) });
    await screen.findByText('The earlier falls could not be loaded. Open this page again to retry.');
    expect(screen.queryByText(/Past performance/)).toBeNull();
    cleanup();
    const doge = { coin: 'DOGE', name: 'Dogecoin' } as Held[number];
    await mount({ model: Promise.resolve(bare('failed', [doge])), plan: { coins: [DOGE] } });
    await screen.findByText('Proof of Calm has no dated earlier fall for Dogecoin.');
    expect(screen.queryByText(/Past performance/)).toBeNull();
  });

  it('keeps the figure’s place busy while the model is pending, with the note, then the held coins’ falls', async () => {
    let answer: (model: RedDayModel) => void = () => undefined;
    await mount({ model: new Promise((resolve) => (answer = resolve)) });
    expect(await screen.findByRole('heading', { level: 1, name: 'The fall under way and your plan' })).toBeDefined();
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(1);
    expect(screen.getByText('Your note to yourself')).toBeDefined();
    expect(screen.queryByText(/^Bitcoin is/)).toBeNull();
    // No coin is named before the model says which are held, and no disclosure sits under no figure.
    expect(screen.queryByText(/^Earlier falls of/)).toBeNull();
    expect(screen.queryByText(/Past performance/)).toBeNull();
    await act(async () => answer(bare('failed')));
    expect(await screen.findByText(/^Earlier falls of Bitcoin/)).toBeDefined();
    expect(screen.queryByText(/Ethereum/)).toBeNull();
  });

  it.each(['nothing-held', 'clear', 'no-history'] as const)(
    'replaces the route with the module When the market drops in the state %s',
    async (state) => {
      await mount({ model: Promise.resolve(bare(state)) });
      expect(await screen.findByRole('heading', { level: 1, name: 'When the market drops' })).toBeDefined();
      expect(path()).toBe('/learn/when-the-market-drops');
      expect(screen.queryByText('The fall under way and your plan')).toBeNull();
      expect(screen.queryByRole('link', { name: 'See its figures' })).toBeNull();
    },
  );
});

describe("Learn's row for the page", () => {
  it('shows only during an episode', async () => {
    await mount({ model: Promise.resolve(episode()), path: '/learn' });
    const row = await screen.findByRole('link', { name: /^The fall under way and your plan/ });
    expect(row.getAttribute('href')).toBe('/learn/fall-under-way');
    // No next buy day: the page leaves it out in the hold phase, with none ahead.
    expect(row.textContent).toBe(
      "The fall under way and your planThe coins you hold against their 90-day high, and each coin's earlier falls.",
    );
    for (const state of ['clear', 'failed', 'nothing-held', 'no-history'] as const) {
      cleanup();
      await mount({ model: Promise.resolve(bare(state)), path: '/learn' });
      await screen.findByRole('heading', { level: 1, name: 'Learn' });
      expect(screen.queryByRole('link', { name: /^The fall under way/ })).toBeNull();
    }
  });
});

describe('the route of When the market drops', () => {
  it('holds one line to the fall page above the body while a fall is under way', async () => {
    await mount({ model: Promise.resolve(episode()), path: '/learn/when-the-market-drops' });
    const link = await screen.findByRole('link', { name: 'See its figures' });
    expect(link.getAttribute('href')).toBe('/learn/fall-under-way');
    expect(link.closest('p')?.textContent).toBe('A fall of the coins you hold is under way. See its figures');
    const body = screen.getByText('Fixture text of the module the fall page explains.');
    expect(link.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: 'The fall under way and your plan' })).toBeDefined();
  });

  it.each(['clear', 'failed', 'nothing-held', 'no-history'] as const)(
    'holds no such line in the state %s',
    async (state) => {
      await mount({ model: Promise.resolve(bare(state)), path: '/learn/when-the-market-drops' });
      await screen.findByText('Fixture text of the module the fall page explains.');
      await act(async () => undefined);
      expect(screen.queryByRole('link', { name: 'See its figures' })).toBeNull();
    },
  );

  it('holds no such line on another module during a fall', async () => {
    await mount({ model: Promise.resolve(episode()), path: '/learn/start-here' });
    await screen.findByRole('heading', { level: 1, name: 'Start here' });
    await act(async () => undefined);
    expect(screen.queryByRole('link', { name: 'See its figures' })).toBeNull();
  });
});

describe('the percentages and the words of the page', () => {
  const several = { coins: ['BTC', 'ETH'], missing: [] } as unknown as Partial<Figure>;
  const both = { held: [BITCOIN, ETHEREUM] };

  it('writes every percent as Portugal does, the sign against its number', async () => {
    await mount({ model: Promise.resolve(episode(several, both)), plan: { country: 'PT' as CountryCode } });
    await screen.findByText(/^Bitcoin and Ethereum/);
    const written = page();
    const signs = written.match(/.%/g) ?? [];
    expect(signs.length).toBeGreaterThan(4);
    for (const sign of signs) expect(sign).toMatch(/\d%/);
  });

  it("writes every percent with Germany's no-break joiner", async () => {
    await mount({ model: Promise.resolve(episode(several, both)), plan: { country: 'DE' as CountryCode } });
    await screen.findByText(/^Bitcoin and Ethereum/);
    const written = page();
    const signs = written.match(/..%/g) ?? [];
    expect(signs.length).toBeGreaterThan(4);
    for (const sign of signs) expect(sign).toMatch(/\d\u00a0%/);
  });

  it('holds no literal percentage and none of the never-words in its messages or on the page', async () => {
    const messages = leaves(learn.thisFall);
    const banned = /\b(red|drop|drops|crash|dip|alert|opportunity|now|stay calm|don't worry|will recover)\b/i;
    for (const message of messages) {
      expect(message).not.toMatch(/\d\s?%/);
      expect(message).not.toMatch(banned);
    }
    await mount({ model: Promise.resolve(episode()) });
    await screen.findByText(/^Bitcoin is/);
    expect(text()).not.toMatch(banned);
    expect(text()).not.toMatch(/P\/L|value of your/i);
  });
});

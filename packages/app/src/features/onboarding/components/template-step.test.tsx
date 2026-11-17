// @vitest-environment jsdom
import {
  type ContentDrawdown,
  countryRules,
  fillTemplateDates,
  formatPercentTokens,
  loadProfile,
  loadTemplateTexts,
  paragraphsOf,
  TEMPLATES,
} from '@proofofcalm/content';
import { decimal } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFormatters, type Formatters } from '../../../lib/format';
import { I18nProvider, localesFor } from '../../../lib/i18n';
import onboarding from '../../../messages/en/onboarding.json';
import shell from '../../../messages/en/shell.json';
import portuguese from '../../../messages/pt-PT/onboarding.json';
import { type TemplateChoice, TemplateStep } from './template-step';

// The band test mounts each template with literal drawdown rows, so it proves the card's own formatting and no
// content review of a template's rows (docs/CONTENT-OPS.md §8) changes what it expects; every other test reads the
// templates as the files hold them.
const literalRows = vi.hoisted(() => ({ byId: null as null | Readonly<Record<string, ContentDrawdown[]>> }));
vi.mock('@proofofcalm/content', async (original) => {
  const content = await original<typeof import('@proofofcalm/content')>();
  return {
    ...content,
    formatPercentTokens: vi.fn(content.formatPercentTokens),
    get TEMPLATES() {
      const byId = literalRows.byId;
      return byId === null
        ? content.TEMPLATES
        : content.TEMPLATES.map((template) => ({ ...template, drawdowns: byId[template.id] ?? template.drawdowns }));
    },
  };
});

afterEach(() => {
  cleanup();
  literalRows.byId = null;
});

const OWN = 'Your own coins';
const LINE = 'A starting point some people use. You choose every setting. Not advice.';
const ABOUT = 'Show how it works and what can go wrong';
const NO_BREAK = ' ';
const british = createFormatters('en-GB', 'en-GB');

const offered = (id: string) => {
  const found = TEMPLATES.find((template) => template.id === id);
  if (found === undefined) throw new Error(`no template ${id}`);
  return found;
};
const pick = (name: string) => act(() => fireEvent.click(screen.getByRole('radio', { name })));
const controls = () => screen.queryAllByRole('button', { name: ABOUT });
/** Opens the one control and gives its panel. */
async function openPanel() {
  const [control] = controls();
  if (control === undefined) throw new Error('no control');
  await act(() => fireEvent.click(control));
  const panel = document.getElementById(control.getAttribute('aria-controls') ?? '');
  if (panel === null) throw new Error('no panel');
  return panel;
}

function mount(value: TemplateChoice | null = null, format: Formatters = createFormatters('en-GB', 'en-GB')) {
  const handlers = { onChoose: vi.fn(), onBack: vi.fn() };
  render(
    <I18nProvider messages={{ onboarding, shell }}>
      <TemplateStep value={value} format={format} {...handlers} />
    </I18nProvider>,
  );
  return handlers;
}

/** The formatters the onboarding screen builds for a plan in an English UI (`formatOf`, ADR-0023). */
async function planFormat(code: string) {
  const profile = await loadProfile(code);
  if (profile === null) throw new Error(`no profile ${code}`);
  const locales = localesFor('en', countryRules(profile));
  return createFormatters(locales.numbers, locales.ui);
}

describe('TemplateStep', () => {
  it('offers the four templates and your own coins, and continues only with a chosen one', async () => {
    const { onChoose, onBack } = mount();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    const next = screen.getByRole('button', { name: 'Continue' });
    expect(next.hasAttribute('disabled')).toBe(true);
    const cycle = TEMPLATES[2];
    if (cycle === undefined) throw new Error('four templates expected');
    await act(() => fireEvent.click(screen.getByRole('radio', { name: cycle.name })));
    await act(() => fireEvent.click(next));
    expect(onChoose).toHaveBeenCalledWith({ kind: 'template', id: cycle.id });
    await act(() => fireEvent.click(screen.getByRole('radio', { name: OWN })));
    await act(() => fireEvent.click(next));
    expect(onChoose).toHaveBeenLastCalledWith({ kind: 'custom' });
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Back' })));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('lists the cards alphabetically by name, never in the order of their risk (docs/LEGAL.md §3 item 3)', () => {
    mount();
    const names = TEMPLATES.map((template) => template.name);
    const alphabetical = [...names].sort(new Intl.Collator('en').compare);
    expect(alphabetical).not.toEqual(names);
    const shown = screen
      .getAllByRole('radio')
      .slice(0, -1)
      .map((card) => {
        const text = card.closest('[data-slot="radio-card"]')?.textContent ?? '';
        return names.find((name) => text.includes(name));
      });
    expect(shown).toEqual(alphabetical);
  });

  it('leads each card with its risk label, and words the template line once, after the cards, with the Risk link', () => {
    mount();
    const cards = screen.getAllByRole('radio');
    for (const template of TEMPLATES) {
      const card = screen.getByRole('radio', { name: template.name });
      const text = card.closest('[data-slot="radio-card"]')?.textContent ?? '';
      expect(text.indexOf(template.riskLabel)).toBeLessThan(text.indexOf(template.name));
      expect(text.indexOf(template.riskLabel)).toBeGreaterThanOrEqual(0);
    }
    expect(screen.getAllByText(LINE, { exact: false })).toHaveLength(1);
    const link = screen.getByRole('link', { name: 'Risk disclosure' });
    expect(link.getAttribute('href')).toBe('/risk');
    expect(link.parentElement?.textContent).toBe(`${LINE} Risk disclosure`);
    const last = cards.at(-1);
    if (last === undefined) throw new Error('five cards expected');
    expect(last.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows each template’s dated band after its line, composed in the plan’s formats and read with the card', () => {
    // A German plan in English: `−78 %` signed with U+2212 and the locale's no-break space, the serial comma of
    // English lists, and one window that holds every fall, from the earliest high to the latest low, with dates that
    // never break (LEGAL §4). The rows are literal (the mock above), so a review of a template's rows changes nothing
    // here: whole percents rounded from each row's fall, en-GB's own short month (`Sept`), and a window whose ends
    // need not come from the first row.
    const row = (coin: string, high: string, low: string, fall: string): ContentDrawdown => ({
      coin,
      high: high as ContentDrawdown['high'],
      low: low as ContentDrawdown['low'],
      fall: fall as ContentDrawdown['fall'],
      source: 'https://example.com/series',
      publisher: 'Example',
      accessed: '2026-01-01' as ContentDrawdown['accessed'],
    });
    literalRows.byId = {
      'btc-only-hold': [row('BTC', '2021-09-07', '2022-11-21', '77.6')],
      'two-coins': [row('BTC', '2021-11-10', '2022-06-18', '74.4'), row('ETH', '2021-09-03', '2022-12-30', '81.6')],
      'cycle-plan': [
        row('BTC', '2021-11-10', '2022-11-21', '77.2'),
        row('ETH', '2021-11-10', '2022-06-18', '81.8'),
        row('SOL', '2021-11-06', '2022-12-29', '96.4'),
        row('LINK', '2021-05-10', '2023-06-10', '90.6'),
      ],
      accumulate: [
        row('BTC', '2021-11-10', '2022-11-21', '78'),
        row('ETH', '2021-11-16', '2022-06-18', '82'),
        row('SOL', '2021-11-06', '2022-12-29', '97'),
      ],
    };
    mount(null, createFormatters('de-DE', 'en-GB'));
    const NB = ' ';
    const M = '−';
    const fall = (coin: string, value: number) => `${coin}${NB}${M}${value}${NB}%`;
    const day = (text: string) => text.replaceAll(' ', NB);
    const bands = {
      'btc-only-hold': `${fall('BTC', 78)}, high to low between ${day('7 Sept 2021')} and ${day('21 Nov 2022')}`,
      'two-coins': `${fall('BTC', 74)} and ${fall('ETH', 82)}, each high to low between ${day('3 Sept 2021')} and ${day('30 Dec 2022')}`,
      'cycle-plan': `${fall('BTC', 77)}, ${fall('ETH', 82)}, ${fall('SOL', 96)}, and ${fall('LINK', 91)}, each high to low between ${day('10 May 2021')} and ${day('10 Jun 2023')}`,
      accumulate: `${fall('BTC', 78)}, ${fall('ETH', 82)}, and ${fall('SOL', 97)}, each high to low between ${day('6 Nov 2021')} and ${day('29 Dec 2022')}`,
    };
    expect(TEMPLATES.map((template) => template.id).sort()).toEqual(Object.keys(bands).sort());
    for (const template of TEMPLATES) {
      const band = bands[template.id as keyof typeof bands];
      const card = screen.getByRole('radio', { name: template.name });
      const text = card.closest('[data-slot="radio-card"]')?.textContent ?? '';
      expect(text.endsWith(band), template.id).toBe(true);
      const line = screen.getByText(band, { normalizer: (text) => text }).closest('[id]')?.id ?? 'none';
      expect(card.getAttribute('aria-describedby')?.split(' ')).toContain(line);
    }
  });

  it('builds each card’s split line from split, in the plan’s formats', () => {
    // A German plan in English: the locale's no-break space in each share, the serial comma of English lists.
    mount(null, createFormatters('de-DE', 'en-GB'));
    const share = (coin: string, value: number) => `${coin}${NO_BREAK}${value}${NO_BREAK}%`;
    const lines = {
      'btc-only-hold': share('BTC', 100),
      'two-coins': `${share('BTC', 70)} and ${share('ETH', 30)}`,
      'cycle-plan': `${share('BTC', 40)}, ${share('ETH', 30)}, ${share('SOL', 15)}, and ${share('LINK', 15)}`,
      accumulate: `${share('BTC', 50)}, ${share('ETH', 30)}, and ${share('SOL', 20)}`,
    };
    expect(TEMPLATES.map((template) => template.id).sort()).toEqual(Object.keys(lines).sort());
    for (const template of TEMPLATES) {
      const line = lines[template.id as keyof typeof lines];
      const card = screen.getByRole('radio', { name: template.name });
      const text = card.closest('[data-slot="radio-card"]')?.textContent ?? '';
      const oneLine = fillTemplateDates(template.oneLine, template.dates, british.date);
      expect(text, template.id).toContain(`${oneLine}${line}${template.drawdowns[0]?.coin}`);
      expect(text, template.id).not.toContain('{date:');
    }
    cleanup();
    mount();
    const card = screen.getByRole('radio', { name: offered('two-coins').name });
    expect(card.closest('[data-slot="radio-card"]')?.textContent).toContain(`BTC${NO_BREAK}70% and ETH${NO_BREAK}30%`);
  });

  it('shows the picked template’s explanation behind one closed control, never for your own coins', async () => {
    mount();
    expect(controls()).toHaveLength(0);
    const two = offered('two-coins');
    await pick(two.name);
    expect(controls()).toHaveLength(1);
    expect(controls()[0]?.getAttribute('aria-expanded')).toBe('false');
    const paragraphs = paragraphsOf(fillTemplateDates(two.explanation, two.dates, british.date)).map((paragraph) =>
      paragraph.replaceAll(' %', '%'),
    );
    expect(screen.queryByText(paragraphs[0] ?? '')).toBeNull();
    const panel = await openPanel();
    expect(controls()[0]?.getAttribute('aria-expanded')).toBe('true');
    expect([...panel.querySelectorAll('p')].map((each) => each.textContent)).toEqual(paragraphs);
    // Another pick closes it again, and the control reads the new template.
    const cycle = offered('cycle-plan');
    await pick(cycle.name);
    expect(controls()).toHaveLength(1);
    expect(controls()[0]?.getAttribute('aria-expanded')).toBe('false');
    expect((await openPanel()).querySelectorAll('p')).toHaveLength(paragraphsOf(cycle.explanation).length);
    await pick(OWN);
    expect(controls()).toHaveLength(0);
  });

  describe('renders the paragraphs the figures check reads (paragraphsOf, round 5 of #340)', () => {
    /** The panel's paragraphs for an English explanation put in place of two-coins' own. */
    async function shown(explanation: string, format: Formatters = british) {
      const two = offered('two-coins');
      const texts = new Map([['two-coins', { ...two, explanation }]]);
      render(
        <I18nProvider messages={{ onboarding, shell }}>
          <TemplateStep
            value={{ kind: 'template', id: 'two-coins' }}
            format={format}
            texts={texts}
            onChoose={vi.fn()}
            onBack={vi.fn()}
          />
        </I18nProvider>,
      );
      return [...(await openPanel()).querySelectorAll('p')].map((each) => each.textContent);
    }

    it.each(['\n \n', '\r\n\r\n', '\n\t\n', '\n\n\n', '\n\n\n\n'])(
      '%j ends a paragraph, as the check reads it, with no empty one and no duplicate key',
      async (separator) => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const explanation = `A first paragraph.${separator}A second paragraph.`;
        const paragraphs = await shown(explanation);
        const logged = error.mock.calls.flat().map(String).join('\n');
        error.mockRestore();
        expect(paragraphs).toEqual(paragraphsOf(explanation));
        expect(paragraphsOf(explanation)).toEqual(['A first paragraph.', 'A second paragraph.']);
        expect(logged).not.toMatch(/same key/);
      },
    );

    it('still writes a percentage after a \\r\\n\\r\\n break with format.percent', async () => {
      const german = createFormatters('de-DE', 'en-GB');
      const paragraphs = await shown('A first paragraph.\r\n\r\nBitcoin takes 97 % of each amount.', german);
      expect(paragraphs).toEqual(['A first paragraph.', `Bitcoin takes 97${NO_BREAK}% of each amount.`]);
    });

    it('formats the token the content check accepts, read through formatPercentTokens (25r G)', async () => {
      const german = createFormatters('de-DE', 'en-GB');
      vi.mocked(formatPercentTokens).mockClear();
      const paragraphs = await shown('Bitcoin takes 60 % of each amount;\n40\t% goes into Ethereum.', german);
      expect(paragraphs).toEqual([`Bitcoin takes 60${NO_BREAK}% of each amount; 40${NO_BREAK}% goes into Ethereum.`]);
      expect(vi.mocked(formatPercentTokens)).toHaveBeenCalledWith(
        'Bitcoin takes 60 % of each amount; 40 % goes into Ethereum.',
        expect.any(Function),
      );
    });

    it('keeps the live cycle-plan and two-coins panels at 3 and 2 paragraphs, each as before', async () => {
      for (const [id, count] of [
        ['cycle-plan', 3],
        ['two-coins', 2],
      ] as const) {
        const template = offered(id);
        mount({ kind: 'template', id });
        const before = fillTemplateDates(template.explanation, template.dates, british.date)
          .split('\n\n')
          .map((paragraph) => paragraph.replaceAll(' %', '%'));
        const panel = [...(await openPanel()).querySelectorAll('p')].map((each) => each.textContent);
        expect(panel, id).toHaveLength(count);
        expect(panel, id).toEqual(before);
        cleanup();
      }
    });
  });

  it('writes the explanation’s percentages in the plan’s format', async () => {
    mount({ kind: 'template', id: 'cycle-plan' }, createFormatters('de-DE', 'en-GB'));
    const german = (await openPanel()).textContent ?? '';
    expect(german).toContain(`40${NO_BREAK}% Bitcoin, 30${NO_BREAK}% Ethereum`);
    expect(german).toContain(`Solana fell 97${NO_BREAK}% from`);
    expect(german).not.toMatch(/\d %/);
    cleanup();
    mount({ kind: 'template', id: 'cycle-plan' });
    const english = (await openPanel()).textContent ?? '';
    expect(english).toContain('40% Bitcoin, 30% Ethereum, 15% Solana, and 15% Chainlink');
  });

  it('writes the texts’ dates in the UI language’s format whatever the plan’s country (ADR-0023)', async () => {
    const card = () =>
      screen.getByRole('radio', { name: offered('cycle-plan').name }).closest('[data-slot="radio-card"]');
    for (const code of ['US', 'PT', 'GB']) {
      mount({ kind: 'template', id: 'cycle-plan' }, await planFormat(code));
      expect(card()?.textContent).toContain(
        `until 1${NO_BREAK}Jun${NO_BREAK}2028, held, then sold in thirds from 1${NO_BREAK}Jun${NO_BREAK}2029 to 31${NO_BREAK}Oct${NO_BREAK}2029.`,
      );
      const panel = (await openPanel()).textContent ?? '';
      expect(panel).toContain(
        `its high on 10${NO_BREAK}May${NO_BREAK}2021 to its low on 10${NO_BREAK}Jun${NO_BREAK}2023.`,
      );
      expect(panel).not.toContain('{date:');
      cleanup();
    }
  });

  it('writes the texts’ dates from the template’s fields, never breaking one', async () => {
    const card = () =>
      screen.getByRole('radio', { name: offered('cycle-plan').name }).closest('[data-slot="radio-card"]');
    mount({ kind: 'template', id: 'cycle-plan' });
    expect(card()?.textContent).toContain(
      `until 1${NO_BREAK}Jun${NO_BREAK}2028, held, then sold in thirds from 1${NO_BREAK}Jun${NO_BREAK}2029 to 31${NO_BREAK}Oct${NO_BREAK}2029.`,
    );
    const english = (await openPanel()).textContent ?? '';
    expect(english).toContain(
      `thirds to sell from 1${NO_BREAK}Jun${NO_BREAK}2029, from 1${NO_BREAK}Aug${NO_BREAK}2029, and from 1${NO_BREAK}Oct${NO_BREAK}2029,`,
    );
    expect(english).not.toContain('{date:');
  });

  it('offers your own coins as the last card, after the alphabetical templates, with no risk label', () => {
    mount({ kind: 'custom' });
    const own = screen.getByRole('radio', { name: OWN });
    expect(screen.getAllByRole('radio').at(-1)).toBe(own);
    expect(own.getAttribute('aria-checked')).toBe('true');
    const text = own.closest('[data-slot="radio-card"]')?.textContent ?? '';
    expect(text).toBe('Your own coinsYou choose the coins and how each buy is split across them.');
  });
});

describe('TemplateStep in pt-PT (ADR-0057)', () => {
  /** The formatters the onboarding screen builds for a Portuguese plan in a pt-PT UI (`formatOf`, ADR-0023). */
  async function portugal() {
    const profile = await loadProfile('PT', 'pt-PT');
    if (profile === null) throw new Error('no profile PT');
    const locales = localesFor('pt-PT', countryRules(profile));
    return createFormatters(locales.numbers, locales.ui);
  }

  async function mountPortuguese(value: TemplateChoice | null = null) {
    const [texts, format] = await Promise.all([loadTemplateTexts('pt-PT'), portugal()]);
    render(
      <I18nProvider locale="pt-PT" messages={{ onboarding: portuguese, shell }}>
        <TemplateStep value={value} format={format} texts={texts} onChoose={vi.fn()} onBack={vi.fn()} />
      </I18nProvider>,
    );
    return { texts, format };
  }

  it('shows the translated name, risk label and line of each card, sorted by the name shown', async () => {
    const { texts } = await mountPortuguese();
    const shown = TEMPLATES.map((template) => texts.get(template.id));
    const names = shown.map((text) => text?.name ?? '');
    expect(names).not.toContain(TEMPLATES[0]?.name);
    const cards = screen
      .getAllByRole('radio')
      .slice(0, -1)
      .map((card) => card.closest('[data-slot="radio-card"]')?.textContent ?? '');
    expect(cards.map((text) => names.find((name) => text.includes(name)))).toEqual(
      [...names].sort(new Intl.Collator('pt-PT').compare),
    );
    for (const text of shown) {
      expect(cards.some((card) => card.includes(text?.riskLabel ?? '?'))).toBe(true);
    }
    expect(document.body.textContent).not.toContain('no sell window');
  });

  it('writes the explanation’s percentages with format.percent, never the file’s literal `N %`', async () => {
    const { format } = await mountPortuguese({ kind: 'template', id: 'cycle-plan' });
    await act(() => fireEvent.click(screen.getByRole('button', { name: portuguese.template.about })));
    const text = document.body.textContent ?? '';
    const percent = (share: string) => format.percent(decimal(share), { decimals: 0 });
    expect(text).toContain(`${percent('40')} bitcoin, ${percent('30')} Ethereum, ${percent('15')} Solana`);
    expect(text).toContain(`A Solana caiu ${percent('97')} do máximo`);
    expect(text).not.toMatch(/\d %/);
  });
});

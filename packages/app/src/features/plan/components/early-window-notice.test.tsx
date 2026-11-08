// @vitest-environment jsdom
import type { CalendarDate } from '@proofofcalm/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createFormatters } from '../../../lib/format';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import plan from '../../../messages/en/plan.json';
import shell from '../../../messages/en/shell.json';
import type { HoldingCountry } from '../lib/holding';
import type { EarlyNotice } from '../lib/sell-window';
import { EarlyWindowNotice, type EarlyWindowNoticeProps } from './early-window-notice';

// The notice of a sell window that opens before the last buy passes the holding rule (docs/DOMAIN.md §2.1):
// its two dates in calendar order, what passing the rule means under the rule as Hold & sell names it, the other
// way out, and the acceptance the save waits for, held by the host.

afterEach(cleanup);

const day = (text: string) => text as CalendarDate;

const EARLY: EarlyNotice = {
  eligibleOn: day('2031-01-05'),
  effect: 'exempt',
  opensOn: day('2029-09-01'),
  rule: 'country',
};
const PORTUGAL: HoldingCountry = {
  code: 'PT',
  name: 'Portugal',
  rule: { kind: 'days', days: 365, effect: 'exempt' },
  reviewed: '16\u00a0Oct\u00a02026',
  source: 'https://example.org/holding-rule',
  conditions: [
    'Tax-free only when the counterparty is tax-resident in the EU, the EEA, or a treaty jurisdiction.',
    'Exempt sales must still be declared.',
    'A swap starts a new holding period for the coins received.',
    'Loss of Portuguese tax residence counts as a disposal.',
  ],
};
const [FIRST, SECOND] = PORTUGAL.conditions as [string, string];
const NOTE = 'Computed from your dates, not tax advice';
type Shown = Partial<EarlyNotice> &
  Partial<Pick<EarlyWindowNoticeProps, 'on' | 'format' | 'taxLine' | 'countryChange'>>;

function Host({ invalid, seen, shown }: { invalid: boolean | undefined; seen: boolean[]; shown: Shown }) {
  const [accepted, setAccepted] = useState(false);
  const accept = (next: boolean) => {
    setAccepted(next);
    seen.push(next);
  };
  return (
    <EarlyWindowNotice {...EARLY} on="lastBuy" {...shown} accepted={accepted} onAccept={accept} invalid={invalid} />
  );
}

function mount(invalid?: boolean, shown: Shown = {}) {
  const seen: boolean[] = [];
  render(
    <ServicesProvider services={createTestServices({ snapshot: fixtureSnapshot() })}>
      <I18nProvider messages={{ plan, shell }}>
        <Host invalid={invalid} seen={seen} shown={shown} />
      </I18nProvider>
    </ServicesProvider>,
  );
  return seen;
}

describe('EarlyWindowNotice', () => {
  it('says when the window opens and when the last buy passes the rule, and describes the acceptance with it', () => {
    mount();
    const notice = screen.getByText(
      'The sell window opens on 1 Sept 2029. This last buy is tax-free from 5 Jan 2031 under your ' +
        "plan's holding rule. You can also choose an earlier last buy.",
    );
    const box = screen.getByRole('checkbox', {
      name: 'Open the sell window on 1\u00a0Sept\u00a02029, before this last buy passes the holding rule',
    });
    expect(box.getAttribute('aria-checked')).toBe('false');
    expect(box.getAttribute('aria-describedby')).toBe(notice.id);
    expect(box.getAttribute('aria-invalid')).toBeNull();
  });

  it('hands the acceptance to the host, and back', () => {
    const seen = mount();
    const box = screen.getByRole('checkbox');
    fireEvent.click(box);
    expect(box.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByText(/^Open the sell window/));
    expect(seen).toEqual([true, false]);
  });

  it("names the long-term rate, the general profile's rule or the own, and a later opening on Hold & sell", () => {
    mount(undefined, { on: 'window', effect: 'lower-rate', rule: 'generic' });
    const rest = 'You can also choose a later opening date.';
    expect(
      screen.getByText(
        'The sell window opens on 1 Sept 2029. Your last buy is at the long-term rate from 5 Jan 2031 under the ' +
          `general profile's rule. ${rest}`,
      ),
    ).toBeDefined();
    expect(screen.getByRole('checkbox', { name: /before your last buy passes the holding rule$/ })).toBeDefined();
    cleanup();
    mount(undefined, { on: 'window', rule: 'own' });
    const own = 'The sell window opens on 1 Sept 2029. Your last buy is tax-free from 5 Jan 2031 under your own rule.';
    expect(screen.getByText(`${own} ${rest}`)).toBeDefined();
  });

  it("names the template's last buy and another starting point on onboarding's template path", () => {
    mount(undefined, { on: 'template' });
    expect(
      screen.getByText(
        "The sell window opens on 1 Sept 2029. The template's last buy is tax-free from 5 Jan 2031 under your " +
          "plan's holding rule. You can also choose another starting point.",
      ),
    ).toBeDefined();
    expect(
      screen.getByRole('checkbox', {
        name: "Open the sell window on 1\u00a0Sept\u00a02029, before the template's last buy passes the holding rule",
      }),
    ).toBeDefined();
    expect(screen.getByText("Computed from the template's dates, not tax advice")).toBeDefined();
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it("dates with the formatters it is given, as onboarding gives the chosen country's", () => {
    mount(undefined, { on: 'template', format: createFormatters('en-GB', 'en-US') });
    expect(screen.getByText(/^The sell window opens on Sep 1, 2029\. .* tax-free from Jan 5, 2031 /)).toBeDefined();
  });

  it("names the country's rule, then the note and the country's date line with its Sources, above the checkbox", () => {
    mount(undefined, { on: 'window', country: PORTUGAL });
    const notice = screen.getByText(
      "The sell window opens on 1 Sept 2029. Your last buy is tax-free from 5 Jan 2031 under Portugal's rule. " +
        'You can also choose a later opening date.',
    );
    const note = screen.getByText(NOTE);
    const sources = screen.getByRole('link', { name: 'Sources' });
    expect(sources.parentElement?.textContent).toBe(
      'Reviewed on 16\u00a0Oct\u00a02026 · general information, not advice · Sources',
    );
    expect(sources.getAttribute('href')).toBe('https://example.org/holding-rule');
    const order = [notice, note, screen.getByText(FIRST), sources, screen.getByRole('checkbox')];
    for (const [index, element] of order.slice(1).entries()) {
      expect(order[index]?.compareDocumentPosition(element)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
    expect(screen.getByRole('checkbox').getAttribute('aria-describedby')).toBe(notice.id);
  });

  it("shows the country's first condition under the note and the rest behind one control", async () => {
    // docs/LEGAL.md §4: the conditions on the date, the first in full, under the "not tax advice" line.
    mount(undefined, { on: 'window', country: PORTUGAL });
    expect(screen.getByText(FIRST)).toBeDefined();
    expect(screen.queryByText(SECOND)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more conditions' }));
    expect(await screen.findByText(SECOND)).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('shows no condition for a country without any', () => {
    mount(undefined, { country: { ...PORTUGAL, conditions: [] } });
    expect(screen.queryByText(FIRST)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'Sources' })).toBeDefined();
  });

  it('leaves the note and the conditions to its host when it shows the note itself', () => {
    mount(undefined, { country: PORTUGAL, taxLine: false });
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.queryByText(FIRST)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'Sources' })).toBeDefined();
  });

  it("names the plan's holding rule without a country, with the note and no date line", () => {
    mount();
    expect(screen.getByText(/under your plan's holding rule\./)).toBeDefined();
    expect(screen.getByText(NOTE)).toBeDefined();
    expect(screen.queryByText(/^Reviewed on/)).toBeNull();
  });

  it("shows no country's date line and no condition under the person's own rule", () => {
    mount(undefined, { rule: 'own', country: PORTUGAL });
    expect(screen.getByText(/under your own rule\./)).toBeDefined();
    expect(screen.queryByText(/^Reviewed on/)).toBeNull();
    expect(screen.queryByText(FIRST)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(NOTE)).toBeDefined();
  });

  it('marks the acceptance invalid when a save waits for it, and says what it waits for', () => {
    mount(true);
    const box = screen.getByRole('checkbox');
    expect(box.getAttribute('aria-invalid')).toBe('true');
    const refusal = screen.getByRole('alert');
    expect(refusal.textContent).toBe('Tick the box to open the sell window early, or choose an earlier last buy.');
    const notice = screen.getByText(/^The sell window opens on/);
    expect(box.getAttribute('aria-describedby')).toBe(`${notice.id} ${refusal.id}`);
  });

  it.each([
    ['template', 'Tick the box to open the sell window early, or choose another starting point.'],
    ['window', 'Tick the box to open the sell window early, or choose a later opening date.'],
  ] as const)('names the other way out of a refusal on %s', (on, line) => {
    mount(true, { on });
    expect(screen.getByRole('alert').textContent).toBe(line);
  });

  it('sends a refused country change to Hold & sell, which has the opening date', () => {
    mount(true, { on: 'window', countryChange: true });
    expect(
      screen.getByText(
        "The sell window opens on 1 Sept 2029. Your last buy is tax-free from 5 Jan 2031 under your plan's " +
          'holding rule. You can also cancel this change and choose a later opening date on Hold & sell.',
      ),
    ).toBeDefined();
    expect(screen.getByRole('alert').textContent).toBe(
      'Tick the box to open the sell window early, or cancel this change and choose a later opening date on Hold & sell.',
    );
  });

  it('shows no refusal line while nothing waits for the acceptance', () => {
    mount(false);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/^Tick the box/)).toBeNull();
  });
});

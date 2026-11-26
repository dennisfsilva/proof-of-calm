import { countryRules, loadProfile } from '@proofofcalm/content';
import type { CalendarDate, Entry, Instant } from '@proofofcalm/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters';
import type { Snapshot } from '../../../lib/ports';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import { LogScreen } from './log-screen';

// The Log at 360 and 1280 px, light and dark, with axe: the fixture plan in the buying phase with
// Portugal's rules as the browser loads them, one row opened; a plan with no entries yet; a plan with
// only July's skip, which stays listed under the empty line; no plan; 250 more buys, shown 100 at a time.

const portugal = async () => {
  const profile = await loadProfile('PT');
  return profile === null ? null : countryRules(profile);
};

const services = (snapshot: Snapshot) => () =>
  createTestServices({ snapshot, nowMs: fixtureNowMs('buy'), rules: portugal });

const meta = {
  title: 'Features/Log/LogScreen',
  component: LogScreen,
  parameters: { path: '/log' },
} satisfies Meta<typeof LogScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithEntries: Story = {
  parameters: { services: services(fixtureSnapshot()) },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('columnheader', { name: 'July\u00a02026' })).toBeVisible());
    // The newest row is September's sale, which has no holding date; the monthly purchase under it has.
    const [purchase] = canvas.getAllByRole('button', { name: /Monthly buy/ });
    await userEvent.click(purchase as HTMLElement);
    const detail = within(document.getElementById(purchase?.getAttribute('aria-controls') ?? '') as HTMLElement);
    // The holding date shows once the rules have loaded (ADR-0020 readings, "The first-boot gate").
    const date = await detail.findByText(/^Tax-free from /);
    await expect(date).toBeVisible();
    // Its Why? stands right after the date with the 44 px target (#24 D8, docs/DESIGN.md §6).
    const why = detail.getByRole('button', { name: 'Why? The tax-free date' });
    await expect(date.nextElementSibling).toBe(why);
    await expect(why).toBeVisible();
    const target = why.getBoundingClientRect();
    await expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(44);
    await expect(detail.getByText('Computed from your dates, not tax advice')).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Edit entry' })).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Delete entry' })).toBeVisible();
  },
};

/** The Record button opens the entry form on October's open monthly buy. */
export const RecordSheet: Story = {
  parameters: { services: services(fixtureSnapshot()) },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Record a purchase' }));
    const sheet = within(await within(document.body).findByRole('dialog'));
    await expect(sheet.getByText('Log the monthly buy')).toBeVisible();
    // The choice of kinds while coins are held, on the open action's kind (docs/CONTENT-STYLE.md §3).
    const kinds = within(sheet.getByRole('group', { name: 'Type of transaction' })).getAllByRole('button');
    await expect(kinds.map((option) => option.textContent)).toEqual(['Monthly buy', 'Extra buy', 'Sale']);
    await expect(sheet.getByRole('button', { name: 'Monthly buy' })).toHaveAttribute('aria-pressed', 'true');
    // Portugal's number format, fixed as the form opened.
    await expect(sheet.getByLabelText('BTC cost before fees (EUR)')).toHaveValue('70,00');
  },
};

const plan = fixtureSnapshot().plan;

/** The fixture's 8 transactions and 250 extra buys, one a day before its first buy day: 258 in windows of 100. */
const withBuys = (count: number): Snapshot => {
  const snapshot = fixtureSnapshot();
  const [first] = snapshot.entries as [Entry];
  const more = Array.from({ length: count }, (_, index): Entry => {
    const date = new Date(Date.UTC(2026, 3, 4) - index * 86_400_000).toISOString().slice(0, 10) as CalendarDate;
    const id = `00000000-0000-4000-8000-${String(800_000 + index).padStart(12, '0')}` as Entry['id'];
    return { ...first, id, kind: 'extra', slot: null, date, deletedAt: null };
  });
  return { ...snapshot, entries: [...snapshot.entries, ...more] };
};

export const ShowAllInWindows: Story = {
  parameters: { services: services(withBuys(250)) },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Show all 258 entries, 100 at a time' }));
    await expect(await canvas.findByText('Entries 1 to 100 of 258')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Show older entries' }));
    await expect(await canvas.findByText('Entries 101 to 200 of 258')).toBeVisible();
    await waitFor(() => expect(canvas.getAllByRole('button', { expanded: false })[0]).toHaveFocus());
    await expect(canvas.getByRole('button', { name: 'Show newer entries' })).toBeVisible();
    await expect(canvas.getByRole('combobox', { name: 'Go to year' })).toHaveTextContent('2026');
  },
};

export const NoEntriesYet: Story = {
  parameters: {
    services: services({
      ...EMPTY_SNAPSHOT,
      plan: plan && { ...plan, firstBuy: '2026-11-05' as CalendarDate, skips: [] },
    }),
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/^No entries yet\. Your first buy day is /)).toBeVisible();
  },
};

export const OnlySkips: Story = {
  parameters: { services: services({ ...fixtureSnapshot(), entries: [] }) },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/^No entries yet\. Your first buy day was /)).toBeVisible();
    await expect(canvas.getByRole('columnheader', { name: 'July\u00a02026' })).toBeVisible();
    await expect(canvas.getByText('Skipped')).toBeVisible();
  },
};

const SET_ASIDE_AT = '2026-10-01T08:00:00.000Z' as Instant;

// A saved entry could not be read and is still missing: how to bring it back and Hide this line, which moves
// focus to the title (ADR-0019 Readings, 2026-11-26).
export const SetAside: Story = {
  parameters: {
    services: services({
      ...fixtureSnapshot(),
      quarantined: 1,
      setAside: { plans: [], entries: [{ id: 'gone', at: SET_ASIDE_AT }] },
    }),
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/^1 saved entry could not be read/)).toBeVisible();
    const hide = canvas.getByRole('button', { name: 'Hide this line' });
    await expect(
      Math.min(hide.getBoundingClientRect().width, hide.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
    await userEvent.click(hide);
    await waitFor(() => expect(canvas.queryByText(/^1 saved entry could not be read/)).toBeNull());
    await expect(canvas.getByRole('heading', { level: 1, name: 'Log' })).toHaveFocus();
  },
};

// The plan row could not be read and the entries are stored: the empty text says why none is listed.
export const PlanSetAside: Story = {
  parameters: {
    services: services({
      ...fixtureSnapshot(),
      plan: null,
      quarantined: 1,
      setAside: { plans: [{ id: 'plan', at: SET_ASIDE_AT }], entries: [] },
    }),
  },
  play: async ({ canvas }) => {
    const text = await canvas.findByText(
      /^Your plan could not be read, so no entries are listed\. They stay on this device\. Import a JSON backup in/,
    );
    await expect(text).toBeVisible();
    await expect(within(text).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  },
};

export const NoPlan: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('No entries yet. Set up a plan or import a file.')).toBeVisible();
  },
};

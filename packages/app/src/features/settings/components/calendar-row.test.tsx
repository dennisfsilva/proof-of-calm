// @vitest-environment jsdom
import { type CalendarDate, type EntityId, endBuying, type Instant, type Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemClock } from '../../../lib/adapters/clock';
import { EMPTY_SNAPSHOT } from '../../../lib/adapters/memory-store';
import { I18nProvider } from '../../../lib/i18n';
import type { Snapshot } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, recordingPlatform } from '../../../lib/services/testing';
import plan from '../../../messages/en/plan.json';
import settings from '../../../messages/en/settings.json';
import { CalendarRow } from './calendar-row';

// Settings' calendar reminder (ADR-0003): the plan's calendar file again, for a plan started with Later or
// whose buy day changed since; the file is made from the plan as stored when the button is pressed.

afterEach(cleanup);

const NONE_LEFT = 'No buy days left, so there is no reminder to add.';
const PAUSED =
  'The buy days left are paused, so there is no reminder to add. After you resume the plan, you can add it here.';
const endedLine = (date: string) =>
  new RegExp(
    `^Buying ended on ${date}, so there is no reminder to add\\. If you added the calendar file, your calendar keeps its events after that day; delete them there\\.$`,
  );
const ENDED = endedLine('20\\sOct\\s2026');
const ENDED_5_NOV = endedLine('5\\sNov\\s2026');
const fixtureNow = new Date(fixtureNowMs('buy')).toISOString() as Instant;

/** The fixture plan paused from 20 October 2026 until resumed. */
function pausedSnapshot(): Snapshot {
  const snapshot = fixtureSnapshot();
  const pause = { id: '00000000-0000-4000-8000-000000003000' as EntityId, from: '2026-10-20' as CalendarDate };
  return { ...snapshot, plan: snapshot.plan && { ...snapshot.plan, pauses: [{ ...pause, until: null, note: '' }] } };
}
const add = () => act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add to calendar' })));

type MountOptions = { snapshot?: Snapshot; saves?: boolean; nowMs?: number; clock?: Services['clock'] };

async function mount({
  snapshot = fixtureSnapshot(),
  saves = true,
  nowMs = fixtureNowMs('buy'),
  clock,
}: MountOptions = {}) {
  const platform = { ...recordingPlatform(), download: vi.fn(async (..._: [string, string, string]) => saves) };
  const services: Services = createTestServices({ snapshot, platform, nowMs, ...(clock && { clock }) });
  await services.start();
  const view = render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ plan, settings }}>
        <CalendarRow />
      </I18nProvider>
    </ServicesProvider>,
  );
  return { services, download: platform.download, view };
}

describe('CalendarRow', () => {
  it("downloads the stored plan's calendar file on its buy day", async () => {
    const { download } = await mount();
    expect(screen.getByRole('heading', { level: 2, name: 'Calendar reminder' })).toBeDefined();
    await add();
    expect(download).toHaveBeenCalledOnce();
    const [name, file, type] = download.mock.calls[0] ?? [];
    expect([name, type]).toEqual(['proof-of-calm-reminder.ics', 'text/calendar']);
    expect(file).toMatch(/^UID:00000000-0000-4000-8000-000000001000\r$/m);
    expect(file).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=5;');
    expect(file).toContain('SUMMARY:Your buy day');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Calendar file saved.');
  });

  it('carries the new buy day once a change of it is saved', async () => {
    const { services, download } = await mount();
    await act(() => services.domain.write(({ plan: stored }) => ({ plan: { ...(stored as Plan), buyDay: 12 } })));
    await add();
    expect(download.mock.calls[0]?.[1]).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=12;');
  });

  // Review finding 2 (#221, fix round 1): the saved line describes only the file on screen.
  it('clears the saved line once the stored plan changes the file (a new buy day)', async () => {
    const { services } = await mount();
    await add();
    expect(screen.getByRole('status').textContent).toBe('Calendar file saved.');
    await act(() => services.domain.write(({ plan: stored }) => ({ plan: { ...(stored as Plan), buyDay: 12 } })));
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('keeps the saved line on a write that leaves the file as it was, a minute later', async () => {
    let nowMs = fixtureNowMs('buy');
    const { services } = await mount({ clock: systemClock('Europe/Lisbon', () => nowMs) });
    await add();
    nowMs += 60_000;
    await act(() => services.domain.write(({ plan: stored }) => ({ plan: { ...(stored as Plan) } })));
    expect(screen.getByRole('status').textContent).toBe('Calendar file saved.');
  });

  // Review finding (#221, fix round 2): a file of several events carries a DTSTAMP in each of them. A first buy
  // off the buy day, not yet reached (a plan started with Later), is the one such file: the stored buy day is
  // at most 28, so every later slot falls on it.
  it('keeps the saved line a minute later in a file of two events (a first buy off the buy day)', async () => {
    const snapshot = fixtureSnapshot();
    const dates = { firstBuy: '2026-10-20' as CalendarDate, buyDay: 1, lastBuy: '2027-03-01' as CalendarDate };
    const stored: Plan = { ...(snapshot.plan as Plan), ...dates, skips: [] };
    let nowMs = Date.parse('2026-10-17T10:00:00Z');
    const { services, download } = await mount({
      snapshot: { ...snapshot, plan: stored, entries: [] },
      clock: systemClock('Europe/Lisbon', () => nowMs),
    });
    await add();
    expect(download.mock.calls[0]?.[1].match(/^DTSTAMP:/gm)?.length).toBeGreaterThan(1);
    nowMs += 60_000;
    await act(() => services.domain.write(({ plan: current }) => ({ plan: { ...(current as Plan) } })));
    expect(screen.getByRole('status').textContent).toBe('Calendar file saved.');
  });

  it('clears the saved line after a pause and a resume, though the file is the same again', async () => {
    const { services } = await mount();
    await add();
    const paused = pausedSnapshot().plan as Plan;
    await act(() =>
      services.domain.write(({ plan: stored }) => ({ plan: { ...(stored as Plan), pauses: paused.pauses } })),
    );
    expect(screen.getByText(PAUSED)).toBeDefined();
    await act(() => services.domain.write(({ plan: stored }) => ({ plan: { ...(stored as Plan), pauses: [] } })));
    expect(screen.getByRole('button', { name: 'Add to calendar' })).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('says so when the device saved no file', async () => {
    await mount({ saves: false });
    await add();
    expect(screen.getByRole('alert').textContent).toBe('The calendar file was not saved. Add it again.');
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('during an open pause, says the buy days left are paused and offers no file', async () => {
    const { download } = await mount({ snapshot: pausedSnapshot() });
    expect(screen.getByText(PAUSED)).toBeDefined();
    expect(screen.queryByText(NONE_LEFT)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to calendar' })).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  it('states that no buy day is left and offers no file past the last buy', async () => {
    const { download } = await mount({ nowMs: fixtureNowMs('sell') });
    expect(screen.getByText(NONE_LEFT)).toBeDefined();
    expect(screen.queryByText(PAUSED)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to calendar' })).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  // Integration read finding 3 (#225): an end leaves the events of a file added earlier in the calendar.
  it('after an end, says buying ended and that a calendar file keeps its events, and offers no file', async () => {
    const snapshot = fixtureSnapshot();
    const ended = endBuying(snapshot.plan as Plan, '2026-10-20' as CalendarDate, fixtureNow);
    if (!ended.ok) throw new Error(ended.error.code);
    const { download } = await mount({ snapshot: { ...snapshot, plan: ended.value } });
    expect(screen.getByText(ENDED)).toBeDefined();
    expect(screen.queryByText(NONE_LEFT)).toBeNull();
    expect(screen.queryByText(PAUSED)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to calendar' })).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  // Review finding (#227): an ended plan cannot be resumed, so a pause over its last buy day says buying ended.
  it('says buying ended, not paused, for a plan ended on a buy day inside an open pause', async () => {
    const snapshot = pausedSnapshot();
    const ended = endBuying(snapshot.plan as Plan, '2026-11-05' as CalendarDate, fixtureNow);
    if (!ended.ok) throw new Error(ended.error.code);
    await mount({ snapshot: { ...snapshot, plan: ended.value }, nowMs: Date.parse('2026-11-05T10:00:00Z') });
    expect(screen.getByText(ENDED_5_NOV)).toBeDefined();
    expect(screen.queryByText(PAUSED)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to calendar' })).toBeNull();
  });

  // Integration read finding (#227): the end keeps today's buy day open in the app, but offers no calendar file.
  it('says buying ended and offers no file on the day of an end that falls on an open buy day', async () => {
    const snapshot = fixtureSnapshot();
    const ended = endBuying(snapshot.plan as Plan, '2026-11-05' as CalendarDate, fixtureNow);
    if (!ended.ok) throw new Error(ended.error.code);
    const { download } = await mount({
      snapshot: { ...snapshot, plan: ended.value },
      nowMs: Date.parse('2026-11-05T10:00:00Z'),
    });
    expect(screen.getByText(ENDED_5_NOV)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add to calendar' })).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  it('renders nothing without a plan', async () => {
    const empty: Snapshot = EMPTY_SNAPSHOT;
    const { view } = await mount({ snapshot: empty });
    expect(view.container.childElementCount).toBe(0);
  });
});

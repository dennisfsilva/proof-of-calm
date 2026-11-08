// @vitest-environment jsdom
import { loadProfile, templateById } from '@proofofcalm/content';
import { type CalendarDate, EntityIdSchema, type Instant, type Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNumberInput } from '../../../lib/format';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices, recordingPlatform } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import onboarding from '../../../messages/en/onboarding.json';
import { reminderFile } from '../../plan';
import { emptyDraft, startPlan } from '../model/setup';
import { ReminderStep } from './reminder-step';

afterEach(cleanup);

const TODAY = '2026-10-20' as CalendarDate;
const NOW = '2026-10-20T10:00:00.000Z' as Instant;
const ID = EntityIdSchema.parse('00000000-0000-4000-8000-0000000000aa');
const NONE_LEFT = 'No buy days left, so there is no reminder to add.';
const WORDS = { summary: 'Your buy day', description: 'It is your buy day. Open Proof of Calm to record it.' };

/** Portugal, the two-coin template, 100 a month from 5 Nov 2026: buy day 5. */
async function plan(): Promise<Plan> {
  const profile = await loadProfile('PT');
  const template = templateById('two-coins');
  if (profile === null || template === null) throw new Error('No profile or template');
  const draft = { ...emptyDraft(TODAY, ID, 'PT'), templateId: 'two-coins', monthly: '100', firstBuy: '2026-11-05' };
  const result = startPlan(
    { ...draft, lastBuy: '2036-10-05' },
    { profile, template, numberInput: createNumberInput('en-GB'), today: TODAY, now: NOW },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function mount(file: string | null, saves = true) {
  const platform = { ...recordingPlatform(), download: vi.fn(async () => saves) };
  const handlers = { onAdd: vi.fn(), onLater: vi.fn(), onBack: vi.fn() };
  render(
    <ServicesProvider services={createTestServices({ platform })}>
      <I18nProvider messages={{ errors, onboarding }}>
        <ReminderStep file={file} {...handlers} />
      </I18nProvider>
    </ServicesProvider>,
  );
  return { ...handlers, download: platform.download };
}

describe('ReminderStep', () => {
  it("downloads the plan's calendar file: its UID is the draft's id, monthly on the buy day, no amount", async () => {
    const file = reminderFile(await plan(), TODAY, NOW, WORDS);
    expect(file).toMatch(new RegExp(`^UID:${ID}\\r$`, 'm'));
    expect(file).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=5;');
    expect(file).not.toMatch(/\b100\b|EUR|BTC|ETH/);
    const { download, onAdd, onLater } = mount(file);
    expect(screen.getByRole('heading', { level: 2, name: 'Where should the monthly reminder go?' })).toBeDefined();
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Add to calendar' })));
    expect(download).toHaveBeenCalledWith('proof-of-calm-reminder.ics', file, 'text/calendar');
    expect([onAdd.mock.calls.length, onLater.mock.calls.length]).toEqual([1, 0]);
  });

  it('stays on the step with the not-saved line when the platform saves no file', async () => {
    const { onAdd } = mount('BEGIN:VCALENDAR', false);
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Add to calendar' })));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'The calendar file was not saved. Add it again, or choose Later.',
    );
  });

  it('states the case in the heading and the line when no buy day is left, and Continue downloads nothing', async () => {
    const { download, onLater } = mount(null);
    const heading = screen.getByRole('heading', { level: 2, name: 'Monthly reminder' });
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(screen.getByText(NONE_LEFT)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add to calendar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Continue' })).toHaveLength(1);
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Continue' })));
    expect(onLater).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
  });

  it('keeps the question heading and shows the no-buy-day line only when no buy day is left', () => {
    mount('BEGIN:VCALENDAR');
    expect(screen.getByRole('heading', { level: 2, name: 'Where should the monthly reminder go?' })).toBeDefined();
    expect(screen.queryByText(NONE_LEFT)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });
});

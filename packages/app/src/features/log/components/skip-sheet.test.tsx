// @vitest-environment jsdom
import { type MonthKey, NOTE_MAX_LENGTH, slotStatuses } from '@proofofcalm/core';
import { Toaster } from '@proofofcalm/ui/components/toast';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { type Services, ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import log from '../../../messages/en/log.json';
import { LogScreen } from './log-screen';
import { SkipSheet } from './skip-sheet';

// Skip a month (docs/DOMAIN.md §6, docs/CONTENT-STYLE.md §3 "Skip a month") on the fixture plan on 20 October
// 2026, whose October buy (due 5 October) is late: the note shows in the Log, and the toast's Undo opens the
// month again within UNDO_WINDOW_MS.

beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const OCTOBER = '2026-10' as MonthKey;

async function mount(slot: MonthKey = OCTOBER) {
  const services: Services = createTestServices({ snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') });
  await act(() => services.start());
  render(
    <ServicesProvider services={services}>
      <I18nProvider messages={{ errors, log }}>
        <Toaster closeLabel="Close" toastManager={services.toasts}>
          <LogScreen />
          <SkipSheet slot={slot} open onOpenChange={() => undefined} />
        </Toaster>
      </I18nProvider>
    </ServicesProvider>,
  );
  return services;
}

const october = (services: Services) => {
  const { plan, entries } = services.domain.store.getState().snapshot;
  if (plan === null) return undefined;
  return slotStatuses(plan, entries, services.clock.today()).find((slot) => slot.key === OCTOBER)?.status;
};

describe('SkipSheet', () => {
  it('skips the month with its note, which the Log shows as "Skipped · car repair"', async () => {
    const services = await mount();
    expect(screen.getByRole('dialog', { name: 'Skip October\u00a02026' })).toBeDefined();
    fireEvent.change(screen.getByRole('textbox', { name: 'Note (optional)' }), { target: { value: ' car repair ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Skip October\u00a02026' }));
    expect(await screen.findByText('October 2026 skipped.')).toBeDefined();
    expect(october(services)).toBe('skipped');
    expect(screen.getByText('Skipped · car repair')).toBeDefined();
  });

  it('the note holds at most NOTE_MAX_LENGTH characters, and a note that long is written', async () => {
    const services = await mount();
    const field = screen.getByRole('textbox', { name: 'Note (optional)' });
    expect(field.getAttribute('maxlength')).toBe(String(NOTE_MAX_LENGTH));
    fireEvent.change(field, { target: { value: 'x'.repeat(NOTE_MAX_LENGTH) } });
    fireEvent.click(screen.getByRole('button', { name: 'Skip October\u00a02026' }));
    expect(await screen.findByText('October 2026 skipped.')).toBeDefined();
    expect(services.domain.store.getState().snapshot.plan?.skips.at(-1)?.note).toBe('x'.repeat(NOTE_MAX_LENGTH));
  });

  it('a longer note that still arrives is refused with its own line, and nothing is written', async () => {
    const services = await mount();
    const before = services.domain.store.getState().snapshot.plan;
    const field = screen.getByRole('textbox', { name: 'Note (optional)' });
    fireEvent.change(field, { target: { value: 'x'.repeat(NOTE_MAX_LENGTH + 1) } });
    fireEvent.click(screen.getByRole('button', { name: 'Skip October\u00a02026' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Use at most 200 characters in the note.');
    expect(services.domain.store.getState().snapshot.plan).toBe(before);
  });

  it('Undo restores the open month', async () => {
    const services = await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Skip October\u00a02026' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await vi.waitFor(() => expect(october(services)).toBe('late'));
    expect(services.domain.store.getState().snapshot.plan?.skips.map((skip) => skip.slot)).toEqual(['2026-07']);
  });

  // The sheet only skips, so the refusal names the state and nothing more, and Skip stays inert
  // (focusable, aria-disabled) once the slot has refused it: a second press writes nothing.
  it('a month already skipped is refused next to the button, Skip turns inert, and nothing is written', async () => {
    const services = await mount('2026-07' as MonthKey);
    const before = services.domain.store.getState().snapshot.plan;
    const write = vi.spyOn(services.domain, 'write');
    const button = screen.getByRole('button', { name: 'Skip July\u00a02026' });
    fireEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toBe('July\u00a02026 is already skipped.');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    const calls = write.mock.calls.length;
    await act(async () => void fireEvent.click(button));
    expect(write.mock.calls.length).toBe(calls);
    expect(services.domain.store.getState().snapshot.plan).toBe(before);
  });

  it('a month already recorded is refused, and Skip turns inert', async () => {
    const services = await mount('2026-05' as MonthKey);
    const before = services.domain.store.getState().snapshot.plan;
    const button = screen.getByRole('button', { name: 'Skip May\u00a02026' });
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(services.domain.store.getState().snapshot.plan).toBe(before);
  });

  // docs/DESIGN.md §6: the button stays focusable while the skip runs, so a refused skip keeps the focus on it
  // while its alert line speaks, never on the body.
  it('keeps the focus on the button while the skip runs and after it is refused', async () => {
    const services = await mount('2026-07' as MonthKey);
    const write = services.domain.write.bind(services.domain);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(services.domain, 'write').mockImplementationOnce(async (changes) => {
      await held;
      return write(changes);
    });
    const button = screen.getByRole('button', { name: 'Skip July\u00a02026' });
    button.focus();
    await act(async () => void fireEvent.click(button));
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(button);
    await act(async () => release());
    expect((await screen.findByRole('alert')).textContent).toMatch(/already skipped/);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Skip July\u00a02026' }));
  });
});

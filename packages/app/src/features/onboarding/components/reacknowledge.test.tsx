// @vitest-environment jsdom
import type { Instant, Plan } from '@proofofcalm/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryPlanStore } from '../../../lib/adapters/memory-store';
import { BRAND } from '../../../lib/brand';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import onboarding from '../../../messages/en/onboarding.json';
import today from '../../../messages/en/today.json';
import { AppRoutes } from '../../shell';
import { reacknowledge } from '../actions';

// The re-ask of the plan-creation disclosure (docs/DOMAIN.md §2.1, docs/LEGAL.md §4), through the route table,
// which swaps it for Today once the plan is no longer due. No live build reaches it while the version is 1,
// so the table takes the version as a prop.

// As routes.test.tsx: the profiles and the namespaces load once and answer from memory, so a findBy waits on
// renders only (lib/services/testing-modules.ts).
vi.mock('@proofofcalm/content', async (original) =>
  (await import('../../../lib/services/testing-modules')).profilesInMemory(
    await original<typeof import('@proofofcalm/content')>(),
  ),
);
vi.mock('../../../lib/i18n/namespaces', async (original) =>
  (await import('../../../lib/services/testing-modules')).namespacesInMemory(
    await original<typeof import('../../../lib/i18n/namespaces')>(),
  ),
);

await preloadLazyModules([() => import('../index')]);

// jsdom has no `scrollIntoView`: the focus move calls it, so it is stubbed and the tests read the calls.
const scrolled = vi.fn();
Element.prototype.scrollIntoView = scrolled;

const disposers: (() => void)[] = [];
afterEach(() => {
  cleanup();
  for (const dispose of disposers.splice(0)) dispose();
  scrolled.mockClear();
});

const ACKNOWLEDGED_AT = '2026-05-10T09:00:00.000Z' as Instant;
const CONTINUE = 'Accept and open Today';
const TITLE = 'The risk text has changed';

const fixture = fixtureSnapshot();
if (fixture.plan === null) throw new Error('the fixture has a plan');
const recorded: Plan = { ...fixture.plan, riskAcknowledgedAt: ACKNOWLEDGED_AT, riskWordingVersion: 1 };

async function services(plan: Plan | null = recorded) {
  const planStore = memoryPlanStore({ ...fixture, plan });
  const started = createTestServices({ planStore });
  await started.start();
  disposers.push(() => started.dispose());
  return { planStore, services: started };
}

/** The route table at wording version 2, in the shell's screen area. */
async function shown() {
  const stored = await services();
  render(
    <NavigationProvider location="memory" initialPath="/today">
      <ServicesProvider services={stored.services}>
        <I18nProvider messages={{ errors, today }}>
          <main id="main">
            <AppRoutes riskWording={2} />
          </main>
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  await screen.findByRole('heading', { level: 1, name: TITLE });
  return stored;
}

describe('Reacknowledge', () => {
  it('shows the disclosure with its Risk link, as onboarding does', async () => {
    await shown();
    const link = screen.getByRole('link', { name: 'Risk disclosure' });
    expect(link.getAttribute('href')).toBe('/risk');
    const words = onboarding.disclosure.text.replace('{product}', BRAND.name);
    expect(link.parentElement?.textContent).toBe(`${words} Risk disclosure`);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('the button records the current version and shows Today', async () => {
    const { planStore } = await shown();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    disposers.push(() => focus.mockRestore());
    fireEvent.click(screen.getByRole('button', { name: CONTINUE }));

    const heading = await screen.findByRole('heading', { level: 1, name: 'Today' });
    const written = planStore.current().plan as Plan;
    const at = written.riskAcknowledgedAt as Instant;
    expect(at > ACKNOWLEDGED_AT).toBe(true);
    expect(written).toEqual({ ...recorded, riskAcknowledgedAt: at, riskWordingVersion: 2, updatedAt: at });
    expect(screen.queryByRole('heading', { level: 1, name: TITLE })).toBeNull();
    // The pathname stays, so the shell moves no focus: the screen that goes hands it to Today's heading.
    await vi.waitFor(() => expect(document.activeElement).toBe(heading));
    // The focus itself scrolls nothing and comes first, so the one scroll is the `nearest` the next test reads.
    const call = focus.mock.contexts.indexOf(heading);
    expect(focus.mock.calls[call]).toEqual([{ preventScroll: true }]);
    expect(focus.mock.invocationCallOrder[call]).toBeLessThan(scrolled.mock.invocationCallOrder[0] as number);
  });

  it('the tap brings the heading of Today into view, since a swap in one pathname never scrolls', async () => {
    await shown();
    fireEvent.click(screen.getByRole('button', { name: CONTINUE }));

    const heading = await screen.findByRole('heading', { level: 1, name: 'Today' });
    await vi.waitFor(() => expect(scrolled.mock.contexts).toEqual([heading]));
    expect(scrolled).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('moves neither the focus nor the page when the plan stops being due without a tap', async () => {
    const { services: tab } = await shown();
    await act(() => reacknowledge(tab, 2));

    const heading = await screen.findByRole('heading', { level: 1, name: 'Today' });
    expect(document.activeElement).not.toBe(heading);
    expect(scrolled).not.toHaveBeenCalled();
  });

  it('a failed write says so and leaves the screen and the plan as they were', async () => {
    const { planStore, services } = await shown();
    const write = vi.spyOn(services.domain, 'write').mockRejectedValueOnce(new Error('the disk is full'));
    const button = screen.getByRole('button', { name: CONTINUE });
    button.focus();
    fireEvent.click(button);

    // The button keeps the focus and nothing else speaks, so the line announces itself, once.
    expect((await screen.findByRole('alert')).textContent).toBe(errors.unknown);
    expect(document.activeElement).toBe(button);
    expect(write).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeDefined();
    expect(planStore.current().plan).toBe(recorded);
  });
});

describe('reacknowledge', () => {
  it('writes nothing once no plan is due, so a second tap or another tab changes nothing', async () => {
    const { planStore, services: tab } = await services();
    await act(() => reacknowledge(tab, 2));
    const once = planStore.current();
    expect(once.plan?.riskWordingVersion).toBe(2);
    await act(() => reacknowledge(tab, 2));
    // An empty write still rebuilds the snapshot object: what counts is that the rows stay the same ones.
    expect(planStore.current().plan).toBe(once.plan);
    expect(planStore.current().prefs).toEqual(once.prefs);
  });

  it('writes nothing with nothing recorded or no plan', async () => {
    for (const plan of [fixture.plan, null]) {
      const { planStore, services: tab } = await services(plan);
      const before = planStore.current();
      await reacknowledge(tab, 2);
      expect(planStore.current().plan).toBe(before.plan);
      expect(planStore.current().prefs).toEqual(before.prefs);
    }
  });
});

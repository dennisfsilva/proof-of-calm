// @vitest-environment jsdom
import type { CalendarDate, CountryCode } from '@proofofcalm/core';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, NAMESPACE_LOADERS } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import { ServicesProvider } from '../../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices } from '../../../lib/services/testing';
import today from '../../../messages/en/today.json';
import { RuleChangeBanner } from './rule-change-banner';

// Its own file, since `lazy` keeps its first result for the module: the generic notice's country forms fail to
// load, as offline in a language whose chunks stay out of the precache (ADR-0045, Deviations of 2026-11-19).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RuleChangeBanner, the country forms fail to load', () => {
  it('shows no notice and throws nothing to the boundary', async () => {
    const failed = vi
      .spyOn(NAMESPACE_LOADERS.en, 'countries')
      .mockRejectedValue(new TypeError('Failed to fetch dynamically imported module'));
    const services = createTestServices({ snapshot: fixtureSnapshot(), nowMs: fixtureNowMs('buy') });
    const notice = {
      country: 'DE' as CountryCode,
      version: 2,
      changedOn: '2026-10-16' as CalendarDate,
      changeNotice: null,
    };
    await act(async () =>
      render(
        <NavigationProvider location="memory" initialPath="/today">
          <ServicesProvider services={services}>
            <I18nProvider messages={{ today }}>
              <p>Today</p>
              <RuleChangeBanner notice={notice} />
            </I18nProvider>
          </ServicesProvider>
        </NavigationProvider>,
      ),
    );
    expect(failed).toHaveBeenCalledOnce();
    expect(screen.getByText('Today')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    expect(screen.queryByText(/changed/u)).toBeNull();
  });
});

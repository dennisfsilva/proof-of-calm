import type { Instant } from '@proofofcalm/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { memoryPlanStore } from '../../../lib/adapters/memory-store';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider } from '../../../lib/navigation';
import type { Analytics, PlanStore, Snapshot } from '../../../lib/ports';
import { type Services, ServicesProvider } from '../../../lib/services';
import {
  createTestServices,
  type RecordingPlatform,
  recordingPlatform,
  type TestServicesOptions,
} from '../../../lib/services/testing';
import errors from '../../../messages/en/errors.json';
import settings from '../../../messages/en/settings.json';
import { DataSection } from './data-section';

// The helpers the DataSection test files share: the section mounted on test services, and a chosen file.

export const NOW = '2026-10-20T10:00:00.000Z' as Instant;

export type Mounted = { services: Services; platform: RecordingPlatform; analytics: Analytics };

export async function mount(
  snapshot: Snapshot,
  planStore: PlanStore = memoryPlanStore(snapshot),
  options: TestServicesOptions = {},
): Promise<Mounted> {
  // jsdom has no `scrollIntoView`; the focus moves call it, so it is stubbed and the tests that care replace it.
  Element.prototype.scrollIntoView = vi.fn();
  const platform = recordingPlatform();
  const analytics: Analytics = { count: vi.fn() };
  const services = createTestServices({ planStore, platform, analytics, ...options });
  render(
    <NavigationProvider location="memory" initialPath="/settings">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ settings, errors }}>
          <DataSection />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  await act(() => services.start());
  return { services, platform, analytics };
}

export async function choose(text: string) {
  const file = new File([text], 'backup.json', { type: 'application/json' });
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Choose a file'), { target: { files: [file] } });
  });
}

/** Pastes `text` into the paste box and reads it, as a person would. */
export async function paste(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Paste a backup or an export from the DCA plan page' }), {
    target: { value: text },
  });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Read the pasted text' })));
}

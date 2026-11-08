// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../lib/i18n';
import { ServicesProvider } from '../../lib/services';
import { createTestServices, recordingPlatform } from '../../lib/services/testing';
import shell from '../../messages/en/shell.json';
import { ScreenBoundary } from './screen-error';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Thrower(): ReactNode {
  throw new Error('Failed to fetch dynamically imported module');
}

function setup() {
  const platform = recordingPlatform();
  const services = createTestServices({ platform });
  const view = (resetKey: string, child: ReactNode) => (
    <ServicesProvider services={services}>
      <I18nProvider messages={{ shell }}>
        <ScreenBoundary resetKey={resetKey}>{child}</ScreenBoundary>
      </I18nProvider>
    </ServicesProvider>
  );
  return { platform, view };
}

describe('ScreenBoundary and ScreenError (ADR-0045 §9)', () => {
  it('shows the error state in place of a screen that throws', () => {
    // React reports the caught error on the console; the state below is what this test checks.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { view } = setup();
    render(view('/portfolio', <Thrower />));
    const heading = screen.getByRole('heading', { level: 1, name: 'This screen could not be loaded.' });
    expect(heading.tabIndex).toBe(-1);
    expect(screen.getByText('Check your connection, then reload the page.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
  });

  it('clears the error state when the location changes, so another screen still opens', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { view } = setup();
    const { rerender } = render(view('/portfolio', <Thrower />));
    expect(screen.getByRole('heading', { name: 'This screen could not be loaded.' })).toBeTruthy();
    rerender(view('/portfolio', <h1>Portfolio</h1>));
    expect(screen.getByRole('heading', { name: 'This screen could not be loaded.' })).toBeTruthy();
    rerender(view('/log', <h1>Log</h1>));
    expect(screen.getByRole('heading', { level: 1, name: 'Log' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'This screen could not be loaded.' })).toBeNull();
  });

  it('reloads the page through the platform', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { platform, view } = setup();
    render(view('/portfolio', <Thrower />));
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(platform.calls.reloads).toBe(1);
  });
});

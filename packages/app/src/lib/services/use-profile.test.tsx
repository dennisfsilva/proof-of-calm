// @vitest-environment jsdom
import type { CountryProfile } from '@proofofcalm/content';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProfile, useProfileLoad } from './use-profile';

// The content module over fakes: `loaded` is what a load has already read, `arriving` what a load elsewhere
// finishes between the first read and the next, `pending` the loads in flight, each resolved by the test.
// Hoisted, since the mock factory runs while the imports above are resolved.
const { loaded, arriving, pending } = vi.hoisted(() => ({
  loaded: new Map<string, unknown>(),
  arriving: new Map<string, unknown>(),
  pending: new Map<string, (profile: unknown) => void>(),
}));
vi.mock('@proofofcalm/content', () => ({
  loadedProfile: (code: string) => {
    const known = loaded.get(code);
    if (known !== undefined) return known;
    const late = arriving.get(code);
    if (late !== undefined) {
      arriving.delete(code);
      loaded.set(code, late);
    }
    return null;
  },
  loadProfile: (code: string) =>
    new Promise((resolve) => {
      pending.set(code, resolve);
    }),
}));

const PT = { code: 'PT', name: 'Portugal' } as CountryProfile;
const DE = { code: 'DE', name: 'Germany' } as CountryProfile;

// Called once per render of the probe: a profile already read needs one, with no commit from the effect.
const rendered = vi.fn();

afterEach(() => {
  cleanup();
  rendered.mockClear();
  loaded.clear();
  arriving.clear();
  pending.clear();
});

function Probe({ code }: { code: string | undefined }) {
  rendered();
  return <output>{useProfile(code)?.name ?? 'none'}</output>;
}

function SettledProbe({ code }: { code: string | undefined }) {
  const { profile, settled } = useProfileLoad(code);
  return <output>{`${profile?.name ?? 'none'} ${settled ? 'settled' : 'loading'}`}</output>;
}

const resolve = (code: string, profile: CountryProfile | null) =>
  act(async () => {
    const settle = pending.get(code);
    if (settle === undefined) throw new Error(`no load of ${code} in flight`);
    pending.delete(code);
    settle(profile);
  });

describe('useProfile', () => {
  it('answers the profile a load has already read at once, without loading it again', () => {
    loaded.set('PT', PT);
    render(<Probe code="PT" />);
    expect(screen.getByRole('status').textContent).toBe('Portugal');
    expect(pending.size).toBe(0);
  });

  it('renders once for a profile a load has already read, with no commit from its effect', async () => {
    loaded.set('PT', PT);
    render(<Probe code="PT" />);
    await act(async () => {});
    expect(rendered).toHaveBeenCalledTimes(1);
    expect(pending.size).toBe(0);
  });

  it('renders once per code on a round trip between two profiles already read', async () => {
    loaded.set('PT', PT);
    loaded.set('DE', DE);
    const { rerender } = render(<Probe code="PT" />);
    rerender(<Probe code="DE" />);
    rerender(<Probe code="PT" />);
    await act(async () => {});
    expect(screen.getByRole('status').textContent).toBe('Portugal');
    expect(rendered).toHaveBeenCalledTimes(3);
    expect(pending.size).toBe(0);
  });

  it('reads a profile that another load finished between its render and its effect, without a load of its own', async () => {
    arriving.set('PT', PT);
    render(<Probe code="PT" />);
    expect(await screen.findByText('Portugal')).toBeTruthy();
    expect(pending.size).toBe(0);
  });

  it('answers null until the profile loads, then the profile', async () => {
    render(<Probe code="DE" />);
    expect(screen.getByRole('status').textContent).toBe('none');
    expect(pending.has('DE')).toBe(true);
    await resolve('DE', DE);
    expect(screen.getByRole('status').textContent).toBe('Germany');
  });

  it('stays null for a code without a profile and with no code', async () => {
    const { rerender } = render(<Probe code="ES" />);
    await resolve('ES', null);
    expect(screen.getByRole('status').textContent).toBe('none');
    rerender(<Probe code={undefined} />);
    expect(screen.getByRole('status').textContent).toBe('none');
    expect(pending.size).toBe(0);
  });

  it('drops the answer of a load whose code has changed', async () => {
    const { rerender } = render(<Probe code="DE" />);
    rerender(<Probe code="PT" />);
    await resolve('DE', DE);
    expect(screen.getByRole('status').textContent).toBe('none');
    await resolve('PT', PT);
    expect(screen.getByRole('status').textContent).toBe('Portugal');
    rerender(<Probe code="DE" />);
    expect(screen.getByRole('status').textContent).toBe('none');
    await resolve('DE', DE);
    expect(screen.getByRole('status').textContent).toBe('Germany');
  });

  it('useProfileLoad says loading until the load settles, with the profile or with none', async () => {
    const { rerender } = render(<SettledProbe code="DE" />);
    expect(screen.getByRole('status').textContent).toBe('none loading');
    await resolve('DE', DE);
    expect(screen.getByRole('status').textContent).toBe('Germany settled');
    rerender(<SettledProbe code="ES" />);
    expect(screen.getByRole('status').textContent).toBe('none loading');
    await resolve('ES', null);
    expect(screen.getByRole('status').textContent).toBe('none settled');
    loaded.set('PT', PT);
    rerender(<SettledProbe code="PT" />);
    expect(screen.getByRole('status').textContent).toBe('Portugal settled');
  });
});

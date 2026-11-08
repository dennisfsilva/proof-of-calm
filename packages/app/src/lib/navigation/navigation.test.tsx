// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  APP_ROUTES,
  Link,
  NavigationProvider,
  Redirect,
  Route,
  Switch,
  usePathname,
  useRouter,
  useSearch,
} from './index';

afterEach(cleanup);

/** The hooks on screen, and one button per router method. */
function Probe() {
  const router = useRouter();
  return (
    <>
      <output data-testid="path">{usePathname()}</output>
      <output data-testid="search">{useSearch()}</output>
      <button type="button" onClick={() => router.push('/log')}>
        push
      </button>
      <button type="button" onClick={() => router.replace('/plan')}>
        replace
      </button>
      <button type="button" onClick={() => router.back()}>
        back
      </button>
      <Link href="/settings">settings</Link>
    </>
  );
}

const path = () => screen.getByTestId('path').textContent;
const click = (name: string) => fireEvent.click(screen.getByRole(name === 'settings' ? 'link' : 'button', { name }));

describe('the route list', () => {
  it('names the seven screens', () => {
    expect(APP_ROUTES).toEqual(['today', 'portfolio', 'log', 'plan', 'settings', 'learn', 'onboarding']);
  });

  it('imports nothing, so the build scripts load it under plain node', () => {
    const source = readFileSync(join(import.meta.dirname, 'routes.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import\b/m);
    expect(source).not.toMatch(/\brequire\(/);
  });
});

describe('NavigationProvider in memory', () => {
  it('reads the pathname and the search of the initial path', () => {
    render(
      <NavigationProvider location="memory" initialPath="/today?tab=plan">
        <Probe />
      </NavigationProvider>,
    );
    expect(path()).toBe('/today');
    expect(screen.getByTestId('search').textContent).toBe('tab=plan');
  });

  it('renders Link as an anchor whose click navigates', () => {
    render(
      <NavigationProvider location="memory" initialPath="/today">
        <Probe />
      </NavigationProvider>,
    );
    expect(screen.getByRole('link', { name: 'settings' })).toHaveProperty('href', 'http://localhost:3000/settings');
    click('settings');
    expect(path()).toBe('/settings');
  });

  it('pushes, replaces and goes back through useRouter', () => {
    render(
      <NavigationProvider location="memory" initialPath="/today">
        <Probe />
      </NavigationProvider>,
    );
    click('push');
    expect(path()).toBe('/log');
    click('replace');
    expect(path()).toBe('/plan');
    click('back');
    expect(path()).toBe('/today');
    click('back');
    expect(path()).toBe('/today');
  });

  it('sends an unknown path to the redirect route', () => {
    render(
      <NavigationProvider location="memory" initialPath="/nowhere">
        <Switch>
          <Route path="/today">
            <p>today</p>
          </Route>
          <Route>
            <Redirect to="/today" replace />
          </Route>
        </Switch>
        <Probe />
      </NavigationProvider>,
    );
    expect(path()).toBe('/today');
    expect(screen.getByText('today')).toBeDefined();
  });
});

describe('NavigationProvider in the browser', () => {
  it('reads window.location and writes history on a Link click', () => {
    window.history.replaceState(null, '', '/learn?x=1');
    render(
      <NavigationProvider location="browser">
        <Probe />
      </NavigationProvider>,
    );
    expect(path()).toBe('/learn');
    expect(screen.getByTestId('search').textContent).toBe('x=1');
    click('settings');
    expect(window.location.pathname).toBe('/settings');
    expect(path()).toBe('/settings');
  });
});

describe('NavigationProvider on the hash', () => {
  it('reads the hash and writes hash hrefs', () => {
    window.history.replaceState(null, '', '/index.html#/today');
    render(
      <NavigationProvider location="hash">
        <Probe />
      </NavigationProvider>,
    );
    expect(path()).toBe('/today');
    expect(screen.getByRole('link', { name: 'settings' }).getAttribute('href')).toBe('#/settings');
    click('settings');
    expect(window.location.hash).toBe('#/settings');
    expect(path()).toBe('/settings');
  });
});

// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  APP_ROUTES,
  Link,
  NavigationProvider,
  Redirect,
  Route,
  Switch,
  usePathname,
  useReopens,
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

/** The reopen count, a link to the shown path, one elsewhere and one whose own handler prevents the click. */
function ReopenProbe() {
  return (
    <>
      <output data-testid="reopens">{useReopens()}</output>
      <Link href="/portfolio">portfolio</Link>
      <Link href="/today">today</Link>
      <Link href="/portfolio" onClick={(event) => event.preventDefault()}>
        prevented
      </Link>
    </>
  );
}

const reopens = () => screen.getByTestId('reopens').textContent;
const link = (name: string) => screen.getByRole('link', { name });

describe('useReopens', () => {
  // A click wouter leaves to the browser (a modifier, the middle button) would ask jsdom for a document
  // navigation it does not implement: the window, reached after React's handlers, stops it there.
  const stay = (event: Event) => event.preventDefault();
  beforeEach(() => window.addEventListener('click', stay));
  afterEach(() => window.removeEventListener('click', stay));

  it('counts a plain click of the shown path’s link, and no other', () => {
    render(
      <NavigationProvider location="memory" initialPath="/portfolio">
        <ReopenProbe />
      </NavigationProvider>,
    );
    expect(reopens()).toBe('0');
    fireEvent.click(link('portfolio'));
    expect(reopens()).toBe('1');
    for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
      fireEvent.click(link('portfolio'), { [modifier]: true });
    }
    fireEvent.click(link('portfolio'), { button: 1 });
    fireEvent.click(link('prevented'));
    expect(reopens()).toBe('1');
    fireEvent.click(link('today'));
    expect(reopens()).toBe('1');
    // On Today, Today's link is the shown path's.
    fireEvent.click(link('today'));
    expect(reopens()).toBe('2');
  });

  it('counts alike on the browser and the hash location', () => {
    window.history.replaceState(null, '', '/portfolio');
    render(
      <NavigationProvider location="browser">
        <ReopenProbe />
      </NavigationProvider>,
    );
    fireEvent.click(link('portfolio'));
    expect(reopens()).toBe('1');
    cleanup();

    window.history.replaceState(null, '', '/index.html#/portfolio');
    render(
      <NavigationProvider location="hash">
        <ReopenProbe />
      </NavigationProvider>,
    );
    fireEvent.click(link('today'));
    expect(reopens()).toBe('0');
    fireEvent.click(link('today'));
    expect(reopens()).toBe('1');
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

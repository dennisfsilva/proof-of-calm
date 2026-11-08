// ADR-0045 §3: the inline script that sets the theme before the first paint. It is run here as a script
// (node:vm, the two globals it reads provided), so the test sees exactly what a <script> element runs.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  APPEARANCE_STORAGE_KEY,
  type AppearanceMirror,
  AppearanceMirrorSchema,
  THEME_BEFORE_PAINT,
  THEME_BEFORE_PAINT_SHA256,
  writeAppearanceMirror,
} from './before-paint';

type Globals = { localStorage?: unknown };

/** Runs the script against a fake document and the given `localStorage`; returns the attributes it set. */
function paint(globals: Globals) {
  const attributes = new Map<string, string>();
  const document = { documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) } };
  // Descriptors, not a spread: a `localStorage` getter that throws must throw inside the script, not here.
  const sandbox = Object.defineProperties({ document }, Object.getOwnPropertyDescriptors(globals));
  runInNewContext(THEME_BEFORE_PAINT, sandbox);
  return Object.fromEntries(attributes);
}

const stored = (value: string | null) => ({
  localStorage: { getItem: vi.fn((key: string) => (key === APPEARANCE_STORAGE_KEY ? value : null)) },
});

describe('THEME_BEFORE_PAINT (ADR-0045 §3)', () => {
  it('sets data-theme for a stored light or dark theme', () => {
    expect(paint(stored('{"theme":"light","motion":"system"}'))).toEqual({ 'data-theme': 'light' });
    expect(paint(stored('{"theme":"dark","motion":"system"}'))).toEqual({ 'data-theme': 'dark' });
  });

  it('leaves the system preference in charge for system, and sets nothing without a mirror', () => {
    expect(paint(stored('{"theme":"system","motion":"system"}'))).toEqual({});
    expect(paint(stored(null))).toEqual({});
  });

  it('sets data-motion="reduce" only for reduce', () => {
    expect(paint(stored('{"theme":"system","motion":"reduce"}'))).toEqual({ 'data-motion': 'reduce' });
    expect(paint(stored('{"theme":"dark","motion":"reduce"}'))).toEqual({
      'data-theme': 'dark',
      'data-motion': 'reduce',
    });
  });

  it('sets nothing for a value of another shape', () => {
    expect(paint(stored('{"theme":"sepia","motion":"none"}'))).toEqual({});
    expect(paint(stored('"light"'))).toEqual({});
    expect(paint(stored('null'))).toEqual({});
  });

  it('sets nothing and throws nothing for invalid JSON or a localStorage that throws', () => {
    expect(paint(stored('{theme:'))).toEqual({});
    const blocked = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    expect(paint({ localStorage: blocked })).toEqual({});
    const globals: Globals = {};
    Object.defineProperty(globals, 'localStorage', {
      enumerable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    expect(paint(globals)).toEqual({});
  });

  it('reads the one key the Settings writer mirrors to', () => {
    const globals = stored('{"theme":"light","motion":"system"}');
    paint(globals);
    expect(globals.localStorage.getItem).toHaveBeenCalledWith('poc.appearance');
  });

  it('has the text whose SHA-256 the CSP names, and no newline a template could change', () => {
    expect(THEME_BEFORE_PAINT).not.toMatch(/\n/);
    expect(createHash('sha256').update(THEME_BEFORE_PAINT).digest('base64')).toBe(THEME_BEFORE_PAINT_SHA256);
  });
});

describe('the appearance mirror', () => {
  it('accepts the two settings and nothing else', () => {
    const value: AppearanceMirror = { theme: 'dark', motion: 'reduce' };
    expect(AppearanceMirrorSchema.safeParse(value).success).toBe(true);
    expect(AppearanceMirrorSchema.safeParse({ theme: 'dark' }).success).toBe(false);
    expect(AppearanceMirrorSchema.safeParse({ theme: 'sepia', motion: 'system' }).success).toBe(false);
  });

  it('writes the JSON the script reads under its key', () => {
    const setItem = vi.fn();
    writeAppearanceMirror({ setItem } as unknown as Storage, { theme: 'light', motion: 'system' });
    expect(setItem).toHaveBeenCalledWith(APPEARANCE_STORAGE_KEY, '{"theme":"light","motion":"system"}');
    expect(paint(stored(setItem.mock.calls[0]?.[1] as string))).toEqual({ 'data-theme': 'light' });
  });

  it('survives a storage that throws: the store wins and the mirror heals on the next visit', () => {
    const blocked = {
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    } as unknown as Storage;
    expect(() => writeAppearanceMirror(blocked, { theme: 'light', motion: 'system' })).not.toThrow();
  });

  it('lib/theme/index.ts loads under plain node (the switch writes the CSP hash from it without a bundler)', () => {
    const index = new URL('./index.ts', import.meta.url).href;
    const script = `import(${JSON.stringify(index)}).then((m) => console.log(Object.keys(m).join(',')))`;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    expect(output.trim().split(',').sort()).toEqual([
      'APPEARANCE_STORAGE_KEY',
      'AppearanceMirrorSchema',
      'THEME_BEFORE_PAINT',
      'THEME_BEFORE_PAINT_SHA256',
      'applyAppearance',
      'writeAppearanceMirror',
    ]);
  });
});

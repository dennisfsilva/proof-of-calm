import { readFileSync } from 'node:fs';
import { UI_LANGUAGES } from '@proofofcalm/app/lib/i18n';
import { findBanned } from '@proofofcalm/content';
import { describe, expect, it } from 'vitest';
import * as z from 'zod/mini';
import { type SiteLanguage, siteTranslator } from '../site-messages';
import { manifest } from './manifest';

// What Chrome's install criteria and ADR-0033 ask of the manifest, as a schema; and every icon and
// screenshot it names exists in public/ at the size it claims.
const Screenshot = z.object({
  src: z.string().check(z.regex(/^\/screenshots\/[a-z0-9-]+-(narrow|wide)\.png$/)),
  sizes: z.string().check(z.regex(/^\d+x\d+$/)),
  type: z.literal('image/png'),
  form_factor: z.enum(['narrow', 'wide']),
  label: z.string().check(z.minLength(1)),
});
const Icon = z.object({
  src: z.string().check(z.regex(/^\/icons\/[a-z0-9-]+\.png$/)),
  sizes: z.string().check(z.regex(/^\d+x\d+$/)),
  type: z.literal('image/png'),
  purpose: z.enum(['any', 'maskable', 'monochrome']),
});
const Installable = z.object({
  id: z.string(),
  name: z.string().check(z.minLength(1)),
  short_name: z.string().check(z.minLength(1), z.maxLength(15)),
  description: z.string().check(z.minLength(1)),
  start_url: z.literal('/today'),
  scope: z.literal('/'),
  display: z.literal('standalone'),
  background_color: z.string().check(z.regex(/^#[0-9a-f]{6}$/)),
  theme_color: z.string().check(z.regex(/^#[0-9a-f]{6}$/)),
  icons: z.array(Icon),
  screenshots: z.array(Screenshot),
});

function pngSize(path: string): string {
  const png = readFileSync(new URL(`../../public${path}`, import.meta.url));
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
}

describe('the web app manifest (ADR-0033)', () => {
  const parsed = Installable.safeParse(manifest());

  it('has everything installation needs', () => {
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('names icons of 192 and 512 px for any use and as maskable, all of which exist at their size', () => {
    const icons = parsed.data?.icons ?? [];
    for (const purpose of ['any', 'maskable'] as const) {
      expect(icons.filter((icon) => icon.purpose === purpose).map((icon) => icon.sizes)).toEqual([
        '192x192',
        '512x512',
      ]);
    }
    for (const icon of icons) expect(pngSize(icon.src), icon.src).toBe(icon.sizes);
  });

  // The set of ADR-0009's Reading of 2026-11-23 (docs/DESIGN.md §9): four narrow images, the holding-date page
  // first, and the holding-date page wide; e2e/manifest-capture.spec.ts renders them in the pinned container.
  const screenshots = parsed.data?.screenshots ?? [];

  it('names four narrow screenshots, the holding-date page first, and the holding-date page wide', () => {
    expect(screenshots.map((shot) => shot.src)).toEqual([
      '/screenshots/holding-date-narrow.png',
      '/screenshots/country-pt-narrow.png',
      '/screenshots/today-narrow.png',
      '/screenshots/learn-narrow.png',
      '/screenshots/holding-date-wide.png',
    ]);
    // Each frame's height is chosen so that its edges fall between blocks (the capture spec): android-small is 360 CSS
    // pixels wide at a device scale factor of 3, desktop 1280 at 1.
    expect(Object.fromEntries(screenshots.map((shot) => [shot.src, shot.sizes]))).toEqual({
      '/screenshots/holding-date-narrow.png': '1080x2340',
      '/screenshots/country-pt-narrow.png': '1080x2469',
      '/screenshots/today-narrow.png': '1080x2340',
      // The Learn index ends at 723 CSS pixels, in the gap before the Countries row (the capture spec).
      '/screenshots/learn-narrow.png': '1080x2169',
      '/screenshots/holding-date-wide.png': '1280x720',
    });
    for (const shot of screenshots) expect(shot.src, shot.src).toContain(`-${shot.form_factor}.png`);
  });

  it("keeps every screenshot within Chrome's richer install sheet: sides of 320 to 3840 px, at most 2.3 : 1", () => {
    for (const shot of screenshots) {
      const [width, height] = shot.sizes.split('x').map(Number) as [number, number];
      expect(Math.min(width, height), shot.src).toBeGreaterThanOrEqual(320);
      expect(Math.max(width, height), shot.src).toBeLessThanOrEqual(3840);
      expect(Math.max(width, height) / Math.min(width, height), shot.src).toBeLessThanOrEqual(2.3);
    }
  });

  it('names screenshots that exist at their size', () => {
    for (const shot of screenshots) expect(pngSize(shot.src), shot.src).toBe(shot.sizes);
  });

  // The manifest is built in English (`lang: 'en'`), but the pt-PT and German labels ship in the site's message
  // files, so every language keeps the same limits; "your" is the reader's possessive in each.
  const possessive: Record<SiteLanguage, RegExp> = {
    en: /\byour\b/i,
    'pt-PT': /(^|\s)(seus?|suas?|teus?|tuas?)(\s|$)/i,
    de: /(^|\s)(deine?[mnrs]?|ihre?[mnrs]?)(\s|$)/i,
  };

  it.each(UI_LANGUAGES)(
    'labels each in %s in ten words or fewer, without "your", in sentence case, past the banned-words lint',
    (language) => {
      const t = siteTranslator('manifest', language);
      for (const key of ['holdingDate', 'countryPt', 'today', 'learn'] as const) {
        const label = t(`screenshots.${key}`);
        expect(label.split(/\s+/).length, label).toBeLessThanOrEqual(10);
        expect(label, label).not.toMatch(possessive[language]);
        // A German label can open on a quoted screen name („Heute“), so the case is read from the first letter.
        const first = /^[„«"]?(\p{L})/u.exec(label)?.[1] ?? '';
        expect(first, label).toBe(first.toUpperCase());
        expect(first, label).not.toBe('');
        expect(findBanned(label), label).toEqual([]);
      }
    },
  );
});

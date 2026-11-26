import { BRAND } from '@proofofcalm/app/lib/brand';
import { siteTranslator } from '../site-messages';
import colours from './brand-colors.json';

// The web app manifest of ADR-0033 and docs/DESIGN.md §9: installable (name, icons of 192 and 512 px,
// start URL, standalone), opening on Today, in the light theme's background. A changed manifest is a
// reviewed change, because Android regenerates the installed app from it. The build writes it as
// `dist/manifest.webmanifest` (ADR-0045 §6); `manifest.test.ts` holds it to the install criteria.

type FormFactor = 'narrow' | 'wide';

/** A viewport of android-small (360 × 780 at 3) or desktop (1280 × 800 at 1), as e2e/manifest-capture.spec.ts takes it. */
const SIZES: Record<FormFactor, string> = { narrow: '1080x2340', wide: '1280x800' };

/**
 * The screenshots of the richer install dialog: the set of ADR-0009's Reading of 2026-11-23, which names no coin,
 * the holding-date page first because it shows the difference first (docs/DESIGN.md §9). The files are rendered in
 * the pinned Playwright container by snapshots.yml and stay inside the GB route (ADR-0029 Readings, 2026-11-26).
 */
function screenshots() {
  const t = siteTranslator('manifest');
  const shot = (name: string, form_factor: FormFactor, label: string) => ({
    src: `/screenshots/${name}-${form_factor}.png`,
    sizes: SIZES[form_factor],
    type: 'image/png',
    form_factor,
    label,
  });
  return [
    shot('holding-date', 'narrow', t('screenshots.holdingDate')),
    shot('country-pt', 'narrow', t('screenshots.countryPt')),
    shot('today', 'narrow', t('screenshots.today')),
    shot('learn', 'narrow', t('screenshots.learn')),
    shot('holding-date', 'wide', t('screenshots.holdingDate')),
  ];
}

export function manifest() {
  return {
    id: '/today',
    name: BRAND.name,
    short_name: BRAND.name,
    description: siteTranslator('manifest')('description'),
    lang: 'en',
    dir: 'ltr',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    background_color: colours.light.background,
    theme_color: colours.light.background,
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-monochrome-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
    ],
    screenshots: screenshots(),
  };
}

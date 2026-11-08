import { BRAND } from '@proofofcalm/app/lib/brand';
import { siteTranslator } from '../site-messages';
import colours from './brand-colors.json';

// The web app manifest of ADR-0033 and docs/DESIGN.md §9: installable (name, icons of 192 and 512 px,
// start URL, standalone), opening on Today, in the light theme's background. A changed manifest is a
// reviewed change, because Android regenerates the installed app from it. Screenshots for the richer
// install dialog arrive with the screens they show (planned: M2). The build writes it as
// `dist/manifest.webmanifest` (ADR-0045 §6); `manifest.test.ts` holds it to the install criteria.
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
  };
}

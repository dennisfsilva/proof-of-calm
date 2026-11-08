// Writes apps/web/vercel.json from the code (ADR-0045 §1): `node scripts/vercel-config.ts --write`;
// without the flag it prints the JSON. lib/vercel-config.test.ts fails when the committed file drifts.
// Plain node runs this file, so it imports only modules node can load as they are.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APP_ROUTES } from '@proofofcalm/app/lib/navigation/routes';
import { THEME_BEFORE_PAINT_SHA256 } from '@proofofcalm/app/lib/theme';
import { BOOT_SCRIPT_HASH, sha256 } from '@proofofcalm/config/vite';
import { NOT_AVAILABLE_STYLE } from '../lib/geo/rules.ts';
import { LEGAL_PAGES, SECURITY_TXT_PATH } from '../lib/site/pages.ts';
import { vercelConfig } from '../lib/vercel-config.ts';

const config = vercelConfig({
  themeHash: `sha256-${THEME_BEFORE_PAINT_SHA256}`,
  bootHash: BOOT_SCRIPT_HASH,
  notAvailableStyleHash: sha256(NOT_AVAILABLE_STYLE),
  appRoutes: APP_ROUTES,
  legalPaths: LEGAL_PAGES.map((page) => page.path),
  securityTxtPath: SECURITY_TXT_PATH,
});
const json = `${JSON.stringify(config, null, 2)}\n`;

if (process.argv.includes('--write')) {
  const target = fileURLToPath(new URL('../vercel.json', import.meta.url));
  writeFileSync(target, json);
  process.stdout.write(`wrote ${target}\n`);
} else {
  process.stdout.write(json);
}

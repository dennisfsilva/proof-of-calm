import { createHostConfig } from '@proofofcalm/config/vite';
import { parseModule } from '@proofofcalm/content/modules';
import { defineConfig } from 'vite';
import { devApi } from './scripts/dev-api-plugin.ts';

// The web host's Vite configuration (ADR-0045 §12): the shared factory with the Learn modules' parser
// (ADR-0048), the dev server on port 3000 with the API answered from server/api.ts
// (scripts/dev-api-plugin.ts), `dist` as the output Vercel serves (§1).
const host = createHostConfig({ host: 'web', root: import.meta.dirname, parseModule });

export default defineConfig({
  ...host,
  plugins: [...(host.plugins ?? []), devApi()],
  server: { port: 3000, strictPort: true },
});

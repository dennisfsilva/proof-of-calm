import { createHostConfig } from '@proofofcalm/config/vite';
import { parseModule } from '@proofofcalm/content/modules';
import { defineConfig } from 'vite';

// The wrapper host's Vite configuration (ADR-0045 §10 and §12): the shared factory with the mobile
// document, API origin and worker switch, and the Learn modules' parser (ADR-0048); `dist` is what
// Capacitor copies (M3).
export default defineConfig(createHostConfig({ host: 'mobile', root: import.meta.dirname, parseModule }));

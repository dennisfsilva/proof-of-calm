import { createTranslator } from 'use-intl/core';
import messages from '../messages/en.json';

// The site pages are rendered on the server without a provider, so they translate with use-intl's
// translator, which needs no React context (ADR-0045 §6 and §8). English only until M2.
export function siteTranslator<N extends keyof typeof messages>(namespace: N) {
  return createTranslator({ locale: 'en', messages, namespace });
}

import type { Messages } from './messages';

// Type-safe message keys for useTranslations: use-intl's AppConfig augmentation (ADR-0023, ADR-0045 §8).
declare module 'use-intl' {
  interface AppConfig {
    Locale: 'en';
    Messages: Messages;
  }
}

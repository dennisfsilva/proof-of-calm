import * as z from 'zod/mini';

// The v1 currency set (docs/DOMAIN.md §1). A country profile may add others later; each needs its
// minor-unit digits here first.
export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const;

export const CurrencyCodeSchema = z.enum(CURRENCIES);
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

/** Decimal places of each currency's minor unit (ISO 4217). */
export const MINOR_UNITS: Readonly<Record<CurrencyCode, number>> = { EUR: 2, USD: 2, GBP: 2, CHF: 2 };

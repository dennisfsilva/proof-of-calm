import * as z from 'zod/mini';

// UUIDs come from the shell (crypto.randomUUID); entries migrated from the prototype keep their ids
// when they match ^p[a-z0-9]+$ (docs/DOMAIN.md §7), so a second import of the same file adds nothing.
const ENTITY_ID_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|p[a-z0-9]+)$/;

export const EntityIdSchema = z
  .string()
  .check(z.regex(ENTITY_ID_PATTERN, 'Expected a lowercase UUID or a prototype id'))
  .brand<'EntityId'>();
export type EntityId = z.infer<typeof EntityIdSchema>;

/** The ticker is the stable key (docs/DOMAIN.md §1); display name and CoinGecko id live beside it. */
export const CoinIdSchema = z
  .string()
  .check(z.regex(/^[A-Z0-9.$-]{1,12}$/, 'Expected a ticker of 1 to 12 capitals, digits, ".", "$" or "-"'))
  .brand<'CoinId'>();
export type CoinId = z.infer<typeof CoinIdSchema>;

/** ISO 3166-1 alpha-2, plus XX for the generic profile without a reviewed rule set. */
export const CountryCodeSchema = z.string().check(z.regex(/^[A-Z]{2}$/, 'Expected a two-letter country code'));
export type CountryCode = z.infer<typeof CountryCodeSchema>;

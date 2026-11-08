import * as z from 'zod/mini';
import { CoinIdSchema } from './ids';

export const CoinSchema = z.strictObject({
  id: CoinIdSchema,
  name: z.string().check(z.minLength(1), z.maxLength(40)),
  geckoId: z.string().check(z.regex(/^[a-z0-9-]{1,60}$/, 'Expected a CoinGecko id such as "bitcoin"')),
  /** Decimals shown in tables and used for the one-tap estimate (docs/DESIGN.md §5: BTC 8, ETH 6, SOL and LINK 4). */
  decimals: z.int().check(z.minimum(0), z.maximum(10)),
  /** An optional override of the palette colour, which otherwise follows the plan's coin order. */
  color: z.exactOptional(z.string().check(z.regex(/^#[0-9a-f]{6}$/, 'Expected a lowercase hex colour'))),
});
export type Coin = z.infer<typeof CoinSchema>;

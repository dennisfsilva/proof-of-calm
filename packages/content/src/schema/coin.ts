// A coin as plans, templates and the picker carry it (docs/DOMAIN.md §1): the ticker is the key, the name
// and the CoinGecko id live beside it, and the decimals are those of docs/DESIGN.md §5 rule 7. The
// catalogue in packages/content/coins.json is also the price route's allow-list (docs/SECURITY.md §2,
// ADR-0036), so the route asks the upstream only for ids listed here. It is the catalogue's coin, not the
// core's `CoinSchema`: it leaves out the core's optional `color`, the user's own override, which content
// never sets, so a template or catalogue entry that carries one fails the content gate.
import * as z from 'zod/mini';

export const CatalogueCoinSchema = z.strictObject({
  id: z.string().check(z.regex(/^[A-Z0-9.$-]{1,12}$/)),
  name: z.string().check(z.minLength(1), z.maxLength(40)),
  geckoId: z.string().check(z.regex(/^[a-z0-9-]{1,60}$/)),
  decimals: z.int().check(z.minimum(0), z.maximum(10)),
});
export type ContentCoin = z.infer<typeof CatalogueCoinSchema>;

export const CoinCatalogueSchema = z.array(CatalogueCoinSchema).check(z.minLength(1));

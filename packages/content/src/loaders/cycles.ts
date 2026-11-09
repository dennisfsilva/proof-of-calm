// The completed cycles' falls (packages/content/cycles/drawdowns.json): the Red day page's scale of past falls
// (docs/DOMAIN.md §3.11). It parses with the cycles schema, so it needs zod at run time and is the subpath
// `./cycles`, outside src/index.ts: only the app's lazy red-day model imports it, and Today's entry carries none of
// it. The Result is written literally, as the modules' parser does.
import type { Result } from '@proofofcalm/core';
import file from '../../cycles/drawdowns.json' with { type: 'json' };
import { type CycleDrawdown, CycleDrawdownsSchema } from '../schema/cycles.ts';

/** The file's rows in its order, each with its publisher; a malformed file is refused with one line per issue. */
export function loadCycleDrawdowns(source: unknown = file): Result<readonly CycleDrawdown[], string[]> {
  const parsed = CycleDrawdownsSchema.safeParse(source);
  if (parsed.success) return { ok: true, value: parsed.data.drawdowns };
  return {
    ok: false,
    error: parsed.error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`),
  };
}

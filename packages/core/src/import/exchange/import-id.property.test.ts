import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EntityIdSchema } from '../../schema/ids';
import { importId } from './import-id';

// D11: ids derived from distinct keys are distinct and pass EntityIdSchema, so two rows of one file never share one.

const printable = fc.integer({ min: 0x20, max: 0x7e }).map((code) => String.fromCharCode(code));
const key = fc.string({ unit: printable, minLength: 0, maxLength: 40 });

/**
 * Three runs of 10,000 keys with a 30 s timeout (the core's default is Vitest's 5 s). Measured on 2026-11-13 under the
 * full core suite with coverage, seeds 1 to 4: 0.56 to 1.3 s locally, the worst 1.3 s (seed 3); six times it, 7.7 s,
 * stays under a third of 30 s (10 s).
 */
const TIMEOUT = 30_000;

describe('importId', () => {
  it(
    '10,000 distinct keys give 10,000 distinct ids, each passing EntityIdSchema',
    () => {
      fc.assert(
        fc.property(fc.uniqueArray(key, { minLength: 10_000, maxLength: 10_000 }), (keys) => {
          const ids = keys.map(importId);
          expect(new Set(ids).size).toBe(10_000);
          expect(ids.every((id) => EntityIdSchema.safeParse(id).success)).toBe(true);
        }),
        { numRuns: 3 },
      );
    },
    TIMEOUT,
  );
});

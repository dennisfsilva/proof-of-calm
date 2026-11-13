import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EntityIdSchema } from '../../schema/ids';
import { importId } from './import-id';

// D11: ids derived from distinct keys are distinct and pass EntityIdSchema, so two rows of one file never share one.

const printable = fc.integer({ min: 0x20, max: 0x7e }).map((code) => String.fromCharCode(code));
const key = fc.string({ unit: printable, minLength: 0, maxLength: 40 });

describe('importId', () => {
  it('10,000 distinct keys give 10,000 distinct ids, each passing EntityIdSchema', () => {
    fc.assert(
      fc.property(fc.uniqueArray(key, { minLength: 10_000, maxLength: 10_000 }), (keys) => {
        const ids = keys.map(importId);
        expect(new Set(ids).size).toBe(10_000);
        expect(ids.every((id) => EntityIdSchema.safeParse(id).success)).toBe(true);
      }),
      { numRuns: 3 },
    );
  });
});

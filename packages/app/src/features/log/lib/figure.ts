import { decimal } from '@proofofcalm/core';
import { createNumberInput, type Formatters } from '../../../lib/format';

/** A count in copy, grouped as the formatters' locale groups it (`10,000`, `10.000`; CONTENT-STYLE §4). */
export function figure(format: Formatters, value: number): string {
  return createNumberInput(format.locales.numbers).format(decimal(String(value)));
}

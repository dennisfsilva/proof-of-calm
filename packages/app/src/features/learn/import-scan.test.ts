import { describe, expect, it } from 'vitest';
import { scanImports } from './import-scan';

const scan = (source: string) => scanImports(source).map(({ specifier, typeOnly }) => ({ specifier, typeOnly }));

describe('scanImports', () => {
  it('reads an exported type and the value import after a blank line as two statements', () => {
    const source = "export type Foo = { a: 1 };\n\nimport { underReview } from '@proofofcalm/core';\n";
    expect(scan(source)).toEqual([{ specifier: '@proofofcalm/core', typeOnly: false }]);
  });

  it('reads a list over several lines as one statement', () => {
    const source =
      "import {\n  a,\n  type B,\n} from '@proofofcalm/core';\nimport type { C } from '@proofofcalm/content';\n";
    expect(scan(source)).toEqual([
      { specifier: '@proofofcalm/core', typeOnly: false },
      { specifier: '@proofofcalm/content', typeOnly: true },
    ]);
  });

  it.each([
    "import type { Profile } from '@proofofcalm/content';",
    "import { type A, type B } from '@proofofcalm/core';",
    "export type { X } from '@proofofcalm/core';",
  ])('erases %s', (source) => {
    expect(scan(source).map(({ typeOnly }) => typeOnly)).toEqual([true]);
  });

  it.each([
    "import { type A, b } from '@proofofcalm/core';",
    "export { x } from '@proofofcalm/core';",
    "export * from '@proofofcalm/core';",
    "import * as core from '@proofofcalm/core';",
  ])('keeps %s', (source) => {
    expect(scan(source)).toEqual([{ specifier: '@proofofcalm/core', typeOnly: false }]);
  });
});

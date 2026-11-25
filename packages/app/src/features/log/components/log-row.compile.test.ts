import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformSync } from '@babel/core';
import { describe, expect, it } from 'vitest';

// The Log's row compiles under the React Compiler (ADR-0045, docs/ENGINEERING.md §4, "The Log at the cap"): the
// hosts' preset skips a component it cannot compile without a word, and the row then rebuilds its summary, its
// chips and its amount cell on every render it does not skip. A default parameter that reads another parameter
// (`value = item.units`) was such a construct. `all_errors` turns the silent skip into a thrown error.

const FILE = fileURLToPath(new URL('./log-row.tsx', import.meta.url));

describe('log-row.tsx under the React Compiler', () => {
  it('compiles with no error, so the output imports the compiler runtime', () => {
    const output = transformSync(readFileSync(FILE, 'utf8'), {
      filename: FILE,
      babelrc: false,
      configFile: false,
      parserOpts: { plugins: ['typescript', 'jsx'] },
      plugins: [['babel-plugin-react-compiler', { panicThreshold: 'all_errors' }]],
    });
    expect(output?.code).toContain('react/compiler-runtime');
  });
});

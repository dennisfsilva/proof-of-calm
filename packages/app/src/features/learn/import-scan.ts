// The static imports and re-exports of a module's source, read one statement at a time, each with whether the
// compiler erases it. `lazy-chunk.test.ts` reads them to keep value imports of content and core out of the lazy
// Learn chunk; the scan is textual, so a clause never spans a semicolon or a blank line and an `export type
// Foo = …;` statement cannot swallow the value import that follows it.

// The clause takes any character but a semicolon, and a line break only when the next line is not blank.
const STATEMENT = /^(?:import|export)\s+((?:[^;\n]|\n(?![ \t]*\n))*?)\s+from\s+'([^']+)'/gm;

export type ScannedImport = {
  /** What stands between the keyword and `from`: `type { X }`, `{ type X, y }`, `*`, `name`. */
  readonly clause: string;
  readonly specifier: string;
  /** True for `import type { … }`, `export type { … } from` and a list whose every name carries `type`. */
  readonly typeOnly: boolean;
};

function isTypeOnly(clause: string): boolean {
  if (/^type\s/.test(clause)) return true;
  const list = /^\{([\s\S]*)\}$/.exec(clause.trim());
  if (list === null) return false;
  return (list[1] as string)
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '')
    .every((name) => /^type\s/.test(name));
}

export function scanImports(source: string): ScannedImport[] {
  return [...source.matchAll(STATEMENT)].map(([, clause, specifier]) => ({
    clause: clause as string,
    specifier: specifier as string,
    typeOnly: isTypeOnly(clause as string),
  }));
}

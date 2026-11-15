// The shape of an overlay against its English value (ADR-0057), for validate.ts: every path exists in English, holds
// prose TRANSLATABLE names, keeps the English array lengths and carries the English numbers. The checks on the
// overlaid text itself (the ban list, the hyphen, the percent joiner, the 60 words) run in validate.ts. Pure.
import type { Problem } from '../problem.ts';
import { type ContentKind, isRecord, isTranslatable, type Segment } from './overlay.ts';

// Digits with the decimal and group separators between them: `31.4`, `31,4`, `1,000`, `1 000`, `1 000`.
const NUMBER = /\d+(?:[.,   ]\d+)*/g;

/** The numbers of a text as digit strings, separators between digits removed, sorted: a multiset to compare. */
export const numbersIn = (text: string): string[] =>
  [...text.matchAll(NUMBER)].map(([match]) => match.replace(/\D/g, '')).sort();

/** Every way the overlay departs from English; the empty list is a pass. */
export function overlayProblems(kind: ContentKind, path: string, english: unknown, overlay: unknown): Problem[] {
  const problems: Problem[] = [];
  const report = (code: string, at: readonly Segment[], detail = '') =>
    problems.push({ path, code: `overlay-${code}`, detail: `${at.join('.') || '(root)'}${detail}` });
  const walk = (en: unknown, over: unknown, at: readonly Segment[]): void => {
    if (en === undefined || (en === null && over !== null)) return void report('unknown-path', at);
    if (isRecord(over)) {
      if (!isRecord(en)) return void report('not-translatable', at);
      for (const [key, value] of Object.entries(over)) {
        walk(Object.hasOwn(en, key) ? en[key] : undefined, value, [...at, key]);
      }
      return;
    }
    if (Array.isArray(over)) {
      if (!Array.isArray(en)) return void report('not-translatable', at);
      if (over.length !== en.length) {
        return void report('array-length', at, `: ${over.length} items, English ${en.length}`);
      }
      for (const [index, item] of over.entries()) {
        if (item !== null) walk(en[index], item, [...at, index]);
      }
      return;
    }
    if (typeof over !== 'string' || typeof en !== 'string' || !isTranslatable(kind, at)) {
      return void report('not-translatable', at);
    }
    const [mine, theirs] = [numbersIn(over).join(' '), numbersIn(en).join(' ')];
    if (mine !== theirs) report('number-mismatch', at, `: ${mine}, English ${theirs}`);
  };
  walk(english, overlay, []);
  return problems;
}

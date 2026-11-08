// The Learn modules' parser (ADR-0048): flat front matter, the body, the computed word count and reading time.
// It needs zod at run time, so it is the subpath `./modules` and stays out of src/index.ts. The CLI runs it under
// Node with no build and no src file imports the core at run time, so the Result here is written literally.
import type { Result } from '@proofofcalm/core';
import { type Problem, schemaProblems } from '../problem.ts';
import { type ModuleFrontMatter, ModuleFrontMatterSchema } from '../schema/module.ts';

export type LearnModule = ModuleFrontMatter & { body: string; words: number; readingMinutes: number };
export type LearnModuleMeta = Omit<LearnModule, 'body'>;

const FENCE = '---';
const FIELD = /^([A-Za-z]+):(?: (.*))?$/;
const NOT_FLAT = /^["'[{]/;
const TAG = /(?<!\\)<\/?[A-Za-z][^>]*>/g;
const LINK_TARGET = /\]\([^)]*\)/g;
// A quote mark needs no space after it, as in Markdown; a heading, list or number mark does, or it is a word.
const BLOCK_MARKS = /^[ \t]*(?:>[ \t]*|(?:#{1,6}|[-*+]|\d+[.)])[ \t]+)+/gm;
const INLINE_MARKS = /[*_`[\]]/g;

/** The body as a person reads it: without tags, link targets, or Markdown marks. */
export const plainText = (body: string) =>
  body.replace(TAG, ' ').replace(LINK_TARGET, ']').replace(BLOCK_MARKS, '').replace(INLINE_MARKS, '');

const wordCount = (body: string) =>
  plainText(body)
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;

/** Words ÷ 230 plus 10 seconds per chart, rounded up to whole minutes: over 13,800 to stay in whole numbers. */
const minutesToRead = (words: number, charts: number) => Math.ceil((words * 60 + 2300 * charts) / 13_800);

function readFields(path: string, lines: readonly string[]) {
  const fields = new Map<string, string>();
  const problems: Problem[] = [];
  lines.forEach((line, index) => {
    const at = `line ${index + 2}`;
    const report = (detail: string) => problems.push({ path, code: 'module-front-matter', detail: `${at}: ${detail}` });
    const match = FIELD.exec(line);
    const key = match?.[1];
    const value = (match?.[2] ?? '').trim();
    if (key === undefined) report('write one key: value on each line, with no indent');
    else if (fields.has(key)) report(`${key} appears twice; delete one of the 2 lines`);
    else if (NOT_FLAT.test(value)) report(`write ${key} as plain text, with no quotes, brackets, or braces`);
    else fields.set(key, value);
  });
  return { fields, problems };
}

/** A module file as metadata and body; the body keeps its lines, so they count from the file's own. */
export function parseModule(path: string, source: string): Result<LearnModule, Problem[]> {
  const lines = source.split(/\r?\n/);
  const close = lines.indexOf(FENCE, 1);
  if (lines[0] !== FENCE || close === -1) {
    const detail = 'Open the file with front matter between 2 --- lines';
    return { ok: false, error: [{ path, code: 'module-front-matter', detail }] };
  }
  const { fields, problems } = readFields(path, lines.slice(1, close));
  if (problems.length > 0) return { ok: false, error: problems };
  const parsed = ModuleFrontMatterSchema.safeParse(Object.fromEntries(fields));
  if (!parsed.success) return { ok: false, error: schemaProblems(path, parsed.error.issues) };
  const body = lines.slice(close + 1).join('\n');
  const words = wordCount(body);
  const charts = parsed.data.chart === 'none' ? 0 : 1;
  return { ok: true, value: { ...parsed.data, body, words, readingMinutes: minutesToRead(words, charts) } };
}

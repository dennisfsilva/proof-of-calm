// The draft's rows against the staged diff, both ways (docs/CONTENT-OPS.md §3, steps 4 and 5): every
// changed JSON leaf that is not bookkeeping needs a changes[] row whose item is the data file and whose
// field is the leaf's path; every row names a changed leaf; a changed module (.mdx) needs at least one
// row; every changed file, a module too, needs a reviewed[] row, whose read and of the owner's flip
// rests on. The generated rules files are skipped. The agent never sets lastReviewed or nextReviewDue: the owner sets lastReviewed in the flip
// (§8), so a change to either is refused, in a module any changed line that names either.
import type { ReviewDraft } from './body.ts';

/** Leaves the agent changes as it reads, which need no changes[] row of their own. */
export const BOOKKEEPING: readonly RegExp[] = [
  /(?:^|\.)accessed$/,
  /(?:^|\.)reviewedBy$/,
  /(?:^|\.)status\.confidence$/,
];
const OWNER_ONLY = /(?:^|\.)(?:lastReviewed|nextReviewDue)$/;
const OWNER = 'the agent never sets lastReviewed or nextReviewDue; the owner sets lastReviewed in the flip';

function leaves(value: unknown, path: string, out: Map<string, string>): void {
  if (Array.isArray(value) && value.length > 0) {
    for (const [i, item] of value.entries()) leaves(item, `${path}[${i}]`, out);
  } else if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0) {
    for (const [key, item] of Object.entries(value)) leaves(item, path ? `${path}.${key}` : key, out);
  } else out.set(path, JSON.stringify(value));
}

/** Every leaf path whose value differs, was added or was removed; `before` undefined is a new file. */
export function leafChanges(before: unknown, after: unknown): string[] {
  const old = new Map<string, string>();
  const now = new Map<string, string>();
  if (before !== undefined) leaves(before, '', old);
  if (after !== undefined) leaves(after, '', now);
  return [...new Set([...old.keys(), ...now.keys()])].filter((path) => old.get(path) !== now.get(path));
}

/**
 * A module's lines that name either owner-only date, anywhere in the file. The loader and
 * validate:content own the front matter's parse; this reads text and may refuse too much.
 */
const dateLines = (source = ''): string[] =>
  source.split(/\r?\n/).filter((line) => /lastReviewed|nextReviewDue/.test(line));

/** A staged data file (repo-relative): a JSON file's changed leaves, or a module's (.mdx) two sources. */
type Changed = { file: string; leaves?: string[]; before?: string | undefined; after?: string | undefined };

/** Each staged data file against the draft's rows; a module's date lines are compared as an ordered list. */
export function rowProblems(draft: ReviewDraft, changed: readonly Changed[]): string[] {
  const problems: string[] = [];
  const itemOf = (file: string) => file.replace(/^packages\/content\//, '');
  for (const { file, leaves: paths, before, after } of changed) {
    const item = itemOf(file);
    if (item.startsWith('rules/')) continue;
    const rows = draft.changes.filter((change) => change.item === item);
    if (paths === undefined) {
      if (JSON.stringify(dateLines(before)) !== JSON.stringify(dateLines(after)))
        problems.push(`${file}: a line with lastReviewed or nextReviewDue changed; ${OWNER} (docs/CONTENT-OPS.md §8)`);
      if (rows.length === 0) problems.push(`${file}: changed, and no changes[] row names it`);
    } else {
      const bookkeeping = (path: string) => BOOKKEEPING.some((pattern) => pattern.test(path));
      for (const path of paths) {
        if (OWNER_ONLY.test(path))
          problems.push(`${file}: ${JSON.stringify(path)} changed; ${OWNER} (docs/CONTENT-OPS.md §8)`);
        else if (!bookkeeping(path) && !rows.some((change) => change.field === path))
          problems.push(`${file}: ${JSON.stringify(path)} changed, and no changes[] row names it`);
      }
    }
    if (!draft.reviewed.some((row) => row.item === item)) problems.push(`${file}: changed, and no reviewed[] row names it`);
  }
  for (const [i, change] of draft.changes.entries()) {
    const file = changed.find((entry) => itemOf(entry.file) === change.item);
    if (!file || (file.leaves !== undefined && !file.leaves.includes(change.field)))
      problems.push(
        `changes[${i}]: a row for a non-change, ${JSON.stringify(change.item)} ${JSON.stringify(change.field)}`,
      );
  }
  return problems;
}

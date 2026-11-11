// The draft's rows against the staged diff, both ways (docs/CONTENT-OPS.md §3, steps 4 and 5): every
// changed JSON leaf that is not bookkeeping needs a changes[] row whose item is the data file and whose
// field is the leaf's path; every row names a changed leaf; a changed module (.mdx) needs at least one
// row; a file whose changes are all bookkeeping needs a reviewed[] row. The generated rules files are
// skipped. The agent never sets lastReviewed or nextReviewDue: the owner sets lastReviewed in the flip
// (§8), so a change to either is refused.
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

/** Each staged data file (repo-relative; `leaves` undefined for a module) against the draft's rows. */
export function rowProblems(draft: ReviewDraft, changed: readonly { file: string; leaves?: string[] }[]): string[] {
  const problems: string[] = [];
  const itemOf = (file: string) => file.replace(/^packages\/content\//, '');
  for (const { file, leaves: paths } of changed) {
    const item = itemOf(file);
    if (item.startsWith('rules/')) continue;
    const rows = draft.changes.filter((change) => change.item === item);
    if (paths === undefined) {
      if (rows.length === 0) problems.push(`${file}: changed, and no changes[] row names it`);
      continue;
    }
    const bookkeeping = (path: string) => BOOKKEEPING.some((pattern) => pattern.test(path));
    for (const path of paths) {
      if (OWNER_ONLY.test(path))
        problems.push(`${file}: ${JSON.stringify(path)} changed; ${OWNER} (docs/CONTENT-OPS.md §8)`);
      else if (!bookkeeping(path) && !rows.some((change) => change.field === path))
        problems.push(`${file}: ${JSON.stringify(path)} changed, and no changes[] row names it`);
    }
    if (paths.every(bookkeeping) && !draft.reviewed.some((row) => row.item === item))
      problems.push(`${file}: only bookkeeping changed, and no reviewed[] row names it`);
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

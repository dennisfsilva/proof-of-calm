import { useEffect, useState } from 'react';

/** How long a Log form stays unchanged before its status takes the lines before Save (docs/DESIGN.md §6). */
export const SETTLE_MS = 1_000;

export type FormStatusProps = {
  /** The lines before Save as shown, in the column's order; null for a line not shown. */
  readonly lines: readonly (string | null)[];
  /** The form's typed state: each change restarts the wait, so a line is spoken once the person pauses. */
  readonly typed: unknown;
};

/** Between the settled lines in the state; no line of copy holds a line break. */
const BREAK = '\n';

/**
 * A Log form's one polite status, visually hidden, placed after Save (docs/DESIGN.md §6). It mounts empty with the form,
 * so the region exists before its content, and takes the lines once the form has stayed unchanged for SETTLE_MS, those
 * showing at opening included. Each settled change replaces the whole set, so the set is read whole even where
 * `aria-atomic` is ignored; an equal set changes no node, and a line that disappears is not spoken. Save leaves it alone.
 */
export function FormStatus({ lines, typed }: FormStatusProps) {
  const text = lines.filter((line) => line !== null).join(BREAK);
  const [settled, setSettled] = useState('');
  // `typed` is read only as a change: a keystroke that leaves the lines' text as it was restarts the wait too.
  useEffect(() => {
    void typed;
    const timer = setTimeout(() => setSettled(text), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [text, typed]);
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {settled !== '' && (
        <div key={settled}>
          {settled.split(BREAK).map((line, at) => (
            <p key={at}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}

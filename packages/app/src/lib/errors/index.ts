// The single error surface (docs/ARCHITECTURE.md): a coded error from the core becomes a message key and
// its values, worded by the messages under `errors` (lib/errors/messages); anything unexpected is
// reported once and shown as `errors.unknown`. Reporting goes to Sentry from M3 (ADR-0027).
import { BRAND } from '../brand';
import errors from './messages/en.json' with { type: 'json' };

type Coded = { readonly code: string };
export type ErrorMessage = {
  readonly key: string;
  readonly values: Readonly<Record<string, string>>;
};

const groups = Object.entries(errors).flatMap(([group, entries]) =>
  typeof entries === 'string' ? [] : Object.keys(entries).map((code) => [code, `errors.${group}.${code}`] as const),
);
const KEYS: ReadonlyMap<string, string> = new Map(groups);

type Reporter = (error: unknown) => void;
let reporter: Reporter = () => undefined;

/** Where unexpected errors go; the hosts set it once (M3: Sentry with PII scrubbing). */
export function setErrorReporter(next: Reporter): void {
  reporter = next;
}

export function reportError(error: unknown): void {
  reporter(error);
}

/**
 * The key and values that word an error. A coded error's other fields become its values (formatted by
 * the screen first when they are amounts or dates); an unknown code is reported and gets the generic line.
 */
export function errorMessage(error: unknown): ErrorMessage {
  const code = typeof error === 'object' && error !== null && 'code' in error ? (error as Coded).code : undefined;
  const key = code === undefined ? undefined : KEYS.get(code);
  if (key === undefined) {
    reportError(error);
    return { key: 'errors.unknown', values: { product: BRAND.name } };
  }
  const values: Record<string, string> = { product: BRAND.name };
  for (const [name, value] of Object.entries(error as Record<string, unknown>)) {
    if (name !== 'code' && (typeof value === 'string' || typeof value === 'number')) values[name] = String(value);
  }
  return { key, values };
}

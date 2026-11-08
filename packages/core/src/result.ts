// Errors as values at the core boundary (docs/DOMAIN.md §10): user-caused conditions return a
// Result; violated invariants (programmer errors) throw.

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * For a value an invariant guarantees but the types cannot see, such as an index into a list that is
 * known not to be empty. A missing value is a programmer error.
 */
export function defined<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new RangeError(`Missing ${what}`);
  return value;
}

/** For exhaustive switches over closed unions: adding a case fails the build where it is not handled. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}

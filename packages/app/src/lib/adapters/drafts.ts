// Drafts of abandoned forms (ADR-0020, ADR-0034): what was typed, kept in sessionStorage per form and
// entity, so leaving a form and coming back restores it; saving clears it. A draft is read back through
// the form's schema: one that no longer fits (an older version of the form, or a foreign value under the
// same key) is discarded. "Delete everything" clears them all (clearAll). Storage that throws (private
// browsing, a full quota, blocked site data) simply leaves the form without a draft.
import { BRAND } from '../brand';
import type { Schema } from './schema';

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export type Drafts = {
  /** The draft of `form` for `entity` ('new' before the entity exists), or null. */
  read<T>(form: string, entity: string, schema: Schema<T>): T | null;
  write(form: string, entity: string, value: unknown): void;
  clear(form: string, entity: string): void;
  /** Every draft of every form, for "Delete everything": what was typed is the user's data too. */
  clearAll(): void;
};

const PREFIX = `${BRAND.slug}:draft:`;
const keyOf = (form: string, entity: string) => `${PREFIX}${form}:${entity}`;

/** The browser's sessionStorage; missing in a server render, and access itself may throw. */
function sessionStore(): DraftStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function sessionDrafts(storage: () => DraftStorage | null = sessionStore): Drafts {
  /** Runs one storage call; a store that is missing or throws behaves like an empty one. */
  const attempt = <R>(run: (store: DraftStorage) => R): R | null => {
    try {
      const store = storage();
      return store === null ? null : run(store);
    } catch {
      return null;
    }
  };
  const clear = (form: string, entity: string) => {
    attempt((store) => store.removeItem(keyOf(form, entity)));
  };
  return {
    read(form, entity, schema) {
      const text = attempt((store) => store.getItem(keyOf(form, entity)));
      if (text === null) return null;
      const stored = parseJson(text);
      const parsed = stored === null ? null : schema.safeParse(stored.value);
      if (parsed?.success === true) return parsed.data;
      clear(form, entity);
      return null;
    },
    write(form, entity, value) {
      const saved = attempt((store) => {
        // Typed as string, but undefined for a value JSON cannot hold (undefined, a function).
        const text: string | undefined = JSON.stringify(value);
        if (text === undefined) return null;
        store.setItem(keyOf(form, entity), text);
        return true;
      });
      // A write that failed must not leave an older draft behind to be restored later.
      if (saved === null) clear(form, entity);
    },
    clear,
    clearAll() {
      attempt((store) => {
        const keys = Array.from({ length: store.length }, (_, index) => store.key(index));
        for (const key of keys) if (key?.startsWith(PREFIX)) store.removeItem(key);
      });
    },
  };
}

function parseJson(text: string): { readonly value: unknown } | null {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return null;
  }
}

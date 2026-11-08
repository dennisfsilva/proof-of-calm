// Helpers for reading parsed JSON of unknown shape at the import boundary.

export type JsonObject = Readonly<Record<string, unknown>>;

/** A plain object, not null and not an array. */
export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

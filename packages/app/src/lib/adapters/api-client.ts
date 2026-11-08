// The only way the app reaches its API (docs/ARCHITECTURE.md, rule 2 of "The API, the hosts and the store
// wrapper"; ADR-0032): an injectable base URL ('' on the web host, the hosted origin in the wrapper), no
// cookies, every answer validated against the caller's schema, and every failed request a value.
import { err, ok, type Result } from '@proofofcalm/core';
import type { ApiFailure } from '../ports';
import type { Schema } from './schema';

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export type ApiClientOptions = {
  /** Origin and path prefix without a trailing slash; '' for the same origin. */
  readonly baseUrl: string;
  /** The platform's fetch, bound to its global: `(input, init) => fetch(input, init)`. */
  readonly fetch: Fetch;
  /**
   * The signed-in user's access token, sent as a bearer header (ADR-0032, ADR-0035); null while signed
   * out. Nothing passes it before accounts exist in M3.
   */
  readonly token?: () => string | null | Promise<string | null>;
  /** How long to wait for an answer before it counts as a network failure. */
  readonly timeoutMs?: number;
};

export type ApiResponse<T> = { readonly data: T; readonly headers: Headers };

export type ApiClient = {
  /** GET `path` (with the query, if any); the body must be JSON that `schema` accepts. */
  get<T>(
    path: string,
    schema: Schema<T>,
    query?: Readonly<Record<string, string>>,
  ): Promise<Result<ApiResponse<T>, ApiFailure>>;
};

/** Long enough for a slow mobile connection, short enough that a stalled request ends as offline. */
const DEFAULT_TIMEOUT_MS = 10_000;

export function createApiClient(options: ApiClientOptions): ApiClient {
  const base = options.baseUrl.replace(/\/+$/, '');
  return {
    async get(path, schema, query = {}) {
      if (!path.startsWith('/')) throw new RangeError(`An API path starts with a slash: ${path}`);
      const search = new URLSearchParams(query).toString();
      let response: Response;
      let text: string;
      try {
        // Inside the try: a token getter that fails (a session refresh offline, M3) is a network failure.
        const token = (await options.token?.()) ?? null;
        response = await options.fetch(`${base}${path}${search === '' ? '' : `?${search}`}`, {
          method: 'GET',
          headers: { accept: 'application/json', ...(token === null ? {} : { authorization: `Bearer ${token}` }) },
          credentials: 'omit',
          signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
        // Read inside the try: a connection that drops mid-body is a network failure, not a bad body.
        text = await response.text();
      } catch {
        return err({ kind: 'network' });
      }
      if (!response.ok) return err({ kind: 'http', status: response.status });
      return validated(text, schema, response.headers);
    },
  };
}

function validated<T>(text: string, schema: Schema<T>, headers: Headers): Result<ApiResponse<T>, ApiFailure> {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return err({ kind: 'invalid' });
  }
  const parsed = schema.safeParse(body);
  return parsed.success ? ok({ data: parsed.data, headers }) : err({ kind: 'invalid' });
}

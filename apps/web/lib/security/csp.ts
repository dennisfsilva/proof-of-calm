// The Content-Security-Policy of docs/SECURITY.md §4, static since ADR-0045 §3: anchored on the hashes
// of the two inline scripts of app.html and the one inline style of the not-available page, not on a
// per-request nonce. Pure, so its exact output is unit-tested; lib/vercel-config.ts writes it into
// vercel.json, and lib/vercel-config.test.ts fails when the committed policy drifts from it.

const CSP_REPORT_PATH = '/api/csp-report';
const CSP_REPORT_GROUP = 'csp-endpoint';

export type CspContext = {
  /** Vite's dev server needs eval and inline styles; production never does. */
  development: boolean;
  /** Only an https origin may ask browsers to upgrade subresource requests. */
  https: boolean;
  /** `sha256-…` of each inline script the documents carry: the theme script and the boot script. */
  scriptHashes: readonly string[];
  /** `sha256-…` of each inline style: the not-available page's one rule. */
  styleHashes: readonly string[];
};

const quoted = (hashes: readonly string[]) => hashes.map((hash) => `'${hash}'`);

export function buildCsp({ development, https, scriptHashes, styleHashes }: CspContext): string {
  const directives: Array<[string, ...string[]]> = [
    ['default-src', "'self'"],
    ['script-src', "'self'", ...quoted(scriptHashes), "'strict-dynamic'", ...(development ? ["'unsafe-eval'"] : [])],
    ['style-src', "'self'", ...(development ? ["'unsafe-inline'"] : quoted(styleHashes))],
    ['img-src', "'self'", 'data:', 'blob:'],
    ['font-src', "'self'"],
    // M3 adds the Supabase project origin (https and wss); everything else is same-origin.
    ['connect-src', "'self'"],
    ['worker-src', "'self'", 'blob:'],
    ['manifest-src', "'self'"],
    ['frame-ancestors', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['object-src', "'none'"],
    ...(https ? ([['upgrade-insecure-requests']] as Array<[string]>) : []),
    // report-to for browsers with the Reporting API, report-uri for the others.
    ['report-uri', CSP_REPORT_PATH],
    ['report-to', CSP_REPORT_GROUP],
  ];
  return directives.map((parts) => parts.join(' ')).join('; ');
}

/** The Reporting-Endpoints header that names the group used by `report-to`. */
export function reportingEndpoints(): string {
  return `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`;
}

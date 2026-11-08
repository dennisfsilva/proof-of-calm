// CSP violation reports (docs/SECURITY.md §4, ADR-0028): from `report-uri` (application/csp-report)
// and from the Reporting API (application/reports+json). Only the directive and the blocked origin or
// keyword are kept, counted per UTC day; no page, path, query, user agent or address is stored.
import * as z from 'zod/mini';
import type { KeyValueStore } from '../server/store';

/** A report is a few hundred bytes; anything larger is not one. */
export const MAX_REPORT_BYTES = 16_384;
/** A browser batches reports; more than this in one request is not a browser. */
const MAX_VIOLATIONS = 20;
/** Daily aggregates are kept 24 months (docs/SECURITY.md §3). */
const COUNT_TTL_SECONDS = 730 * 86_400;

const CONTENT_TYPES = new Set(['application/csp-report', 'application/reports+json']);

const LegacyReport = z.looseObject({
  'csp-report': z.looseObject({
    'effective-directive': z.optional(z.string()),
    'violated-directive': z.optional(z.string()),
    'blocked-uri': z.optional(z.string()),
  }),
});

const ReportingReports = z.array(
  z.looseObject({
    type: z.string(),
    body: z.optional(z.looseObject({ effectiveDirective: z.optional(z.string()), blockedURL: z.optional(z.string()) })),
  }),
);

export type Violation = { readonly directive: string; readonly blocked: string };

const KEYWORDS = new Set(['inline', 'eval', 'wasm-eval', 'trusted-types-policy', 'trusted-types-sink']);

/** The directive's name, or `unknown` (a legacy `violated-directive` carries its sources after it). */
export function directiveName(value: string | undefined): string {
  const name = (value ?? '').trim().split(/\s+/)[0] ?? '';
  return /^[a-z-]{1,40}$/.test(name) ? name : 'unknown';
}

/** The blocked origin, a CSP keyword, or the scheme of a data:/blob: URL; never a path or a query. */
export function blockedSource(value: string | undefined): string {
  const uri = (value ?? '').trim();
  if (uri === '' || uri === 'self') return 'inline';
  if (KEYWORDS.has(uri)) return uri;
  if (/^(data|blob|filesystem):/i.test(uri)) return uri.split(':')[0]?.toLowerCase() ?? 'other';
  try {
    const url = new URL(uri);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : url.protocol.replace(/:$/, '');
  } catch {
    return 'other';
  }
}

/** The violations a parsed report body describes, at most MAX_VIOLATIONS. */
export function readViolations(contentType: string, body: unknown): Violation[] {
  if (contentType === 'application/csp-report') {
    const report = LegacyReport.safeParse(body);
    if (!report.success) return [];
    const fields = report.data['csp-report'];
    return [
      {
        directive: directiveName(fields['effective-directive'] ?? fields['violated-directive']),
        blocked: blockedSource(fields['blocked-uri']),
      },
    ];
  }
  const reports = ReportingReports.safeParse(body);
  if (!reports.success) return [];
  return reports.data
    .filter((report) => report.type === 'csp-violation')
    .slice(0, MAX_VIOLATIONS)
    .map((report) => ({
      directive: directiveName(report.body?.effectiveDirective),
      blocked: blockedSource(report.body?.blockedURL),
    }));
}

export type CspReportDeps = {
  readonly store: KeyValueStore;
  /** The UTC calendar day the reports are counted under, YYYY-MM-DD. */
  readonly today: () => string;
};

const noContent = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });

export async function handleCspReport(request: Request, deps: CspReportDeps): Promise<Response> {
  const contentType = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!CONTENT_TYPES.has(contentType)) return noContent(415);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_REPORT_BYTES) return noContent(413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_REPORT_BYTES) return noContent(413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return noContent(400);
  }
  const key = `csp:${deps.today()}`;
  for (const violation of readViolations(contentType, body)) {
    try {
      await deps.store.increment(key, `${violation.directive} ${violation.blocked}`, COUNT_TTL_SECONDS);
    } catch {
      // A counter that cannot be written is a lost count, never a failed report.
    }
  }
  return noContent(204);
}

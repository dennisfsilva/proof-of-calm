// Static security headers (docs/SECURITY.md §4), written into vercel.json for every response by
// lib/vercel-config.ts. The CSP is not here: it is static and hashed, with no nonce (ADR-0045 §3), and
// lib/security/csp.ts builds it.

export const securityHeaders = [
  // Submit to hstspreload.org only when every subdomain is HTTPS-only (docs/SECURITY.md §4).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // publickey-credentials-* stay unrestricted for passkeys (M3).
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // Nothing is indexed before the public launch after M2 (docs/ROADMAP.md, docs/GROWTH.md §4.1).
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
] as const;

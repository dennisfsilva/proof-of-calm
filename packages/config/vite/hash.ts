import { createHash } from 'node:crypto';

/**
 * The CSP hash expression of an inline script's or style's text: `sha256-<base64 digest>`, to be
 * quoted in the policy (`'sha256-…'`). A hash covers the element's text only, never its attributes.
 */
export function sha256(text: string): string {
  return `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;
}

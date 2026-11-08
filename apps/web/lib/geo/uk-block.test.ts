import { describe, expect, it } from 'vitest';
import { escapeHtml, isBlockedCountry, isExemptPath, NOT_AVAILABLE_STYLE, notAvailableHtml } from './uk-block';

describe('the UK block (ADR-0029)', () => {
  it('blocks GB, whatever its case or padding, and nothing else', () => {
    expect([isBlockedCountry('GB'), isBlockedCountry('gb'), isBlockedCountry(' GB ')]).toEqual([true, true, true]);
    expect([isBlockedCountry('PT'), isBlockedCountry('IE'), isBlockedCountry(''), isBlockedCountry(null)]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('leaves the legal pages and security.txt reachable, with or without a trailing slash', () => {
    for (const path of [
      '/terms',
      '/privacy',
      '/risk',
      '/cookies',
      '/contact',
      '/contact/',
      '/.well-known/security.txt',
    ]) {
      expect(isExemptPath(path), path).toBe(true);
    }
    for (const path of ['/', '/today', '/learn', '/terms/extra', '/Terms'])
      expect(isExemptPath(path), path).toBe(false);
  });

  it('serves one sentence and the legal pages, with no script and no request to be indexed', () => {
    const html = notAvailableHtml();
    expect(html).toContain('<h1>Not available in the United Kingdom</h1>');
    expect(html).toContain('<p>Proof of Calm is not available in the United Kingdom yet.</p>');
    for (const path of ['/terms', '/privacy', '/risk', '/cookies', '/contact'])
      expect(html).toContain(`href="${path}"`);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).not.toMatch(/<script|<link|<form|<input/i);
  });

  it('styles itself with one static rule, the one the CSP hashes: paper and ink in each theme, links in the ink', () => {
    const html = notAvailableHtml();
    expect(html.match(/<style[^>]*>/g)).toEqual(['<style>']);
    expect(html).toContain(`<style>${NOT_AVAILABLE_STYLE}</style>`);
    expect(NOT_AVAILABLE_STYLE).toBe(
      'body{background:#f7f4ef;color:#1c1a18}a{color:inherit}@media (prefers-color-scheme:dark){body{background:#151412;color:#f1f0ec}}',
    );
  });

  it('escapes text before it goes into the page', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });
});

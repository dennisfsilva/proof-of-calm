import { describe, expect, it } from 'vitest';
import { siteTranslator } from './site-messages';

describe('siteTranslator', () => {
  it('words the site pages from the English site messages, with their values', () => {
    expect(siteTranslator('legal')('terms.title')).toBe('Terms of use');
    expect(siteTranslator('unavailable')('body', { product: 'Product' })).toBe(
      'Product is not available in the United Kingdom yet.',
    );
  });

  it('names the links the 404 page has, the home page and the legal pages, and no more', () => {
    expect(siteTranslator('notFound')('body')).toBe(
      'There is no page at this address. The home page and the legal pages are linked below.',
    );
  });

  it('takes only the namespaces and keys of those messages', () => {
    // Compiled, never called: `pnpm typecheck` holds the marked lines to being errors.
    const unknown = () => {
      // @ts-expect-error: no namespace of that name
      siteTranslator('nowhere');
      // @ts-expect-error: no key of that name in legal
      siteTranslator('legal')('terms.nothing');
    };
    expect(unknown).toBeTypeOf('function');
  });
});

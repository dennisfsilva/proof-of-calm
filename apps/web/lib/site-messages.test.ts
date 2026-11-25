import { COINS } from '@proofofcalm/content';
import { describe, expect, it } from 'vitest';
import { englishLang, siteTranslator } from './site-messages';

describe('siteTranslator', () => {
  it('words the site pages from the English site messages, with their values', () => {
    expect(siteTranslator('legal')('terms.title')).toBe('Terms of use');
    expect(siteTranslator('unavailable')('body', { product: 'Product' })).toBe(
      'Product is not available in the United Kingdom yet.',
    );
  });

  it('words them in pt-PT, the four legal pages’ objects falling back to English key by key', () => {
    const legal = siteTranslator('legal', 'pt-PT');
    expect(legal('risk.title')).toBe('Aviso sobre riscos');
    expect(legal('terms.title')).toBe('Terms of use');
    expect(siteTranslator('unavailable', 'pt-PT')('body', { product: 'Product' })).toBe(
      'A Product ainda não está disponível no Reino Unido.',
    );
  });

  it('words them in German, the four legal pages’ objects falling back to English key by key', () => {
    const legal = siteTranslator('legal', 'de');
    expect(legal('risk.title')).toBe('Risikohinweise');
    expect(legal('terms.title')).toBe('Terms of use');
    expect(siteTranslator('unavailable', 'de')('body', { product: 'Product' })).toBe(
      'Product ist im Vereinigten Königreich noch nicht verfügbar.',
    );
  });

  it('marks as English only what a language leaves in English', () => {
    expect(englishLang('pt-PT', 'legal.terms.title')).toBe('en');
    expect(englishLang('pt-PT', 'legal.cookies.storesTab')).toBe('en');
    expect(englishLang('pt-PT', 'legal.risk.title')).toBeUndefined();
    expect(englishLang('en', 'legal.terms.title')).toBeUndefined();
  });

  it('reads German’s own file for what German leaves in English', () => {
    expect(englishLang('de', 'legal.terms.title')).toBe('en');
    expect(englishLang('de', 'legal.contact.security')).toBe('en');
    expect(englishLang('de', 'legal.risk.title')).toBeUndefined();
    expect(englishLang('de', 'notFound.body')).toBeUndefined();
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

  it('names no coin of the catalogue in the manifest description, every page’s og:description (LEGAL §3)', () => {
    const description = [
      siteTranslator('manifest')('description'),
      siteTranslator('manifest', 'pt-PT')('description'),
      siteTranslator('manifest', 'de')('description'),
    ].join(' ');
    const named = COINS.flatMap((coin) => [coin.name, coin.id]).filter((word) =>
      new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(description),
    );
    expect(named).toEqual([]);
  });
});

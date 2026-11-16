import { describe, expect, it } from 'vitest';
import { textLang } from './text-lang';

describe('textLang (WCAG 2.2 SC 3.1.2, ADR-0057)', () => {
  it("names the content's language only where it differs from the UI's", () => {
    expect(textLang('en', 'pt-PT')).toBe('en');
    expect(textLang('pt-PT', 'en')).toBe('pt-PT');
    expect(textLang('pt-PT', 'pt-PT')).toBeUndefined();
    expect(textLang('en', 'en')).toBeUndefined();
  });

  it('leaves the page language for text of no known language: an object no loader returned', () => {
    expect(textLang(undefined, 'pt-PT')).toBeUndefined();
    expect(textLang(undefined, 'en')).toBeUndefined();
  });
});

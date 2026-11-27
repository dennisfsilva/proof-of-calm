import { describe, expect, it } from 'vitest';
import { cssString } from './css-string';

// A label set as a custom property is one CSS string (CSSOM's serialize-a-string), so no translation can end the
// string early or add a declaration.

describe('cssString', () => {
  it('wraps plain text in double quotes', () => {
    expect(cssString('Source')).toBe('"Source"');
    expect(cssString('Fonte')).toBe('"Fonte"');
  });

  it('escapes a backslash, a double quote and a newline inside one double-quoted string', () => {
    expect(cssString('a\\b"c\nd')).toBe(String.raw`"a\\b\"c\a d"`);
  });

  it('escapes the other control characters by code point and replaces NUL', () => {
    expect(cssString('a\u0009b\u007fc\u0000')).toBe('"a\\9 b\\7f c\uFFFD"');
  });

  it('keeps a single quote and non-ASCII text as they are', () => {
    expect(cssString("l'été · Quelle")).toBe(`"l'été · Quelle"`);
  });
});

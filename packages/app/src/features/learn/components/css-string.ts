// Text as one double-quoted CSS string, as CSSOM's "serialize a string" writes it, so a label set as a custom
// property through `style.setProperty` can neither end the string early nor add a declaration.

const escapeChar = (char: string): string => {
  const code = char.codePointAt(0) ?? 0;
  if (code === 0) return String.fromCodePoint(0xfffd);
  if (code < 0x20 || code === 0x7f) return `\\${code.toString(16)} `;
  return char === '"' || char === '\\' ? `\\${char}` : char;
};

export const cssString = (text: string): string => `"${Array.from(text, escapeChar).join('')}"`;

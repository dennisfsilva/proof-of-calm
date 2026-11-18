import { describe, expect, it } from 'vitest';
import { printedGap, printedPercentText, printedText } from './percent-gap.ts';

// One printing for every quoted text and every gap in a detail (ADR-0057's Corrections, 2026-11-18): a hidden or
// look-alike character prints by its code point, so a refused joiner never reads as the allowed form.
const char = (code: number) => String.fromCodePoint(code);

describe('printedText', () => {
  it('names each hidden or look-alike character by its code point, each followed by a space', () => {
    const named = [0x202f, 0x2009, 0x2007, 0x3000, 0x2060, 0x2011, 0x2010, 0x09];
    expect(named.map((code) => printedText(`40${char(code)}%`, []))).toEqual([
      '40U+202F %',
      '40U+2009 %',
      '40U+2007 %',
      '40U+3000 %',
      '40U+2060 %',
      '40U+2011 %',
      '40U+2010 %',
      '40U+0009 %',
    ]);
  });

  it('keeps an ordinary space, the hyphen-minus and the shown joiners as written', () => {
    const nbsp = char(0xa0);
    expect(printedText(`Lei 24-D, 40${nbsp}%`, [nbsp])).toBe(`Lei 24-D, 40${nbsp}%`);
    expect(printedText(`40${nbsp}%`, [])).toBe('40U+00A0 %');
  });

  // #388: the printer names exactly what the page reader drops (packages/config/vite/page-blocks.ts), so a hidden
  // character of any general category shows in a detail: Cf, Mn (U+034F, U+FE0F), Lo (U+3164) and Cn (U+2065).
  it('names every default-ignorable code point, whatever its general category', () => {
    const ignorable = /^\p{Default_Ignorable_Code_Point}$/u;
    const points: number[] = [];
    for (let point = 0; point <= 0x10ffff; point += 1)
      if ((point < 0xd800 || point > 0xdfff) && ignorable.test(String.fromCodePoint(point))) points.push(point);
    expect(points.length).toBe(4174);
    const name = (point: number) => `U+${point.toString(16).toUpperCase().padStart(4, '0')}`;
    expect(points.filter((point) => printedText(`a${char(point)}b`, []) !== `a${name(point)} b`).map(name)).toEqual([]);
    expect(printedText(`in${char(0x34f)}puts`, [])).toBe('inU+034F puts');
    const nbsp = char(0xa0);
    expect(printedText(`6 ${nbsp}inputs`, [nbsp])).toBe(`6 ${nbsp}inputs`);
    expect(printedText(`6 ${nbsp}inputs`, [])).toBe('6 U+00A0 inputs');
  });
});

describe('printedPercentText', () => {
  it('keeps a joiner as written only directly before a percent sign and names it anywhere else', () => {
    const [nbsp, nnbsp] = [char(0xa0), char(0x202f)];
    const joiners = [nbsp, nnbsp];
    expect(printedPercentText(`Ether${nbsp}fell 94${nbsp}% and 82${nnbsp}%.`, joiners)).toBe(
      `EtherU+00A0 fell 94${nbsp}% and 82${nnbsp}%.`,
    );
    expect(printedPercentText(`4${nnbsp} %, 9${char(0x2009)}%`, joiners)).toBe('4U+202F  %, 9U+2009 %');
  });

  it('names a default-ignorable mark away from a percent sign', () => {
    const nbsp = char(0xa0);
    expect(printedPercentText(`Ether${char(0xfe0f)} fell 94${nbsp}%`, [nbsp, ' '])).toBe(
      `EtherU+FE0F  fell 94${nbsp}%`,
    );
  });

  it('keeps as written each hidden character a match of `joined` covers, and names the rest', () => {
    const [nbsp, nnbsp] = [char(0xa0), char(0x202f)];
    const joined = new RegExp(`(?<=had [0-9]+)${nbsp}(?=falls)`, 'gu');
    expect(printedPercentText(`had 4${nbsp}falls, had 4${nnbsp}falls, a${nbsp}fall`, [nbsp], joined)).toBe(
      `had 4${nbsp}falls, had 4U+202F falls, aU+00A0 fall`,
    );
  });
});

describe('printedGap', () => {
  it('prints every character of a gap, two spaces as two U+0020', () => {
    expect(printedGap('  ', [])).toBe('U+0020 U+0020 ');
    expect(printedGap(' ', [' '])).toBe(' ');
  });
});

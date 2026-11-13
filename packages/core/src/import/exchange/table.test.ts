import { describe, expect, it } from 'vitest';
import { csvRows } from './table';

// "RFC 4180: quotes, doubled quotes, CR, LF and CRLF (kept inside quotes), a leading U+FEFF dropped, a
// last empty line dropped" (the exchange import's reader, docs/DOMAIN.md §3.13).
describe('csvRows', () => {
  it('splits cells on commas and rows on LF, CRLF and CR', () => {
    expect(csvRows('a,b\nc,d\r\ne,f\rg,h')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
      ['g', 'h'],
    ]);
  });

  it('drops the last empty line, and only the last', () => {
    expect(csvRows('a\n')).toEqual([['a']]);
    expect(csvRows('a\r\n')).toEqual([['a']]);
    expect(csvRows('a\n\nb\n\n')).toEqual([['a'], [''], ['b'], ['']]);
    expect(csvRows('\n')).toEqual([['']]);
    expect(csvRows('')).toEqual([]);
  });

  it('keeps empty cells at either end and between commas', () => {
    expect(csvRows(',a,,\n')).toEqual([['', 'a', '', '']]);
  });

  it('reads a quoted cell without its quotes, with a doubled quote read as one', () => {
    expect(csvRows('"a","b ""c"""\n')).toEqual([['a', 'b "c"']]);
    expect(csvRows('""\n""""')).toEqual([[''], ['"']]);
  });

  it('keeps commas, CR, LF and CRLF inside quotes', () => {
    expect(csvRows('"a,b","c\nd","e\r\nf","g\rh"\n')).toEqual([['a,b', 'c\nd', 'e\r\nf', 'g\rh']]);
  });

  it('reads a quote after the first character of a cell, or after its closing quote, as text', () => {
    expect(csvRows('a"b,"c"d"\n')).toEqual([['a"b', 'cd"']]);
  });

  it('ends an unclosed quote at the end of the text', () => {
    expect(csvRows('a,"b\n')).toEqual([['a', 'b\n']]);
  });

  it('drops a leading U+FEFF and keeps one anywhere else', () => {
    expect(csvRows('﻿txid,refid\n﻿a,b')).toEqual([
      ['txid', 'refid'],
      ['﻿a', 'b'],
    ]);
  });
});

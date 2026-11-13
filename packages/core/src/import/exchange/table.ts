// The table of an exchange's CSV export (docs/DOMAIN.md §3.13, the exchange import). Pure: text in, rows
// of cells out, nothing interpreted.

/**
 * RFC 4180: quotes, doubled quotes, CR, LF and CRLF (kept inside quotes), a leading U+FEFF dropped, a
 * last empty line dropped. A quote inside an unquoted cell, or after a cell's closing quote, is text,
 * and a quote left open runs to the end of the text.
 */
export function csvRows(text: string): string[][] {
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false; // inside a quoted cell
  let fresh = true; // nothing read yet in this cell
  let started = false; // anything read on this line
  for (let index = 0; index < body.length; index += 1) {
    const char = body.charAt(index);
    started = true;
    if (quoted) {
      if (char !== '"') cell += char;
      else if (body.charAt(index + 1) === '"') {
        cell += '"';
        index += 1;
      } else quoted = false;
    } else if (char === '"' && fresh) {
      quoted = true;
      fresh = false;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
      fresh = true;
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && body.charAt(index + 1) === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      fresh = true;
      started = false;
    } else {
      cell += char;
      fresh = false;
    }
  }
  if (started) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

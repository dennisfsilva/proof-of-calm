import { describe, expect, it } from 'vitest';
import file from '../../cycles/drawdowns.json' with { type: 'json' };
import { loadCycleDrawdowns } from './cycles.ts';

describe('loadCycleDrawdowns (docs/DOMAIN.md §3.11)', () => {
  it('parses drawdowns.json, every row with its publisher, in the file’s order', () => {
    const loaded = loadCycleDrawdowns();
    if (!loaded.ok) throw new Error(loaded.error.join('; '));
    expect(loaded.value.map((row) => `${row.coin} ${row.high} ${row.fall}`)).toEqual(
      file.drawdowns.map((row) => `${row.coin} ${row.high} ${row.fall}`),
    );
    expect(loaded.value.length).toBe(9);
    for (const row of loaded.value) expect(row.publisher).not.toBe('');
  });

  it('refuses a malformed row, naming the field', () => {
    const [first, ...rest] = file.drawdowns;
    const malformed = { ...file, drawdowns: [{ ...first, fall: '-94' }, ...rest] };
    expect(loadCycleDrawdowns(malformed)).toEqual({ ok: false, error: [expect.stringContaining('drawdowns.0.fall')] });
    const { publisher: _publisher, ...unsourced } = first ?? {};
    expect(loadCycleDrawdowns({ ...file, drawdowns: [unsourced] }).ok).toBe(false);
  });

  it('reads a row computed from daily closes, and refuses any other basis', () => {
    const [first, ...rest] = file.drawdowns;
    const closes = loadCycleDrawdowns({ ...file, drawdowns: [{ ...first, basis: 'close' }, ...rest] });
    if (!closes.ok) throw new Error(closes.error.join('; '));
    expect(closes.value[0]?.basis).toBe('close');
    expect(closes.value[1]?.basis).toBeUndefined();
    expect(loadCycleDrawdowns({ ...file, drawdowns: [{ ...first, basis: 'intraday' }, ...rest] })).toEqual({
      ok: false,
      error: [expect.stringContaining('drawdowns.0.basis')],
    });
  });
});

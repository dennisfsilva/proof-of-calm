import { type Decimal, decimal } from '@proofofcalm/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { errorMessage } from '../errors';
import { messages } from '../i18n/messages';
import { createNumberInput, type NumberInput } from './number-input';

const NBSP = '\u00a0';
const NNBSP = '\u202f';
const en = createNumberInput('en-GB');
const pt = createNumberInput('pt-PT');
const de = createNumberInput('de-DE');

/** The parsed decimal, or the error code. */
function read(input: NumberInput, typed: string): string {
  const result = input.parse(typed);
  return result.ok ? result.value : result.error.code;
}

describe('numeric input (ADR-0034)', () => {
  it('reads the ADR’s fixtures as each locale allows', () => {
    const fixtures: [string, string, string, string][] = [
      // typed        en-GB             pt-PT             de-DE
      ['1.234,56', 'number-invalid', 'number-invalid', '1234.56'],
      ['1 234,56', 'number-invalid', '1234.56', 'number-invalid'],
      ['1,234.56', '1234.56', 'number-invalid', 'number-invalid'],
      ['1234.56', '1234.56', '1234.56', '1234.56'],
      ['1234,56', '1234.56', '1234.56', '1234.56'],
      ['12,5', '12.5', '12.5', '12.5'],
      ['12.5', '12.5', '12.5', '12.5'],
      ['1,234,56', 'number-invalid', 'number-invalid', 'number-invalid'],
    ];
    for (const [typed, inEnglish, inPortuguese, inGerman] of fixtures) {
      expect([typed, read(en, typed), read(pt, typed), read(de, typed)]).toEqual([
        typed,
        inEnglish,
        inPortuguese,
        inGerman,
      ]);
    }
  });

  it('takes a plain space where the locale groups with a no-break or a narrow no-break space', () => {
    expect([`1${NBSP}234,56`, `1${NNBSP}234,56`, '1 234 567,8'].map((typed) => read(pt, typed))).toEqual([
      '1234.56',
      '1234.56',
      '1234567.8',
    ]);
    const fr = createNumberInput('fr-FR');
    expect([`1${NNBSP}234,5`, '1 234,5', `1${NBSP}234,5`].map((typed) => read(fr, typed))).toEqual([
      '1234.5',
      '1234.5',
      '1234.5',
    ]);
    expect(read(en, '1 234.56')).toBe('number-invalid');
  });

  it('reads well-formed groups as the locale writes them, and only those', () => {
    expect(read(en, '1,234')).toBe('1234');
    expect(read(en, '1,234,567.89')).toBe('1234567.89');
    expect(read(de, '1.234')).toBe('1234');
    expect(read(de, '1.234.567,89')).toBe('1234567.89');
    // A group never starts with zero, so 0.005 typed on an English keyboard is a decimal in de-DE.
    expect(read(de, '0.005')).toBe('0.005');
    expect(read(de, '1.5')).toBe('1.5');
    expect(read(en, '0,5')).toBe('0.5');
    // A comma that cannot be a group in en-GB is a decimal comma from another keyboard, if it is the only one.
    expect(read(en, '1,2345')).toBe('1.2345');
    expect(read(en, '12,34.5')).toBe('number-invalid');
    expect(read(de, '1.23,4')).toBe('number-invalid');
    expect(read(de, '1.234.56')).toBe('number-invalid');
    expect(read(pt, '1 234.56')).toBe('number-invalid');
  });

  it('refuses two decimal separators, letters, signs and anything else', () => {
    for (const typed of ['1.2.3', '1,2,3', 'abc', '12a', '1e5', '€12', '12 €', '+12', '12-', '(12)', ',', '.']) {
      expect([typed, read(en, typed), read(pt, typed), read(de, typed)]).toEqual([
        typed,
        'number-invalid',
        'number-invalid',
        'number-invalid',
      ]);
    }
  });

  it('says empty for nothing but whitespace, and never accepts a minus', () => {
    for (const typed of ['', '   ', `${NBSP}\t`]) expect(read(pt, typed)).toBe('number-empty');
    for (const typed of ['-12', '\u221212,5', '- 1']) expect(read(pt, typed)).toBe('number-negative');
  });

  it('normalises what it accepts into a plain decimal string', () => {
    expect([' 12,5 ', '007', '0,50', '0,0', ',5', '12,', '0'].map((typed) => read(pt, typed))).toEqual([
      '12.5',
      '7',
      '0.5',
      '0',
      '0.5',
      '12',
      '0',
    ]);
    expect([read(en, '.5'), read(en, '12.'), read(en, ',5'), read(en, '12,')]).toEqual(['0.5', '12', '0.5', '12']);
  });

  it('keeps every typed decimal up to Intl’s limit of 100', () => {
    expect(read(en, `0.${'1'.repeat(100)}`)).toBe(`0.${'1'.repeat(100)}`);
    expect(read(en, `0.${'1'.repeat(101)}`)).toBe('number-invalid');
  });

  it('words every refusal through the error surface, with the example as a value', () => {
    const errors = ['', '-1', '1,2,3'].map((typed) => {
      const result = pt.parse(typed);
      return result.ok ? null : errorMessage(result.error);
    });
    expect(errors).toEqual([
      { key: 'errors.input.number-empty', values: { product: 'Proof of Calm' } },
      { key: 'errors.input.number-negative', values: { product: 'Proof of Calm' } },
      { key: 'errors.input.number-invalid', values: { product: 'Proof of Calm', example: '1234,56' } },
    ]);
    for (const { key } of errors.filter((error) => error !== null)) {
      expect(key.split('.').reduce<unknown>((tree, part) => (tree as Record<string, unknown>)[part], messages)).toEqual(
        expect.any(String),
      );
    }
  });

  it('shows an example in the locale’s format with the refusal', () => {
    expect([en, pt, de].map((input) => input.parse('1,2,3,'))).toEqual([
      { ok: false, error: { code: 'number-invalid', example: '1,234.56' } },
      { ok: false, error: { code: 'number-invalid', example: '1234,56' } },
      { ok: false, error: { code: 'number-invalid', example: '1.234,56' } },
    ]);
  });

  it('writes a value back in the locale’s format without rounding it', () => {
    const d = (value: string) => value as Decimal;
    expect(en.format(d('1234.5'))).toBe('1,234.5');
    expect(pt.format(d('1234.5'))).toBe('1234,5');
    expect(pt.format(d('12345.5'))).toBe(`12${NBSP}345,5`);
    expect(de.format(d('1234.56'))).toBe('1.234,56');
    expect(en.format(d('0.123456789012'))).toBe('0.123456789012');
    expect(en.format(d('123456789012345678901234567890'))).toBe('123,456,789,012,345,678,901,234,567,890');
    expect(en.format(d('12.5'), 2)).toBe('12.50');
    expect(de.format(d('12'), 2)).toBe('12,00');
    expect(en.format(d('0.00012345'), 2)).toBe('0.00012345');
  });

  it('reads back what it writes, in every formatting locale in sight (ADR-0017)', () => {
    const locales = ['en-GB', 'en-IE', 'en-US', 'pt-PT', 'de-DE', 'de-AT', 'de-CH', 'fr-FR', 'es-ES', 'it-IT', 'nl-BE'];
    const inputs = locales.map((locale) => createNumberInput(locale));
    const decimals = fc
      .tuple(fc.bigInt({ min: 0n, max: 10n ** 18n }), fc.option(fc.stringMatching(/^\d{1,12}$/)))
      .map(([whole, fraction]) => decimal(fraction === null ? `${whole}` : `${whole}.${fraction}`));
    fc.assert(
      fc.property(decimals, fc.integer({ min: 0, max: 2 }), (value, padding) => {
        for (const input of inputs) {
          const written = input.format(value, padding);
          expect(read(input, written)).toBe(value);
          expect(input.format(decimal(read(input, written)), padding)).toBe(written);
        }
      }),
    );
  });
});

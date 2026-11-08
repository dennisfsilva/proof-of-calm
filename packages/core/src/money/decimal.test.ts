import { describe, expect, it } from 'vitest';
import {
  abs,
  compare,
  type Decimal,
  decimal,
  decimalPlaces,
  fromFloat,
  impliedPrice,
  isDecimalString,
  isNegative,
  isPositive,
  isZero,
  type Money,
  MoneySchema,
  max,
  min,
  minus,
  negate,
  type Percent,
  PercentSchema,
  type Price,
  PriceSchema,
  parseDecimal,
  percentage,
  percentOf,
  plus,
  product,
  quotient,
  quotientSignificant,
  RatioSchema,
  type Rounding,
  ratio,
  round,
  roundSignificant,
  sum,
  type Units,
  UnitsSchema,
  unitsFor,
  valueAt,
} from './decimal';

const m = (value: string) => decimal<Money>(value);
const u = (value: string) => decimal<Units>(value);
const p = (value: string) => decimal<Price>(value);
const pct = (value: string) => decimal<Percent>(value);

describe('decimal strings', () => {
  it.each([
    ['0', true],
    ['1234.56', true],
    ['0.01234567', true],
    ['-12.3', true],
    ['1.50', true],
    ['-0', false],
    ['-0.00', false],
    ['01', false],
    ['.5', false],
    ['1.', false],
    ['+1', false],
    ['1e5', false],
    ['1,5', false],
    [' 1', false],
    ['', false],
    ['NaN', false],
    ['Infinity', false],
  ])('%s → %s', (value, valid) => {
    expect(isDecimalString(value)).toBe(valid);
  });

  it('validates with the branded schemas', () => {
    for (const schema of [MoneySchema, UnitsSchema, PriceSchema, PercentSchema, RatioSchema]) {
      expect(schema.safeParse('12.5').success).toBe(true);
      expect(schema.safeParse('1e3').success).toBe(false);
      expect(schema.safeParse(12.5).success).toBe(false);
    }
  });

  it('normalises on parse and refuses anything else', () => {
    expect(parseDecimal('1.50')).toBe('1.5');
    expect(parseDecimal('0.000')).toBe('0');
    expect(parseDecimal('-1.20')).toBe('-1.2');
    expect(parseDecimal('100.00')).toBe('100');
    expect(parseDecimal('1e5')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
  });

  it('never writes exponent notation, however small or large', () => {
    expect(m('0.0000000001')).toBe('0.0000000001');
    expect(m('1000000000000000000000000')).toBe('1000000000000000000000000');
    expect(product<Money>(u('0.00000001'), p('0.00000001'))).toBe('0.0000000000000001');
  });

  it('treats a malformed literal as a programmer error', () => {
    expect(() => decimal('1,5')).toThrow('"1,5" is not a plain decimal string');
  });
});

describe('exact arithmetic', () => {
  it('adds and subtracts without float error', () => {
    expect(plus(m('0.1'), m('0.2'))).toBe('0.3');
    expect(minus(m('0.3'), m('0.1'))).toBe('0.2');
    expect(minus(m('1'), m('1'))).toBe('0');
    expect(sum([m('33.34'), m('33.33'), m('33.33')])).toBe('100');
    expect(sum<Money>([])).toBe('0');
  });

  it('negates, takes absolute values and normalises negative zero', () => {
    expect(negate(m('12.5'))).toBe('-12.5');
    expect(negate(m('0'))).toBe('0');
    expect(abs(m('-12.5'))).toBe('12.5');
  });

  it('compares and classifies', () => {
    expect(compare(m('1.10'), m('1.1'))).toBe(0);
    expect(compare(m('2'), m('10'))).toBe(-1);
    expect(compare(m('-1'), m('-2'))).toBe(1);
    expect([isZero(m('0')), isZero(m('0.01'))]).toEqual([true, false]);
    expect([isPositive(m('0.01')), isPositive(m('0')), isPositive(m('-1'))]).toEqual([true, false, false]);
    expect([isNegative(m('-0.01')), isNegative(m('0'))]).toEqual([true, false]);
    expect(max(m('3'), m('10'), m('9.99'))).toBe('10');
    expect(min(m('3'), m('10'), m('-9.99'))).toBe('-9.99');
    expect(max(m('3'))).toBe('3');
  });

  it('multiplies exactly', () => {
    expect(valueAt(u('0.0012345'), p('81533.40'))).toBe('100.6529823');
    expect(product<Money>(m('100'), decimal<Decimal>('1.89'))).toBe('189');
  });

  it('counts decimal places of a normalised value', () => {
    expect(decimalPlaces(m('12'))).toBe(0);
    expect(decimalPlaces(m('12.5'))).toBe(1);
    expect(decimalPlaces(u('0.00000001'))).toBe(8);
  });
});

describe('fromFloat', () => {
  it('takes a number as typed and rounds it half-even, exponents included', () => {
    expect(fromFloat(70, 2)).toBe('70');
    expect(fromFloat(0.1 + 0.2, 2)).toBe('0.3');
    expect(fromFloat(2.675, 2)).toBe('2.68');
    expect(fromFloat(2.665, 2)).toBe('2.66');
    expect(fromFloat(1e-7, 10)).toBe('0.0000001');
    expect(fromFloat(1.23456789012e-5, 10)).toBe('0.0000123457');
    expect(fromFloat(-0, 2)).toBe('0');
  });

  it('refuses numbers that are not finite', () => {
    expect(() => fromFloat(Number.NaN, 2)).toThrow('NaN is not a finite number');
    expect(() => fromFloat(Number.POSITIVE_INFINITY, 2)).toThrow('is not a finite number');
  });
});

describe('rounding modes', () => {
  it.each([
    ['2.345', 'down', '2.34'],
    ['2.345', 'up', '2.35'],
    ['2.345', 'half-up', '2.35'],
    ['2.345', 'half-even', '2.34'],
    ['2.355', 'half-even', '2.36'],
    ['2.3449', 'half-up', '2.34'],
    ['-2.345', 'down', '-2.34'],
    ['-2.345', 'up', '-2.35'],
    ['-2.345', 'half-up', '-2.35'],
    ['-2.345', 'half-even', '-2.34'],
    ['-0.001', 'half-even', '0'],
  ] as const)('round(%s, 2, %s) = %s', (value, mode, expected) => {
    expect(round(m(value), 2, mode)).toBe(expected);
  });

  it.each([
    ['1', '3', 4, 'down', '0.3333'],
    ['1', '3', 4, 'up', '0.3334'],
    ['2', '3', 4, 'half-up', '0.6667'],
    ['2', '3', 4, 'half-even', '0.6667'],
    ['0.125', '1', 2, 'half-even', '0.12'],
    ['0.125', '1', 2, 'half-up', '0.13'],
    ['0.135', '1', 2, 'half-even', '0.14'],
    ['-1', '3', 4, 'down', '-0.3333'],
    ['-1', '3', 4, 'up', '-0.3334'],
    ['1', '-8', 2, 'half-up', '-0.13'],
    ['-1', '-8', 2, 'half-even', '0.12'],
    ['-0.125', '1', 2, 'half-even', '-0.12'],
    ['10', '4', 0, 'half-even', '2'],
    ['14', '4', 0, 'half-even', '4'],
    ['1', '4', 2, 'down', '0.25'],
    ['7', '1', 3, 'up', '7'],
  ] as const)('%s / %s at %i places, %s = %s', (a, b, dp, mode, expected) => {
    expect(quotient(m(a), m(b), dp, mode)).toBe(expected);
  });

  it('treats division by zero as a programmer error', () => {
    expect(() => quotient(m('1'), m('0'), 2, 'down')).toThrow('Division by zero');
  });

  it('treats an unknown rounding mode as a programmer error', () => {
    expect(() => quotient(m('1'), m('3'), 2, 'sideways' as Rounding)).toThrow('Unhandled case: "sideways"');
  });
});

describe('roundSignificant', () => {
  // A price far below one minor unit keeps its own digits: rounding at the minor unit alone makes it 0.
  it.each([
    ['73732.759060663', '73732.76'],
    ['0.2734', '0.2734'],
    ['0.27346', '0.2735'],
    ['0.0000123', '0.0000123'],
    ['0.000012345', '0.00001234'],
    ['0.000099996', '0.0001'],
    ['1.5', '1.5'],
    ['0', '0'],
    ['-0.0000123456', '-0.00001235'],
  ] as const)('roundSignificant(%s, 4, 2) = %s', (value, expected) => {
    expect(roundSignificant(p(value), 4, 2, 'half-even')).toBe(expected);
  });

  it('never rounds at fewer places than it is given', () => {
    expect(roundSignificant(p('123456.789'), 2, 2, 'half-even')).toBe('123456.79');
    expect(roundSignificant(p('123456.785'), 4, 2, 'half-even')).toBe('123456.78');
    expect(roundSignificant(p('0.125'), 1, 0, 'half-even')).toBe('0.1');
  });
});

describe('quotientSignificant', () => {
  // An implied price far below one minor unit keeps its own digits, as roundSignificant does for a live one.
  it.each([
    ['100', '3', '33.33'],
    ['2', '3', '0.6667'],
    ['10', '813008', '0.0000123'],
    ['0.12345', '1', '0.1234'],
    ['0.12355', '1', '0.1236'],
    ['99999', '1', '99999'],
    ['0', '5', '0'],
  ] as const)('quotientSignificant(%s, %s, 4, 2) = %s', (a, b, expected) => {
    expect(quotientSignificant<Price>(m(a), u(b), 4, 2, 'half-even')).toBe(expected);
  });

  it('rounds the exact quotient once, so digits far past the places still break a tie', () => {
    const justOverHalf = m(`0.12345${'0'.repeat(60)}1`);
    expect(quotientSignificant<Price>(justOverHalf, u('1'), 4, 2, 'half-even')).toBe('0.1235');
    expect(quotientSignificant<Price>(m('-1'), u('3'), 2, 0, 'half-even')).toBe('-0.33');
  });
});

describe('domain helpers', () => {
  it('derives the implied price, half-even at ten places', () => {
    expect(impliedPrice(m('100'), u('0.00123'))).toBe('81300.8130081301');
    expect(impliedPrice(m('50'), u('2'), 2)).toBe('25');
  });

  it('buys units rounded toward zero, so a one-tap estimate never overspends', () => {
    expect(unitsFor(m('40'), p('81533.40'), 8)).toBe('0.00049059');
    expect(unitsFor(m('15'), p('7.31'), 4)).toBe('2.0519'); // 2.052 would cost 15.00012
  });

  it('takes a percentage of an amount exactly', () => {
    expect(percentOf(m('100'), pct('40'))).toBe('40');
    expect(percentOf(m('99.99'), pct('33.3333'))).toBe('33.32996667');
    expect(percentOf(m('250'), pct('0'))).toBe('0');
  });

  it('expresses a part of a whole as a percentage and a ratio', () => {
    expect(percentage(m('1'), m('3'))).toBe('33.3333');
    expect(percentage(m('-55'), m('100'), 1)).toBe('-55');
    expect(ratio(m('2'), m('3'))).toBe('0.666666666667');
    expect(ratio(m('1890'), m('1000'), 2)).toBe('1.89');
  });
});

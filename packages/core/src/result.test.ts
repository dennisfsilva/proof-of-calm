import { describe, expect, it } from 'vitest';
import { assertNever, defined, err, ok, type Result } from './result';

describe('ok and err', () => {
  it('wraps a value', () => {
    const result: Result<number, string> = ok(3);
    expect(result).toEqual({ ok: true, value: 3 });
  });

  it('wraps an error', () => {
    const result: Result<number, string> = err('invalid-split');
    expect(result).toEqual({ ok: false, error: 'invalid-split' });
  });
});

describe('defined', () => {
  it('passes a value through and throws, naming it, when it is missing', () => {
    expect(defined(0, 'a count')).toBe(0);
    expect(() => defined(undefined, 'the first close')).toThrow('Missing the first close');
  });
});

describe('assertNever', () => {
  it('throws with the unhandled value', () => {
    expect(() => assertNever('surprise' as never)).toThrow('Unhandled case: "surprise"');
  });
});

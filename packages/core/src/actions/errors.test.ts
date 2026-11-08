import { describe, expect, it } from 'vitest';
import { ACTION_ERROR_CODES } from './errors';

describe('ACTION_ERROR_CODES', () => {
  it('names each action error once', () => {
    expect(new Set(ACTION_ERROR_CODES).size).toBe(ACTION_ERROR_CODES.length);
    expect(ACTION_ERROR_CODES).toContain('sell-exceeds-held');
  });
});

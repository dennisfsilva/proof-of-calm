import { ACTION_ERROR_CODES } from '@proofofcalm/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorMessage, reportError, setErrorReporter } from '.';
import errors from './messages/en.json' with { type: 'json' };

afterEach(() => setErrorReporter(() => undefined));

describe('errorMessage', () => {
  it('has copy for every action error of the core', () => {
    for (const code of ACTION_ERROR_CODES) expect(Object.keys(errors.action)).toContain(code);
  });

  it('turns a coded error into its key, with its fields and the product name as values', () => {
    expect(errorMessage({ code: 'amount-and-units', coin: 'BTC' })).toEqual({
      key: 'errors.action.amount-and-units',
      values: { product: 'Proof of Calm', coin: 'BTC' },
    });
    expect(errorMessage({ code: 'invalid-backup', issues: ['plan.split: split-sum'], count: 2 })).toEqual({
      key: 'errors.backup.invalid-backup',
      values: { product: 'Proof of Calm', count: '2' },
    });
  });

  it('words a sale over the holdings with the excess, the units held and the date the screen formatted', () => {
    const values = { excess: '0.021 BTC', held: '0.312 BTC', date: '16 Oct 2026' };
    expect(errorMessage({ code: 'sell-exceeds-held', ...values })).toEqual({
      key: 'errors.action.sell-exceeds-held',
      values: { product: 'Proof of Calm', ...values },
    });
    expect(errors.action['sell-exceeds-held']).toBe(
      'This sale is {excess} more than you hold ({held} on {date}). Check the amount and the date, or log the missing purchases first.',
    );
  });

  it('words a move over the holdings with the units sent, the units held and the date the screen formatted', () => {
    const values = { sent: '0.01 BTC', held: '0.005 BTC', date: '1 Feb 2026' };
    expect(errorMessage({ code: 'move-exceeds-held', coin: 'BTC', ...values })).toEqual({
      key: 'errors.action.move-exceeds-held',
      values: { product: 'Proof of Calm', coin: 'BTC', ...values },
    });
    expect(errors.action['move-exceeds-held']).toBe(
      'This move sends {sent}, more than you hold ({held} on {date}). Check the units and the date, or log the missing purchases first.',
    );
  });

  it('words a tap refused because the plan changed in another browser tab, with the step to take', () => {
    expect(errorMessage({ code: 'plan-changed' }).key).toBe('errors.action.plan-changed');
    expect(errors.action['plan-changed']).toBe(
      'Your plan changed in another browser tab, so this purchase was not recorded. Check the amounts shown, then record it again.',
    );
  });

  it('words every error of an import: the backup codes and a plan from the DCA plan page it cannot take', () => {
    for (const code of ['not-recognised', 'newer-version', 'invalid-backup', 'prototype-invalid']) {
      expect(errorMessage({ code }).key).toBe(`errors.backup.${code}`);
    }
    // The line names every format the import reads: backups, the DCA plan page's files and Kraken's Ledgers export.
    expect(errors.backup['not-recognised']).toMatch(/backup, an export from the DCA plan page, or Kraken's Ledgers/);
    // The file is imported now, so no line sends its purchases to the Log by hand (CONTENT-STYLE §1 rule 8).
    expect(errors.backup).not.toHaveProperty('prototype-file');
    expect(errors.backup['prototype-invalid']).toMatch(/nothing was imported/);
  });

  it('reports anything it does not know and words it generically', () => {
    const report = vi.fn();
    setErrorReporter(report);
    const thrown = new TypeError('x is undefined');
    for (const error of [thrown, { code: 'not-a-code' }, null, 'text']) {
      expect(errorMessage(error)).toEqual({ key: 'errors.unknown', values: { product: 'Proof of Calm' } });
    }
    expect(report).toHaveBeenCalledTimes(4);
    expect(report).toHaveBeenNthCalledWith(1, thrown);
    reportError('direct');
    expect(report).toHaveBeenLastCalledWith('direct');
  });
});

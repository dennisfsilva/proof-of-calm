import type { CountryRules } from '@proofofcalm/core';
import { date } from '@proofofcalm/core/testing';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createUiStore, type UiState } from './ui';

describe('ui store (ADR-0020)', () => {
  it('starts on the date it is given and changes it through setToday', () => {
    const ui = createUiStore({ today: date('2026-10-20') });
    expect(ui.getState().today).toBe('2026-10-20');
    ui.getState().setToday(date('2026-10-21'));
    expect(ui.getState().today).toBe('2026-10-21');
  });

  it('holds the loaded rules of one country, or none while they load', () => {
    const ui = createUiStore({ today: date('2026-10-20') });
    expect(ui.getState().rules).toBeNull();
    ui.getState().setRules({ country: 'PT', rules: null });
    expect(ui.getState().rules).toEqual({ country: 'PT', rules: null });
    const rules = { code: 'PT' } as CountryRules;
    ui.getState().setRules({ country: 'PT', rules });
    expect(ui.getState().rules?.rules).toBe(rules);
    ui.getState().setRules(null);
    expect(ui.getState().rules).toBeNull();
  });

  it('keeps the last price failure as a value until a refresh clears it', () => {
    const ui = createUiStore({ today: date('2026-10-20') });
    expect(ui.getState().pricesFailure).toBeNull();
    ui.getState().setPricesFailure({ kind: 'network' });
    expect(ui.getState().pricesFailure).toEqual({ kind: 'network' });
    ui.getState().setPricesFailure(null);
    expect(ui.getState().pricesFailure).toBeNull();
  });

  it('toggles rows', () => {
    const ui = createUiStore({ today: date('2026-10-20') });
    ui.getState().toggle('row-1');
    expect([...ui.getState().open]).toEqual(['row-1']);
    ui.getState().toggle('row-1');
    expect(ui.getState().open.size).toBe(0);
  });

  it('holds no toast: that lives in packages/ui’s manager', () => {
    expectTypeOf<UiState>().not.toHaveProperty('toast');
    expectTypeOf<UiState>().not.toHaveProperty('showToast');
    expectTypeOf<UiState>().not.toHaveProperty('clearToast');
  });
});

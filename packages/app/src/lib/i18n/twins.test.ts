import { createTranslator } from 'use-intl/core';
import { describe, expect, it } from 'vitest';
import type { UiLanguage } from './locale';

// The annual review's first sentence is said twice (ADR-0045 §8, the entry of 2026-11-15): on the Plan
// screen by `plan.review.since`, one select over `kind`, and on Today by `today.review.created` and
// `today.review.reviewed`. Both carry `{date}`; the select's `reviewed` branch formats as the reviewed
// sentence and its `other` branch as the created one, in every locale the merge writes.

type Tree = { [key: string]: string | Tree };
const plans = import.meta.glob<Tree>('../../messages/*/plan.json', { eager: true, import: 'default' });
const todays = import.meta.glob<Tree>('../../messages/*/today.json', { eager: true, import: 'default' });
const locale = (path: string) => /messages\/([^/]+)\//.exec(path)?.[1] ?? '';
const locales = Object.keys(plans).map(locale);

describe('the review sentence twins', () => {
  it('are checked in English and pt-PT at least', () => {
    expect(locales).toEqual(expect.arrayContaining(['en', 'pt-PT']));
    expect(Object.keys(todays).map(locale).sort()).toEqual([...locales].sort());
  });

  it.each(locales)('say the same in %s', (language) => {
    const plan = plans[`../../messages/${language}/plan.json`];
    const today = todays[`../../messages/${language}/today.json`];
    const t = createTranslator({
      locale: language as UiLanguage,
      messages: { plan, today } as Record<string, Tree>,
    }) as unknown as (key: string, values: Record<string, string>) => string;
    const date = '«date»';
    expect(t('plan.review.since', { kind: 'reviewed', date })).toBe(t('today.review.reviewed', { date }));
    expect(t('plan.review.since', { kind: 'created', date })).toBe(t('today.review.created', { date }));
    expect(t('today.review.created', { date })).toContain(date);
  });
});

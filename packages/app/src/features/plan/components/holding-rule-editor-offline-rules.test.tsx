// @vitest-environment jsdom
import { contentLanguageOf, loadProfile, loadRules } from '@proofofcalm/content';
import type { CalendarDate } from '@proofofcalm/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createFormatters } from '../../../lib/format';
import { I18nProvider } from '../../../lib/i18n';
import errors from '../../../messages/pt-PT/errors.json';
import plan from '../../../messages/pt-PT/plan.json';
import shell from '../../../messages/pt-PT/shell.json';
import { holdingCountryOf } from '../lib/holding';
import { HoldingRuleEditor } from './holding-rule-editor';

// Offline, the general profile's pt-PT rules chunk was never fetched, so its loader answers the English rules, while
// the profile's pt-PT overlay loaded (ADR-0057): the general profile's line shows the profile's Portuguese text, so
// it keeps the page's language and is not marked "en" after the rules.

vi.mock('../../../../../content/rules/pt-PT/xx.json', () => {
  throw new TypeError('Failed to fetch dynamically imported module');
});

afterEach(cleanup);

it("leaves the general profile's Portuguese line unmarked when the pt-PT rules fail to load", async () => {
  const [rules, profile] = await Promise.all([loadRules('XX', 'pt-PT'), loadProfile('XX', 'pt-PT')]);
  if (rules === null || profile === null) throw new Error('XX did not load');
  expect([contentLanguageOf(rules), contentLanguageOf(profile)]).toEqual(['en', 'pt-PT']);
  const country = holdingCountryOf(rules, '17 out. 2026', profile, '2026-11-16' as CalendarDate);
  render(
    <I18nProvider locale="pt-PT" messages={{ plan, errors, shell }}>
      <HoldingRuleEditor
        value={{ source: 'country', kind: 'none', count: '', effect: 'exempt' }}
        issues={[]}
        country={country}
        onChange={() => undefined}
        format={createFormatters('pt-PT', 'pt-PT')}
      />
    </I18nProvider>,
  );
  const line = screen.getByText(profile.card.holdingRuleText, { exact: false });
  expect(line.closest('[lang]')).toBeNull();
});

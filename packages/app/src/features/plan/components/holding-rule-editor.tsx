'use client';

import type { HoldingRule, PlanIssue } from '@proofofcalm/core';
import { Field, FieldError, FieldLabel } from '@proofofcalm/ui/components/field';
import { NumericInput } from '@proofofcalm/ui/components/input';
import { RadioCard, RadioGroup } from '@proofofcalm/ui/components/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@proofofcalm/ui/components/select';
import { useId } from 'react';
import { useTranslations } from 'use-intl';
import type { Formatters } from '../../../lib/format';
import { CountryDateLine } from '../../learn';
import { type HoldingCountry, type HoldingIssue, type HoldingValue, holdingRuleText } from '../lib/holding';

// The plan's holding rule (docs/JURISDICTIONS.md §5), controlled by the host: Settings' Hold & sell tab. Two
// choice cards, the country's rule (`HoldingCountry`) titled by the country's name and in words, and the person's
// own; above the country's card its date line with
// the link to the rule's source (docs/JURISDICTIONS.md §1, docs/LEGAL.md §4), outside the radio group, whose
// arrow keys would move the choice from a link inside it. The own rule's kind, count and effect show while it
// is chosen, starting from the rule shown before. Each message sits under the field or card it concerns, the
// one marked invalid, where a refused save moves the focus.

export type HoldingRuleEditorProps = {
  readonly value: HoldingValue;
  readonly issues: readonly (HoldingIssue | PlanIssue)[];
  readonly country: HoldingCountry | null;
  readonly onChange: (value: HoldingValue) => void;
  /** Groups the count of the country's rule in words (docs/CONTENT-STYLE.md §4); it reads no typed value. */
  readonly format: Formatters;
};

const KINDS = ['none', 'days', 'years'] as const;
const EFFECTS = ['exempt', 'lower-rate'] as const;

export function HoldingRuleEditor({ value, issues, country, onChange, format }: HoldingRuleEditorProps) {
  const t = useTranslations('plan.holdingRule');
  const input = useTranslations('errors.input');
  const legend = useId();
  const sourceError = useId();
  const dateLine = useId();
  const set = (patch: Partial<HoldingValue>) => onChange({ ...value, ...patch });
  const ruleText = (rule: HoldingRule) => {
    const { key, values } = holdingRuleText(rule, format);
    return t(`text.${key}`, values);
  };

  const message = (field: 'source' | 'count') => {
    const issue = issues.find((candidate) => candidate.path[0] === 'holdingRule' && candidate.path[1] === field);
    if (issue === undefined) return null;
    switch (issue.code) {
      case 'number-invalid':
        return input('number-invalid', { example: issue.example });
      case 'number-empty':
      case 'number-negative':
        return input(issue.code);
      case 'count-range':
        return t('issue.count-range', { kind: value.kind, min: issue.min, max: issue.max });
      case 'count-whole':
        return t('issue.count-whole', { kind: value.kind });
      case 'country-unknown':
        return t(`issue.${issue.code}`);
      default:
        return null;
    }
  };

  const countryText = (known: HoldingCountry) => {
    const { unreviewed } = known;
    if (unreviewed !== undefined) {
      return unreviewed.text === null
        ? undefined
        : [unreviewed.status, unreviewed.text].filter((part) => part !== null).join(' ');
    }
    return known.source === null ? undefined : ruleText(known.rule);
  };
  const sourceIssue = message('source');
  const countIssue = message('count');

  return (
    <fieldset className="flex min-w-0 flex-col gap-stack-md">
      <legend id={legend} className="mb-stack-sm font-medium text-16 text-ink">
        {t('legend')}
      </legend>
      <div className="flex flex-col gap-stack-xs">
        {country !== null && <CountryDateLine country={country} id={dateLine} />}
        <RadioGroup<HoldingValue['source']>
          aria-labelledby={legend}
          aria-invalid={sourceIssue !== null || undefined}
          aria-describedby={sourceIssue === null ? undefined : sourceError}
          value={value.source}
          onValueChange={(source) => set({ source })}
        >
          <div className="flex flex-col gap-stack-xs">
            <RadioCard
              value="country"
              badge={country?.code}
              title={t('country', {
                kind: country === null ? 'unknown' : country.unreviewed !== undefined ? 'generic' : 'named',
                name: country?.name ?? '',
              })}
              line={country === null ? t('countryUnknown') : countryText(country)}
              describedBy={country === null ? undefined : dateLine}
              disabled={country === null}
            />
            {sourceIssue !== null && (
              <p id={sourceError} role="alert" className="text-13 text-negative">
                {sourceIssue}
              </p>
            )}
          </div>
          <RadioCard value="own" title={t('own')} line={t('ownLine')} />
        </RadioGroup>
      </div>
      {value.source === 'own' && (
        <>
          <Select<HoldingValue['kind']> value={value.kind} onValueChange={(kind) => kind !== null && set({ kind })}>
            <SelectLabel>{t('kind')}</SelectLabel>
            <SelectTrigger>
              <SelectValue>{(kind: HoldingValue['kind']) => t(`kinds.${kind}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`kinds.${kind}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {value.kind !== 'none' && (
            <>
              <Field invalid={countIssue !== null}>
                <FieldLabel>{t(`count.${value.kind}`)}</FieldLabel>
                <NumericInput value={value.count} onChange={(event) => set({ count: event.currentTarget.value })} />
                {countIssue !== null && <FieldError>{countIssue}</FieldError>}
              </Field>
              <Select<HoldingValue['effect']>
                value={value.effect}
                onValueChange={(effect) => effect !== null && set({ effect })}
              >
                <SelectLabel>{t('effect')}</SelectLabel>
                <SelectTrigger>
                  <SelectValue>{(effect: HoldingValue['effect']) => t(`effects.${effect}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {EFFECTS.map((effect) => (
                    <SelectItem key={effect} value={effect}>
                      {t(`effects.${effect}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </>
      )}
    </fieldset>
  );
}

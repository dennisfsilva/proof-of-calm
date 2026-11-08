'use client';

import type { Coin, CoinId } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { Field, FieldError, FieldLabel } from '@proofofcalm/ui/components/field';
import { NumericInput } from '@proofofcalm/ui/components/input';
import { useEffect, useId, useRef } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { addCoin, type CoinSplitValue, MAX_COINS, removeCoin, type SplitIssue, setShare } from '../lib/split';

// The coins of a plan and their split (docs/DOMAIN.md §2.1), controlled by the host: Settings' Coins
// & split tab and onboarding's custom path, its coins step. The catalogue is a plain list of
// the coins not in the plan, never a suggestion (ADR-0009). Each share is a numeric field (ADR-0034)
// that shows its own reading or precision message; the sum message sits on the split and describes
// every share. Adding a coin moves focus to its share, removing one to the first share, so the
// keyboard never lands on a button that is gone. A row is the label across its width and, under it, the
// share at one width on every row (room for "100" in tabular figures, 5rem) with Remove after it, so
// the field never narrows to make room for a longer Remove label.

export type CoinEditorProps = {
  readonly value: CoinSplitValue;
  readonly catalogue: readonly Coin[];
  /** From `coinSplit`: the issues of the coins and the split. */
  readonly issues: readonly SplitIssue[];
  readonly onChange: (value: CoinSplitValue) => void;
  /** `hidden` under a host's own heading (onboarding): the legend still names the group for screen readers. */
  readonly legend?: 'shown' | 'hidden' | undefined;
};

export function CoinEditor({ value, catalogue, issues, onChange, legend = 'shown' }: CoinEditorProps) {
  const t = useTranslations('plan.coins');
  const input = useTranslations('errors.input');
  const locale = useLocale();
  const sumId = useId();
  const fields = useRef(new Map<CoinId, HTMLInputElement>());
  const focusNext = useRef<CoinId | null>(null);

  useEffect(() => {
    const id = focusNext.current ?? null;
    if (id === null) return;
    focusNext.current = null;
    fields.current.get(id)?.focus();
  });

  const full = value.coins.length >= MAX_COINS;
  const offSum = issues.some((issue) => issue.code === 'split-sum');
  // Alphabetical by the name shown, in the UI locale's collation (docs/LEGAL.md §3 item 3).
  const byName = new Intl.Collator(locale).compare;
  const available = catalogue
    .filter((coin) => !value.coins.some((current) => current.id === coin.id))
    .sort((a, b) => byName(a.name, b.name));
  const message = (id: CoinId) => {
    const issue = issues.find((candidate) => candidate.path[0] === 'split' && candidate.path[1] === id);
    if (issue === undefined) return null;
    if (issue.code === 'split-precision') return t('issue.split-precision');
    if (issue.code === 'number-invalid') return input('number-invalid', { example: issue.example });
    if (issue.code === 'number-empty' || issue.code === 'number-negative') return input(issue.code);
    return null;
  };
  const add = (coin: Coin) => {
    focusNext.current = coin.id;
    onChange(addCoin(value, coin));
  };
  const remove = (id: CoinId) => {
    const next = removeCoin(value, id);
    focusNext.current = next.coins[0]?.id ?? null;
    onChange(next);
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-stack-md" aria-describedby={offSum ? sumId : undefined}>
      <legend className={legend === 'hidden' ? 'sr-only' : 'mb-stack-sm font-medium text-16 text-ink'}>
        {t('legend')}
      </legend>
      <ul className="flex flex-col gap-stack-sm">
        {value.coins.map((coin) => {
          const own = message(coin.id);
          return (
            <li key={coin.id}>
              <Field invalid={offSum || own !== null} className="min-w-0">
                <FieldLabel>{t('share', { coin: coin.name })}</FieldLabel>
                <div className="flex flex-wrap items-center gap-target-gap">
                  <div className="w-20 shrink-0">
                    <NumericInput
                      ref={(element: HTMLInputElement | null) => {
                        if (element === null) fields.current.delete(coin.id);
                        else fields.current.set(coin.id, element);
                      }}
                      value={value.shares[coin.id] ?? ''}
                      onChange={(event) => onChange(setShare(value, coin.id, event.currentTarget.value))}
                      aria-describedby={offSum ? sumId : undefined}
                    />
                  </div>
                  {value.coins.length > 1 && (
                    <Button variant="secondary" onClick={() => remove(coin.id)}>
                      {t('remove', { coin: coin.name })}
                    </Button>
                  )}
                </div>
                {own !== null && <FieldError>{own}</FieldError>}
              </Field>
            </li>
          );
        })}
      </ul>
      {offSum && (
        <p id={sumId} className="text-13 text-negative">
          {t('issue.split-sum')}
        </p>
      )}
      {full && <p className="text-14 text-ink-2">{t('limit', { max: MAX_COINS })}</p>}
      {!full && available.length > 0 && (
        <div className="flex flex-col gap-stack-xs">
          <p className="font-medium text-14 text-ink">{t('add')}</p>
          <ul className="flex flex-wrap gap-target-gap">
            {available.map((coin) => (
              <li key={coin.id}>
                <Button variant="secondary" onClick={() => add(coin)}>
                  {t('addCoin', { coin: coin.name })}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </fieldset>
  );
}

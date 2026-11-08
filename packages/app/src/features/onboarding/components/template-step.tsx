import { type OfferedTemplate, TEMPLATES } from '@proofofcalm/content';
import { type CalendarDate, decimal, negate, type Percent } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@proofofcalm/ui/components/collapsible';
import { RadioCard, RadioGroup } from '@proofofcalm/ui/components/radio-group';
import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import type { Formatters } from '../../../lib/format';

// The four starting points, alphabetical by the name shown in the UI locale's collation, never ranked by
// risk (docs/LEGAL.md §3 item 3): each card leads with its risk label, then its one line, the split line built
// from `split`, and the dated band composed from the template's drawdowns (read with the card through the line).
// Under the cards the picked template's explanation sits behind one closed control (docs/CONTENT-STYLE.md §6), and
// the template line of docs/LEGAL.md §4 with its Risk link follows once, read with every template card through
// `describedBy`. The user's own coins, the custom path, is the last card: not a starting point, so it has no
// risk label, no explanation and no template line.
export type TemplateChoice = { readonly kind: 'template'; readonly id: string } | { readonly kind: 'custom' };

export type TemplateStepProps = {
  readonly value: TemplateChoice | null;
  /** The chosen country's formatting, as the summary uses it. */
  readonly format: Formatters;
  onChoose(choice: TemplateChoice): void;
  onBack(): void;
};

/** The own-coins card's radio value: template ids are lowercase words, so no template has it. */
const CUSTOM = 'custom:own-coins';

const radioOf = (choice: TemplateChoice | null) =>
  choice === null ? undefined : choice.kind === 'custom' ? CUSTOM : choice.id;

/** A coin's ticker and its fall are read together, so a no-break space joins them. */
const NO_BREAK_SPACE = ' ';

/**
 * The band's values: every coin's fall, ticker first and signed (U+2212, CONTENT-STYLE §4), so it never reads as a
 * split; then the window that holds every fall, from the earliest high to the latest low, which is not each coin's
 * own dates (docs/LEGAL.md §4); in the plan's formats, with dates that never break (`format.date` joins their parts
 * with U+00A0).
 */
function bandOf(format: Formatters, { drawdowns }: OfferedTemplate) {
  const span = (dates: CalendarDate[], end: number) => {
    const date = dates.sort().at(end);
    return date === undefined ? '' : format.date(date);
  };
  return {
    count: drawdowns.length,
    falls: format.list(
      drawdowns.map(({ coin, fall }) => `${coin}${NO_BREAK_SPACE}${format.percent(negate(fall), { decimals: 0 })}`),
    ),
    from: span(
      drawdowns.map(({ high }) => high),
      0,
    ),
    to: span(
      drawdowns.map(({ low }) => low),
      -1,
    ),
  };
}

/** Each coin's ticker before its share, in the plan's formats, as the summary joins them (CONTENT-STYLE §4). */
const splitLine = (format: Formatters, { coins, split }: OfferedTemplate) =>
  format.list(
    coins.map(({ id }) => `${id}${NO_BREAK_SPACE}${format.percent(split[id] ?? ('0' as Percent), { decimals: 0 })}`),
  );

/** The explanation's percentages in the plan's format: the JSON stays literal, `N %` (CONTENT-STYLE §4). */
const explanationText = (format: Formatters, text: string) =>
  text.replace(/(\d+) %/g, (_, share: string) => format.percent(decimal(share), { decimals: 0 }));

export function TemplateStep({ value, format, onChoose, onBack }: TemplateStepProps) {
  const t = useTranslations('onboarding');
  const byName = new Intl.Collator(useLocale()).compare;
  const templates = [...TEMPLATES].sort((a, b) => byName(a.name, b.name));
  const lineId = useId();
  const [picked, setPicked] = useState<string | undefined>(radioOf(value));
  const explained = templates.find((template) => template.id === picked);
  return (
    <section className="flex flex-col gap-stack-md">
      <h2 tabIndex={-1} className="font-semibold text-20 tracking-heading">
        {t('template.heading')}
      </h2>
      <RadioGroup
        aria-label={t('template.heading')}
        defaultValue={radioOf(value)}
        onValueChange={(id: string) => setPicked(id)}
      >
        {templates.map((template) => (
          <RadioCard
            key={template.id}
            value={template.id}
            badge={template.riskLabel}
            title={template.name}
            line={
              <>
                {template.oneLine}
                <span className="block">{splitLine(format, template)}</span>
                <span className="block">{t('template.band', bandOf(format, template))}</span>
              </>
            }
            describedBy={lineId}
          />
        ))}
        <RadioCard value={CUSTOM} title={t('template.custom.title')} line={t('template.custom.line')} />
      </RadioGroup>
      {explained !== undefined && (
        <Collapsible key={picked} className="gap-stack-sm">
          <CollapsibleTrigger>{t('template.about')}</CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-stack-sm">
            {explained.explanation.split('\n\n').map((paragraph) => (
              <p key={paragraph}>{explanationText(format, paragraph)}</p>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
      <p id={lineId}>
        {t('template.line')} <a href="/risk">{t('disclosure.riskLink')}</a>
      </p>
      <div className="flex flex-wrap gap-target-gap">
        <Button variant="secondary" onClick={onBack}>
          {t('back')}
        </Button>
        <Button
          disabled={picked === undefined}
          onClick={() =>
            picked !== undefined && onChoose(picked === CUSTOM ? { kind: 'custom' } : { kind: 'template', id: picked })
          }
        >
          {t('next')}
        </Button>
      </div>
    </section>
  );
}

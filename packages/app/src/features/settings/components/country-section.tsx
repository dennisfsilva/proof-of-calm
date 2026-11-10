import { COUNTRY_CODES, type CountryProfile, loadProfile } from '@proofofcalm/content';
import {
  type CountryCode,
  type CountryRules,
  type CurrencyAnswer,
  changeCountry,
  currencyQuestion,
  type HoldingRule,
  liveEntries,
  type Plan,
} from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { Checkbox } from '@proofofcalm/ui/components/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@proofofcalm/ui/components/select';
import { reveal } from '@proofofcalm/ui/lib/reveal';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useFormatters, useServices, useSnapshot, useToday } from '../../../lib/services';
import { ConditionLines } from '../../learn';
import {
  CountryDateLine,
  EarlyWindowNotice,
  earlyOpenOf,
  holdingCountryOf,
  ruleNameOf,
  sellWindowValueOf,
} from '../../plan';
import { changeCountryOf } from '../actions';
import { countryOptions, countrySummary, type RuleWords, ruleWordsOf } from '../model/country';
import {
  AmountRows,
  CurrencyQuestionGroup,
  FilesFirst,
  givenAnswer,
  previewAnswer,
  SUMMARY_LIST,
  unanswered,
} from './currency-question';
import { PayCurrencyLine } from './pay-currency-line';

// Currency & data's country change (docs/DOMAIN.md §6 "Change country"): a select of the countries with a
// profile, under the line that offers the country's currency while the plan's differs (`PayCurrencyLine`);
// choosing another lists what the change moves, asks the currency question when logged amounts would change
// meaning (ADR-0053; otherwise, with any entry, says they stay as typed), names the plan's own amounts the
// currency moves, offers the current tax-year files first, asks the person to
// confirm the new holding rule in place of the plan's (their own or the old country's, never silently), and
// shows the early-window notice when the new rule makes the sell window open early. Each country's rule in the
// list carries that country's card date line as Hold & sell shows it; the generic profile's gives its own text
// in place of a rule (docs/JURISDICTIONS.md §1 and "Generic profile `XX`"). Each rule is its own item; when the
// day the last buy passes the rule moves, an item says so with the "not tax advice" note, shown once, and under
// it the new country's conditions on the date, the first in full and the rest behind one control (docs/LEGAL.md
// §4), so the notice under the list leaves both out. The change runs on the plan as stored; another tab's
// change to what it re-derives refuses it and the section says so.

type Pending = { readonly rules: CountryRules; readonly opened: Plan };

export function CountrySection() {
  const t = useTranslations('settings.country');
  const settings = useTranslations('settings');
  const ruleText = useTranslations('plan.holdingRule.text');
  const holding = useTranslations('plan.holding');
  const services = useServices();
  const f = useFormatters();
  const today = useToday();
  const plan = useSnapshot((snapshot) => snapshot.plan);
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const headingId = useId();
  const confirmIssue = useId();
  const [options, setOptions] = useState<readonly CountryRules[] | null>(null);
  const [profiles, setProfiles] = useState<readonly CountryProfile[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [acceptEarly, setAcceptEarly] = useState(false);
  const [answer, setAnswer] = useState<CurrencyAnswer | null>(null);
  /** Counts the times the answer was cleared: the question's key, so the cards show it cleared as well. */
  const [asked, setAsked] = useState(0);
  const [refused, setRefused] = useState(0);
  const [problem, setProblem] = useState<'changed' | 'notSaved' | 'conflict' | null>(null);
  const [result, setResult] = useState('');
  /** Set while a change is written; the ref answers a second press before the busy button has rendered. */
  const busy = useRef(false);
  const [changing, setChanging] = useState(false);
  /** Counts the refused writes: each moves the focus to the line that reports it, rendered by then. */
  const [reported, setReported] = useState(0);
  /** Counts the changes that closed the confirmation: each moves the focus to the result line, once it has. */
  const [ended, setEnded] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const resultLine = useRef<HTMLParagraphElement>(null);
  const problemLine = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (refused === 0) return;
    // An invalid group (the currency question) is no tab stop itself: its own stop, a radio, takes the focus.
    const invalid = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid?.querySelector<HTMLElement>('[tabindex="0"]') ?? invalid)?.focus();
  }, [refused]);
  useEffect(() => {
    if (reported > 0) problemLine.current?.focus();
  }, [reported]);
  // After the commit that unmounts the confirmation, so the document has shrunk before the line is brought into
  // view (docs/DESIGN.md §6 "Focus after an action"); a focus before it left the line above the viewport.
  useEffect(() => {
    if (ended === 0) return;
    resultLine.current?.focus({ preventScroll: true });
    resultLine.current?.scrollIntoView({ block: 'nearest' });
  }, [ended]);
  // An answer that shows the amount rows under the cards brings them into view, the focus staying on the card: a card
  // picked at a phone's bottom edge left them under the tab bar. The page's scroll padding keeps the bar's height
  // clear (docs/DESIGN.md §6); the box is empty, and hidden, while no row shows.
  const amountRows = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = amountRows.current;
    if (answer !== null && box !== null && box.childElementCount > 0) reveal(box);
  }, [answer]);
  useEffect(() => {
    let current = true;
    const load = (code: CountryCode) =>
      Promise.all([services.rules(code).catch(() => null), loadProfile(code).catch(() => null)] as const);
    void Promise.all(COUNTRY_CODES.map(load)).then((loaded) => {
      if (!current) return;
      setProfiles(loaded.flatMap(([, profile]) => (profile === null ? [] : [profile])));
      setOptions(countryOptions(loaded.map(([rules]) => rules)));
    });
    return () => {
      current = false;
    };
  }, [services]);
  if (plan === null || options === null) return null;

  const own = options.find(({ code }) => code === plan.country);
  const nameOf = (code: CountryCode) => options.find((rules) => rules.code === code)?.name ?? code;
  const ruleName = (rule: HoldingRule, country: CountryCode) => {
    const rules = options.find((candidate) => candidate.code === country) ?? null;
    return t('ruleName', { kind: ruleNameOf(rule, rules), country: nameOf(country) });
  };
  // A country's card as Hold & sell shows it, from the profile the section loaded.
  const cardOf = (rules: CountryRules) =>
    holdingCountryOf(
      rules,
      f.date(rules.status.lastReviewed),
      profiles.find(({ code }) => code === rules.code) ?? null,
      today,
    );
  // A rule in the list, its own item, then its country's date line unless it is the person's own.
  const ruleRow = (row: 'ruleNow' | 'ruleAfter', rule: HoldingRule, country: CountryCode, words: RuleWords) => {
    const rules = options.find((candidate) => candidate.code === country);
    const card = rules === undefined || ruleNameOf(rule, rules) === 'own' ? null : cardOf(rules);
    const shown = ruleWordsOf(card, words);
    const text = shown === null ? '' : 'text' in shown ? shown.text : ruleText(shown.key, shown.values);
    return (
      <li key={row}>
        <p>{t(`row.${row}`, { name: ruleName(rule, country), rule: text })}</p>
        {card !== null && <CountryDateLine country={card} />}
      </li>
    );
  };
  // A new choice, or a refusal that re-opens on the plan as stored, asks again for every tick: each was given
  // for what the person saw then. The result line says how a change ended, empty again once another begins.
  const reopen = (next: Pending | null, shown: 'changed' | null, said = '') => {
    setPending(next);
    setConfirmed(false);
    setAcceptEarly(false);
    setAnswer(null);
    setAsked((count) => count + 1);
    setRefused(0);
    setProblem(shown);
    setResult(said);
  };
  // The confirm button unmounts with the confirmation: the focus goes to the line that says how it ended, in the
  // effect above (docs/DESIGN.md §6 "Focus after an action").
  const done = (said: string) => {
    reopen(null, null, said);
    setEnded((count) => count + 1);
  };
  const choose = (code: CountryCode | null) => {
    const rules = options.find((candidate) => candidate.code === code);
    reopen(rules === undefined || code === plan.country ? null : { rules, opened: plan }, null);
  };
  // The currency question, asked when the change would relabel logged amounts (ADR-0053); with nothing to relabel
  // the currencies follow the country. The list shows the answer given, `keep` while there is none.
  const currency = {
    question: pending === null ? null : currencyQuestion(pending.opened, entries, pending.rules),
    answer,
  };
  const change =
    pending === null
      ? null
      : changeCountry(pending.opened, pending.rules, services.clock.now(), previewAnswer(currency));
  const rows =
    pending === null || change === null
      ? []
      : countrySummary(change, options.find((rules) => rules.code === pending.opened.country) ?? null, f);
  const ruleMoves = rows.some((row) => row.field === 'holdingRule');
  // With nothing logged there is nothing to stay as typed: the line that says so shows with an entry.
  const logged = liveEntries(entries).length > 0;
  const early =
    change?.issues.includes('sell-window-before-eligibility') === true
      ? earlyOpenOf(change.plan, sellWindowValueOf(change.plan.sellWindow))
      : null;

  // One change at a time: a second press while one is written does nothing, so the line reports the first.
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending === null || busy.current) return;
    if (unanswered(currency) || (ruleMoves && !confirmed) || (early !== null && !acceptEarly)) {
      setRefused((count) => count + 1);
      return;
    }
    busy.current = true;
    setChanging(true);
    let outcome: Awaited<ReturnType<typeof changeCountryOf>>;
    try {
      outcome = await changeCountryOf(services, pending.rules, pending.opened, acceptEarly, givenAnswer(currency));
    } finally {
      busy.current = false;
      setChanging(false);
    }
    const name = pending.rules.name;
    if (outcome.ok) {
      done(outcome.value.written ? t('changed', { name }) : '');
      return;
    }
    // A refused write keeps the confirmation open: the focus goes to the line that says why (docs/DESIGN.md §6). An
    // invariant the new currency or rule breaks names where to fix it; no plan left in the write's turn (another
    // tab's wipe) keeps Settings' line, and the section leaves with the plan.
    if (Array.isArray(outcome.error)) {
      setProblem(outcome.error.length > 0 ? 'conflict' : 'notSaved');
      setReported((count) => count + 1);
      return;
    }
    // A plan another tab already moved to this country, whatever its rule, has nothing left to change (as `choose`
    // treats the plan's own country): the confirmation closes and the result line says what happened.
    const opened = outcome.error.plan;
    if (opened.country === pending.rules.code) {
      done(t('alreadyChanged', { name }));
      return;
    }
    reopen({ ...pending, opened }, 'changed');
    setReported((count) => count + 1);
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-stack-md">
      <h2 id={headingId} className="font-semibold text-20">
        {t('heading')}
      </h2>
      <p className="text-13 text-ink-2">{t('line')}</p>
      {options.length === 0 ? (
        <p className="text-13 text-ink-2">{t('notLoaded')}</p>
      ) : own === undefined ? (
        // Without the plan's country's rules the list cannot tell the person's own rule from that country's, so no
        // change is offered until they load (docs/DOMAIN.md §6 "Change country"; Hold & sell's disabled card).
        <p className="text-13 text-ink-2">{t('ruleNotLoaded')}</p>
      ) : (
        <form ref={form} onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-stack-md">
          {pending === null && <PayCurrencyLine plan={plan} rules={own} onDone={done} />}
          <Select<CountryCode> value={pending?.rules.code ?? plan.country} onValueChange={choose}>
            <SelectLabel>{t('label')}</SelectLabel>
            <SelectTrigger>
              <SelectValue>{(code: CountryCode) => nameOf(code)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((rules) => (
                <SelectItem key={rules.code} value={rules.code}>
                  {rules.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pending !== null && change !== null && (
            <>
              <p className="text-16 text-ink">{t('summary', { name: pending.rules.name })}</p>
              <ul className={SUMMARY_LIST}>
                {rows.map((row) =>
                  row.field === 'holdingRule' ? (
                    [
                      ruleRow('ruleNow', pending.opened.holdingRule, pending.opened.country, row.from),
                      ruleRow('ruleAfter', change.plan.holdingRule, pending.rules.code, row.to),
                    ]
                  ) : row.field === 'lastBuyEligible' ? (
                    <li key={row.field}>
                      <div className="flex flex-col gap-stack-xs">
                        <p>
                          {t('row.lastBuyEligible', { effect: row.effect, from: f.date(row.from), to: f.date(row.to) })}
                        </p>
                        <p className="text-13 text-ink-2">{holding('note')}</p>
                        <ConditionLines conditions={pending.rules.holdingRuleConditions} />
                      </div>
                    </li>
                  ) : (
                    <li key={row.field}>
                      {row.field === 'country'
                        ? t('row.country', { from: nameOf(row.from), to: nameOf(row.to) })
                        : t(`row.${row.field}`, { from: row.from, to: row.to })}
                    </li>
                  ),
                )}
                {currency.question === null && (
                  <AmountRows opened={pending.opened} next={change.plan} rules={pending.rules} />
                )}
              </ul>
              {currency.question === null ? (
                logged && <p className="text-13 text-ink-2">{t('logged')}</p>
              ) : (
                <>
                  <CurrencyQuestionGroup
                    key={asked}
                    question={currency.question}
                    onAnswer={setAnswer}
                    invalid={refused > 0 && answer === null}
                  />
                  {/* Under the cards, so a row appearing on "Change to" is brought into view below them. */}
                  <div ref={amountRows} className="empty:hidden">
                    <AmountRows opened={pending.opened} next={change.plan} rules={pending.rules} list />
                  </div>
                </>
              )}
              {ruleMoves && (
                <div className="flex flex-col gap-stack-xs">
                  <label className="flex items-start gap-1 text-16 text-ink">
                    <Checkbox
                      checked={confirmed}
                      onCheckedChange={(checked) => setConfirmed(checked)}
                      aria-invalid={(refused > 0 && !confirmed) || undefined}
                      aria-describedby={refused > 0 && !confirmed ? confirmIssue : undefined}
                    />
                    <span className="py-3">
                      {t('confirmRule', {
                        from: ruleName(pending.opened.holdingRule, pending.opened.country),
                        to: ruleName(change.plan.holdingRule, pending.rules.code),
                      })}
                    </span>
                  </label>
                  {refused > 0 && !confirmed && (
                    <p id={confirmIssue} role="alert" className="text-13 text-negative">
                      {t('confirmRuleIssue')}
                    </p>
                  )}
                </div>
              )}
              {early !== null && (
                <EarlyWindowNotice
                  {...early}
                  rule={ruleNameOf(change.plan.holdingRule, pending.rules)}
                  country={cardOf(pending.rules)}
                  taxLine={!rows.some((row) => row.field === 'lastBuyEligible')}
                  on="window"
                  countryChange
                  accepted={acceptEarly}
                  onAccept={setAcceptEarly}
                  invalid={refused > 0 && !acceptEarly}
                />
              )}
              <FilesFirst entries={entries} />
              {problem !== null && (
                <p ref={problemLine} tabIndex={-1} role="alert" className="text-13 text-negative">
                  {problem === 'conflict' ? t('notSaved') : settings(problem)}
                </p>
              )}
              <div>
                {/* Busy, not natively disabled, while the change is written: a `disabled` attribute on the focused
                    button drops the focus to `body` (Base UI's Button docs, "Loading states"). */}
                <Button type="submit" disabled={changing} focusableWhenDisabled>
                  {t('confirm', { name: pending.rules.name })}
                </Button>
              </div>
            </>
          )}
          <p ref={resultLine} tabIndex={-1} role="status" className="scroll-mt-result text-ink-2">
            {result}
          </p>
        </form>
      )}
    </section>
  );
}

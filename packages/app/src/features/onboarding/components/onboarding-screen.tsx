import {
  type CountryProfile,
  contentLanguageOf,
  countryChoices,
  countryRules,
  loadProfiles,
  loadTemplateTexts,
  suggestionProfiles,
  type TemplateTexts,
  templateById,
} from '@proofofcalm/content';
import {
  type CurrencyCode,
  EntityIdSchema,
  liveEntries,
  type Plan,
  type PlanIssueCode,
  suggestCountry,
  type Template,
} from '@proofofcalm/core';
import { buttonVariants } from '@proofofcalm/ui/components/button';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { deviceLocale } from '../../../lib/adapters';
import { createFormatters, createNumberInput } from '../../../lib/format';
import { localesFor } from '../../../lib/i18n';
import { Link } from '../../../lib/navigation';
import { useClock, useDrafts, useServices, useSnapshot, useToday } from '../../../lib/services';
import { keptQuestion } from '../../../lib/store';
import { reminderFile, type ScheduleIssue, type SplitIssue, useReminderWords } from '../../plan';
import { useOnboardingActions } from '../actions';
import { ONBOARDING_DRAFT, OnboardingDraftSchema, resumeStep, type SetupDraft, type Step } from '../model/draft';
import {
  type CustomContext,
  checkPlan,
  coinsIssues,
  draftPatchOf,
  emptyDraft,
  type FieldIssue,
  needsLastBuy,
  scheduleValueOf,
} from '../model/setup';
import { CoinsStep } from './coins-step';
import { cardOf, earlyOf } from './country-card';
import { CountryStep } from './country-step';
import { DatesStep } from './dates-step';
import { paidIn } from './kept-question';
import { NumbersStep } from './numbers-step';
import { ReminderStep } from './reminder-step';
import { SummaryStep } from './summary-step';
import { type TemplateChoice, TemplateStep } from './template-step';
import { WhyStep } from './why-step';

// Country, template, then numbers on the template path or coins and dates on the custom path, then on both
// the sentence, the reminder and the summary with Start (docs/DOMAIN.md §5): the steps are screen state, not
// routes (ADR-0045 §9). Each step change moves the focus to the new step's heading. With a plan stored the
// screen says so and links to it; it never writes over a plan. Numbers and Dates go on only once the plan's
// dry run passes; a refused Continue moves the focus to the first field or box it marked invalid. The draft and
// its step are kept for the session (`ONBOARDING_DRAFT`), so a reopened screen resumes where it was left.
type Issues = {
  readonly fields: readonly FieldIssue[];
  readonly plan: readonly PlanIssueCode[];
  readonly coins: readonly SplitIssue[];
  readonly schedule: readonly ScheduleIssue[];
};
/** A new country or template is a new plan: the issues of the old one no longer apply. */
const NO_ISSUES: Issues = { fields: [], plan: [], coins: [], schedule: [] };

/** The steps both paths share after numbers or dates: each needs a plan whose dry run passes. */
const SHARED: readonly Step[] = ['why', 'reminder', 'summary'];
/** The step before the shared ones: dates on the custom path, numbers on the template path. */
const beforeShared = (draft: SetupDraft): Step => (draft.path === 'custom' ? 'dates' : 'numbers');

/** The template step's card for the draft: the own coins on the custom path, else its template, if any. */
function choiceOf(draft: SetupDraft): TemplateChoice | null {
  if (draft.path === 'custom') return { kind: 'custom' };
  return draft.templateId === null ? null : { kind: 'template', id: draft.templateId };
}

export type OnboardingScreenProps = { readonly device?: ReturnType<typeof deviceLocale> };

/** No overlay: every template keeps its English texts. */
const ENGLISH_TEXTS: ReadonlyMap<string, TemplateTexts> = new Map();

export function OnboardingScreen({ device }: OnboardingScreenProps) {
  const t = useTranslations('onboarding');
  const errors = useTranslations('errors');
  // The whole snapshot: the summary asks about the entries kept with no plan from the rows as this render sees them.
  const snapshot = useSnapshot((current) => current);
  const stored = snapshot.plan !== null;
  const today = useToday();
  const clock = useClock();
  const reminderWords = useReminderWords();
  const { language } = useServices();
  const { createPlan, pending } = useOnboardingActions();
  const drafts = useDrafts();
  const { form, entity } = ONBOARDING_DRAFT;
  const [saved] = useState(() => drafts.read(form, entity, OnboardingDraftSchema));
  const [profiles, setProfiles] = useState<CountryProfile[] | null>(null);
  // English is the templates' own text, on the first render; another language's texts load at mount and every step
  // that shows one (the list, the summary) waits for them, so no English shows first, and a failed load gives English
  // (ADR-0057). Kept with its language.
  const [loadedTexts, setLoadedTexts] = useState<{ language: string; texts: ReadonlyMap<string, TemplateTexts> }>();
  const [step, setStep] = useState<Step>(saved?.step ?? 'country');
  // The plan's id is made once with the draft, and kept with it: the calendar file's UID and the stored plan's id
  // are one. The early window's acceptance is never restored: it is asked again on the numbers (`resumeStep`).
  const [draft, setDraft] = useState<SetupDraft>(() =>
    saved === null
      ? emptyDraft(today, EntityIdSchema.parse(crypto.randomUUID()))
      : { ...saved.draft, acceptEarlyOpen: false },
  );
  const [issues, setIssues] = useState<Issues>(NO_ISSUES);
  const [refused, setRefused] = useState(0);
  const [found, setFound] = useState(false);
  /** A failed write or a plan the steps cannot build, or a kept currency another tab changed (ADR-0053). */
  const [failed, setFailed] = useState<'unknown' | 'changed' | null>(null);
  const steps = useRef<HTMLDivElement>(null);
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    steps.current?.querySelector<HTMLElement>('h2')?.focus();
  }, [step]);
  useEffect(() => {
    if (refused > 0) steps.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [refused]);
  // Every change is kept for the session; a stored plan, this screen's or another tab's, ends the draft. Nothing
  // is written before the profiles load and the step resumes: a screen left sooner keeps the saved draft as it was.
  const restored = profiles !== null;
  useEffect(() => {
    if (stored || found) drafts.clear(form, entity);
    else if (restored) drafts.write(form, entity, { step, draft });
  }, [drafts, form, entity, stored, found, restored, step, draft]);
  const suggestion = useMemo(
    () => (profiles === null ? null : suggestCountry(device ?? deviceLocale(), suggestionProfiles(profiles))),
    [profiles, device],
  );

  const profile = profiles?.find((candidate) => candidate.code === draft.country);
  const template = templateById(draft.templateId);
  const change = (patch: Partial<SetupDraft>) => setDraft((previous) => ({ ...previous, ...patch }));
  /** A new country or template is a new plan: its acceptance and issues start afresh. */
  const choose = (patch: Partial<SetupDraft>, next: Step) => {
    change({ ...patch, acceptEarlyOpen: false });
    setIssues(NO_ISSUES);
    setStep(next);
  };
  const contextOf = (chosen: CountryProfile): CustomContext & { readonly template: Template | null } => ({
    profile: chosen,
    numberInput: createNumberInput(localesFor(language, countryRules(chosen)).numbers),
    today,
    now: clock.now(),
    language,
    template,
  });
  // The restored step is shown as the first step is, without moving the focus. A shared step is kept only while the
  // plan's dry run passes (a template's dates can run out between visits); else the screen resumes before it.
  const resume = useEffectEvent((loaded: CountryProfile[]) => {
    if (saved === null) return;
    const next = resumeStep(saved, loaded, templateById);
    const chosen = loaded.find((candidate) => candidate.code === draft.country);
    // Lazy: the dry run needs the template, which `resumeStep` has checked only for a shared step.
    const passes = () => chosen !== undefined && checkPlan(draft, contextOf(chosen)).ok;
    shown.current = SHARED.includes(next) && !passes() ? beforeShared(draft) : next;
    setStep(shown.current);
  });
  useEffect(
    () =>
      void loadProfiles(language).then((loaded) => {
        resume(loaded);
        setProfiles(loaded);
      }),
    [language],
  );
  useEffect(() => {
    if (language === 'en') return;
    const done = (texts: ReadonlyMap<string, TemplateTexts>) => setLoadedTexts({ language, texts });
    void loadTemplateTexts(language).then(done, () => done(ENGLISH_TEXTS));
  }, [language]);
  const texts = language === 'en' ? ENGLISH_TEXTS : loadedTexts?.language === language ? loadedTexts.texts : null;
  // Dated in the UI language with the country's formatting, as the plan screens show them (ADR-0023); before a
  // country is chosen, the UI language's.
  const formatOf = (chosen: CountryProfile | undefined) => {
    const locales = localesFor(language, chosen === undefined ? null : countryRules(chosen));
    return createFormatters(locales.numbers, locales.ui);
  };
  // The write is told the question this render showed; a `changed` outcome writes nothing and keeps the draft.
  const write = (plan: Plan, next: CurrencyCode) => {
    setIssues(NO_ISSUES);
    setFailed(null);
    createPlan(plan, { next, shown: keptQuestion(snapshot, next) }).then(
      (outcome) => {
        if (outcome === 'changed') return setFailed('changed');
        drafts.clear(form, entity);
        setFound(outcome === 'stored');
      },
      () => setFailed('unknown'),
    );
  };
  /** Numbers' and Dates' Continue: the plan's dry run, so every refusal comes before the sentence. */
  const proceed = () => {
    if (profile === undefined) return;
    const result = checkPlan(draft, contextOf(profile));
    if (result.ok) {
      setIssues(NO_ISSUES);
      return setStep('why');
    }
    const { error } = result;
    if (error.code === 'fields') setIssues({ ...NO_ISSUES, fields: error.issues });
    else if (error.code === 'schedule') setIssues({ ...NO_ISSUES, schedule: error.issues });
    else if (draft.path === 'template') {
      setIssues({ ...NO_ISSUES, plan: error.code === 'invalid-plan' ? error.issues : [] });
    }
    // The coins were read on their own Continue; an issue of the whole custom plan has no field.
    else setFailed('unknown');
    setRefused((count) => count + 1);
  };
  /** The plan the summary shows and Start writes, read again at each render and at the tap. */
  const planned = () => {
    if (profile === undefined) return null;
    const result = checkPlan(draft, contextOf(profile));
    return result.ok ? result.value : null;
  };
  // Start acknowledges the disclosure above it at the tap's time (docs/LEGAL.md §4), in the currency answered.
  const start = (paid: CurrencyCode) => {
    const plan = planned();
    const written = plan === null ? null : paidIn(plan, paid);
    if (plan === null || written === null) setFailed('unknown');
    else write(written, plan.payCurrency);
  };
  const toDates = () => {
    if (profile === undefined) return;
    const coins = coinsIssues(draft, contextOf(profile));
    setIssues({ ...NO_ISSUES, coins });
    if (coins.length === 0) setStep('dates');
  };

  // A shared step whose plan can no longer be built (the day moved on) is left for its numbers or dates, as a
  // restored one is: their Continue's dry run runs again, the reminder for the old dates is asked again, and the
  // step change moves the focus to the heading. Set while rendering, so no empty or stale step is ever shown.
  if (restored && SHARED.includes(step) && planned() === null) {
    change({ reminder: null });
    setStep(beforeShared(draft));
  }
  // A plan another tab stored is said once the write finds it; the plan this screen wrote never is (issue 101).
  const existing = found || (stored && !pending);
  const dates = () => {
    if (profile === undefined) return null;
    const value = scheduleValueOf(draft);
    return (
      <DatesStep
        value={value}
        issues={issues.schedule}
        currency={profile.currency}
        // The buy day stays the first buy's own until the user picks one in the select.
        onChange={(next) =>
          change({ ...draftPatchOf(next), buyDay: next.buyDay === value.buyDay ? draft.buyDay : next.buyDay })
        }
        onBack={() => setStep('coins')}
        onContinue={proceed}
      />
    );
  };
  const numbers = () => {
    if (profile === undefined || template === null) return null;
    const askLastBuy = needsLastBuy(template, today, draft.firstBuy);
    return (
      <NumbersStep
        draft={draft}
        currency={profile.currency}
        format={formatOf(profile)}
        askLastBuy={askLastBuy}
        templateLastBuy={askLastBuy ? null : (template.lastBuy ?? null)}
        fieldIssues={issues.fields}
        early={askLastBuy ? null : earlyOf(template, profile, formatOf(profile), today)}
        earlyInvalid={issues.plan.includes('sell-window-before-eligibility') && !draft.acceptEarlyOpen}
        onChange={change}
        onBack={() => setStep('template')}
        onContinue={proceed}
      />
    );
  };
  /** The steps both paths share, after the plan's dry run passed; never rendered without a plan (see above). */
  const shared = () => {
    if (step === 'why') {
      return (
        <WhyStep
          value={draft.why}
          onChange={(why) => change({ why })}
          onBack={() => setStep(beforeShared(draft))}
          onContinue={() => setStep('reminder')}
        />
      );
    }
    const plan = planned();
    if (profile === undefined || plan === null) return null;
    const remind = (reminder: SetupDraft['reminder']) => {
      change({ reminder });
      setStep('summary');
    };
    if (step === 'reminder') {
      return (
        <ReminderStep
          file={reminderFile(plan, today, clock.now(), reminderWords)}
          onAdd={() => remind('calendar')}
          onLater={() => remind('later')}
          onBack={() => setStep('why')}
        />
      );
    }
    // The summary names the template: in another language it waits for the texts, as the list does.
    if (texts === null) return null;
    const shown = template === null ? undefined : texts.get(template.id);
    return (
      <SummaryStep
        plan={plan}
        holding={cardOf(profile, formatOf(profile), today)}
        templateName={template === null ? null : (shown?.name ?? template.name)}
        templateLanguage={template === null ? undefined : shown === undefined ? 'en' : contentLanguageOf(shown)}
        reminder={draft.reminder}
        format={formatOf(profile)}
        pending={pending}
        question={keptQuestion(snapshot, plan.payCurrency)}
        savedEntries={liveEntries(snapshot.entries).length}
        onBack={() => setStep('reminder')}
        onStart={start}
      />
    );
  };

  return (
    <div ref={steps} className="mx-auto flex w-full max-w-reading flex-col gap-stack-lg px-gutter py-stack-lg">
      <h1 className="font-semibold text-28 tracking-heading">{t('title')}</h1>
      {existing ? (
        <>
          <p>{t('existing.body')}</p>
          <Link href="/plan" className={buttonVariants({ variant: 'secondary', className: 'self-start' })}>
            {t('existing.link')}
          </Link>
        </>
      ) : profiles === null ? null : step === 'country' ? (
        <CountryStep
          choices={countryChoices(profiles, suggestion)}
          suggestion={suggestion}
          value={draft.country}
          onChoose={(country) => choose({ country }, 'template')}
        />
      ) : step === 'coins' ? (
        <CoinsStep
          value={draft.coins}
          issues={issues.coins}
          onChange={(coins) => change({ coins })}
          onBack={() => setStep('template')}
          onContinue={toDates}
        />
      ) : step === 'dates' ? (
        dates()
      ) : SHARED.includes(step) ? (
        shared()
      ) : step === 'template' || profile === undefined || template === null ? (
        texts !== null && (
          <TemplateStep
            value={choiceOf(draft)}
            format={formatOf(profile)}
            texts={texts}
            onBack={() => setStep('country')}
            onChoose={(choice) =>
              choice.kind === 'custom'
                ? choose({ path: 'custom', templateId: null }, 'coins')
                : choose({ path: 'template', templateId: choice.id }, 'numbers')
            }
          />
        )
      ) : (
        numbers()
      )}
      {failed !== null && (
        <p role="alert" className="text-negative">
          {failed === 'changed' ? t('summary.kept.changed') : errors('unknown')}
        </p>
      )}
    </div>
  );
}

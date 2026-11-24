// The four starting points of docs/DOMAIN.md §5 (ADR-0009), in the order of its table, as the core's
// `Template`: the onboarding offers them, `planFromTemplate` starts a plan from one, and `followsTemplate`
// with `templateById(plan.templateId)` tells the Plan page whether the plan is still the template.
import type { CalendarDate, Percent, References, Split, Template } from '@proofofcalm/core';
import accumulate from '../../templates/accumulate.json' with { type: 'json' };
import btcOnlyHold from '../../templates/btc-only-hold.json' with { type: 'json' };
import cyclePlan from '../../templates/cycle-plan.json' with { type: 'json' };
import twoCoins from '../../templates/two-coins.json' with { type: 'json' };
import { applyOverlay, type ContentLanguage, type OverlayLanguage } from '../i18n/overlay.ts';
import type { ContentTemplate } from '../schema/template.ts';
import { templateDatePaths } from '../template-dates.ts';
import { asCoinId, asDate, asPercent } from './brands.ts';
import { markLanguage } from './language.ts';

/** A record with every value branded; absent keys stay absent, as `exactOptionalPropertyTypes` wants. */
const branded = <T>(record: Readonly<Record<string, string>>, brand: (value: string) => T) =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, brand(value)]));

function forCore(template: ContentTemplate): Template {
  const { coins, split, lastBuy, sellWindow, references, validUntil, lastReviewed, ...text } = template;
  // The thirds' dates are the text's alone: the core's references, which a plan copies, have no field for them.
  const { secondThird: _second, lastThird: _last, ...planReferences } = references;
  return {
    ...text,
    coins: coins.map((coin) => ({ ...coin, id: asCoinId(coin.id) })),
    // The keys are the coins' tickers, checked against `coins` by the content gate (split-unknown-coin).
    split: branded(split, asPercent) as Split,
    ...(lastBuy === undefined ? {} : { lastBuy: asDate(lastBuy) }),
    sellWindow: sellWindow === null ? null : (branded(sellWindow, asDate) as Template['sellWindow']),
    references: branded(planReferences, asDate) as References,
    ...(validUntil === undefined ? {} : { validUntil: asDate(validUntil) }),
    lastReviewed: asDate(lastReviewed),
  };
}

/**
 * The core's template with the falls its card's dated band is composed from (docs/LEGAL.md §4) and the dates its text
 * names by `{date:<field>}` (`fillTemplateDates`), which the core never reads.
 */
export type OfferedTemplate = Template & {
  readonly drawdowns: readonly Drawdown[];
  readonly dates: ReadonlyMap<string, CalendarDate>;
};

/** One coin's fall, branded as the app formats it: the dates are calendar days, the fall a percentage of 0–100. */
export type Drawdown = Omit<ContentTemplate['drawdowns'][number], 'high' | 'low' | 'fall'> & {
  readonly high: CalendarDate;
  readonly low: CalendarDate;
  readonly fall: Percent;
};

export const TEMPLATES: readonly OfferedTemplate[] = [btcOnlyHold, twoCoins, cyclePlan, accumulate].map((json) => {
  const template = json as ContentTemplate;
  const drawdowns = template.drawdowns.map((each) => ({
    ...each,
    high: asDate(each.high),
    low: asDate(each.low),
    fall: asPercent(each.fall),
  }));
  return { ...forCore(template), drawdowns, dates: templateDatePaths(template) };
});

/** The template a plan started from (`plan.templateId`), or null for a custom plan or an id no longer offered. */
export function templateById(id: string | null): OfferedTemplate | null {
  return TEMPLATES.find((template) => template.id === id) ?? null;
}

/** A template's four texts, the ones a translation holds (ADR-0057's TRANSLATABLE); everything else stays English. */
export type TemplateTexts = Pick<OfferedTemplate, 'name' | 'oneLine' | 'riskLabel' | 'explanation'>;

type TemplateId = 'accumulate' | 'btc-only-hold' | 'cycle-plan' | 'two-coins';
type OverlayFile = () => Promise<{ readonly default: unknown }>;

// The translations under packages/content/i18n (ADR-0057), each its own chunk: Vite puts it under
// `assets/messages/<locale>/`, outside the worker's precache (ADR-0045 §8). A test holds this record to the files.
export const TEMPLATE_OVERLAYS: Readonly<Record<OverlayLanguage, Partial<Record<TemplateId, OverlayFile>>>> = {
  'pt-PT': {
    accumulate: () => import('../../i18n/pt-PT/templates/accumulate.json'),
    'btc-only-hold': () => import('../../i18n/pt-PT/templates/btc-only-hold.json'),
    'cycle-plan': () => import('../../i18n/pt-PT/templates/cycle-plan.json'),
    'two-coins': () => import('../../i18n/pt-PT/templates/two-coins.json'),
  },
  de: {
    accumulate: () => import('../../i18n/de/templates/accumulate.json'),
    'btc-only-hold': () => import('../../i18n/de/templates/btc-only-hold.json'),
    'cycle-plan': () => import('../../i18n/de/templates/cycle-plan.json'),
    'two-coins': () => import('../../i18n/de/templates/two-coins.json'),
  },
};

// The English texts, marked English (./language.ts); a translation over them is marked with its language.
const textsOf = ({ name, oneLine, riskLabel, explanation }: TemplateTexts): TemplateTexts =>
  markLanguage({ name, oneLine, riskLabel, explanation }, 'en');

const translated = new Map<string, TemplateTexts>();

// A translation's chunk that fails to load (offline before it was ever fetched) gives the English texts and is not
// kept, so the next load retries; the file is read inside the try, since Vite's preload wrapper can resolve a failed
// import to undefined (as in ./countries.ts).
async function textsIn(template: OfferedTemplate, language: ContentLanguage): Promise<TemplateTexts> {
  const english = textsOf(template);
  const overlays: Partial<Record<string, OverlayFile>> = language === 'en' ? {} : TEMPLATE_OVERLAYS[language];
  const overlay = overlays[template.id];
  if (overlay === undefined) return english;
  const key = `${language}:${template.id}`;
  const known = translated.get(key);
  if (known !== undefined) return known;
  let file: unknown;
  try {
    file = (await overlay()).default;
  } catch {
    return english;
  }
  const result = markLanguage(applyOverlay(english, file, 'template'), language);
  translated.set(key, result);
  return result;
}

/** Every template's four texts in a language by template id, in `TEMPLATES`' order; English where none loads. */
export async function loadTemplateTexts(language: ContentLanguage = 'en'): Promise<ReadonlyMap<string, TemplateTexts>> {
  const texts = await Promise.all(TEMPLATES.map((template) => textsIn(template, language)));
  return new Map(TEMPLATES.map((template, index) => [template.id, texts[index] ?? textsOf(template)]));
}

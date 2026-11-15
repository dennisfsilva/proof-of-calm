// The holding-date tool's island (docs/research/holding-date-tool.md; ADR-0045 Deviations of 2026-11-15), loaded by
// the boot script at the end of /en/holding-date and bundled by scripts/bundle-islands.ts. It reads the fragment
// (`#country=pt&bought=2026-03-01`), which no request carries, once and on every `hashchange`; on submit it checks
// both inputs, writes the fragment with `replaceState` and shows the answer. It reveals one country's block and one
// effect in the prerendered markup and writes the dates into their `<time>` elements; every word is the page's own.
// No clock, no storage, no request: the answer is a date, never whether it has passed.
import {
  createDateFormatter,
  decodeHoldingRule,
  type HoldingFragment,
  holdingAnswer,
  holdingFragment,
  parseHoldingFragment,
} from '@proofofcalm/app/features/learn/site/tool';
import type { CalendarDate } from '@proofofcalm/core';

/** The site's English, as `localesFor('en', null)` gives it to the prerender (packages/app/src/lib/i18n/locale.ts). */
const UI_LOCALE = 'en-GB';

const date = document.querySelector<HTMLInputElement>('#holding-bought');
const form = date?.form;
const invalid = document.querySelector<HTMLElement>('[data-holding-invalid]');
const noCountry = document.querySelector<HTMLElement>('[data-holding-no-country]');

if (date && form && invalid && noCountry) {
  const radios = [...form.querySelectorAll<HTMLInputElement>('input[type="radio"][name="country"]')];
  const blocks = [...form.querySelectorAll<HTMLElement>('[data-country]')];
  const codes = radios.map((radio) => radio.value.toUpperCase());
  const bounds = { min: date.min as CalendarDate, max: date.max as CalendarDate };
  const format = createDateFormatter(UI_LOCALE);

  const fill = (time: HTMLTimeElement, day: CalendarDate) => {
    time.dateTime = day;
    time.textContent = format(day);
  };

  /** One country's block for a purchase on `bought`: its dated effect, or its rule text, or the under-review line. */
  const show = ({ country, bought }: HoldingFragment) => {
    for (const block of blocks) block.hidden = true;
    const radio = radios.find((candidate) => candidate.value === country);
    const block = blocks.find((candidate) => candidate.dataset.country === country);
    if (radio === undefined || block === undefined || bought === undefined) return null;
    const rules = radio.dataset.rule === undefined ? null : decodeHoldingRule(radio.dataset.rule);
    const answer = holdingAnswer(bought, { rule: { kind: 'none' }, overrides: [], ...rules, underReview: !rules });
    for (const effect of block.querySelectorAll<HTMLElement>('[data-effect]')) {
      effect.hidden = answer.kind !== 'dated' || effect.dataset.effect !== answer.effect;
      if (effect.hidden || answer.kind !== 'dated') continue;
      for (const time of effect.querySelectorAll<HTMLTimeElement>('time[data-from]')) fill(time, answer.from);
      for (const time of effect.querySelectorAll<HTMLTimeElement>('time[data-bought]')) fill(time, bought);
    }
    block.hidden = false;
    return block;
  };

  /** The inputs as the fragment states them: the country checked, the date filled, then the answer. */
  const read = () => {
    const q = parseHoldingFragment(location.hash, codes, bounds);
    if (q === null) return;
    for (const radio of radios) radio.checked = radio.value === q.country;
    if (q.bought !== undefined) date.value = q.bought;
    show(q)?.scrollIntoView({ block: 'nearest' });
  };

  const hint = (element: HTMLElement, shown: boolean) => {
    element.hidden = !shown;
  };

  // The page's own hints replace the browser's bubbles, which name no range in the site's words.
  form.noValidate = true;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const country = radios.find((radio) => radio.checked)?.value;
    const typed = date.value === '' ? null : parseHoldingFragment(`bought=${date.value}`, codes, bounds);
    const bought = typed?.bought;
    hint(noCountry, country === undefined);
    hint(invalid, bought === undefined);
    if (bought === undefined) date.setAttribute('aria-invalid', 'true');
    else date.removeAttribute('aria-invalid');
    // A hint means the inputs on screen are not the ones a shown result answered, so that result goes.
    if (country === undefined || bought === undefined) for (const block of blocks) block.hidden = true;
    if (country === undefined) return radios[0]?.focus();
    if (bought === undefined) return date.focus();
    const q = { country, bought };
    history.replaceState(null, '', `#${holdingFragment(q)}`);
    show(q)?.scrollIntoView({ block: 'nearest' });
  });
  window.addEventListener('hashchange', read);
  read();
  form.dataset.ready = '';
}

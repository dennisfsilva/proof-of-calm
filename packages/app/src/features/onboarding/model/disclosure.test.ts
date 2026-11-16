import { describe, expect, it } from 'vitest';
import { RISK_WORDING_LANGUAGES, RISK_WORDING_VERSION, riskWordingLanguage } from '../../../lib/brand';
import { UI_LANGUAGES } from '../../../lib/i18n/locale';
import { NAMESPACE_LOADERS } from '../../../lib/i18n/namespaces';
import onboarding from '../messages/en.json';
import onboardingPt from '../messages/pt-PT.json';

// The plan-creation disclosure is acknowledged with its wording version (docs/LEGAL.md §4, docs/DOMAIN.md
// §2.1): a plan records the version it was started under, so the words of a version never change.

/** Version 1, the text of docs/LEGAL.md §4 with the product's name as the message's `{product}`. */
const VERSION_1 =
  '{product} is software for a plan you design: no orders, no financial or tax advice. You can lose all of it: ' +
  'Bitcoin has fallen more than 75 % from a high four times since 2011; Ethereum fell 94 % in 2018. ' +
  'Use only money you will not need for years.';

/** Version 1 in pt-PT, the text counsel approved as the English text's equal (docs/LEGAL.md §4). */
const VERSION_1_PT =
  'A {product} é software para um plano seu: sem ordens nem aconselhamento financeiro ou fiscal. Pode perder tudo: ' +
  'desde 2011, a bitcoin caiu em 4 ocasiões mais de 75% face a um máximo; o ether caiu 94% em 2018. ' +
  'Use apenas dinheiro de que não precise durante anos.';

/** Words as shown, with `{product}` as the three words of the product's name. */
const words = (text: string) => text.replace('{product}', 'Proof of Calm').split(/\s+/).filter(Boolean).length;

describe('the plan-creation disclosure', () => {
  it('is the text of its wording version', () => {
    expect(RISK_WORDING_VERSION).toBe(1);
    expect(
      onboarding.disclosure.text,
      'The acknowledged text changed: raise RISK_WORDING_VERSION, then record the new text here as that version.',
    ).toBe(VERSION_1);
  });

  it('is the approved text of its wording version in pt-PT, in 40 to 50 words', () => {
    expect(
      onboardingPt.disclosure.text,
      "The pt-PT text changed: it needs counsel's approval and a new RISK_WORDING_VERSION.",
    ).toBe(VERSION_1_PT);
    expect(words(VERSION_1_PT)).toBeGreaterThanOrEqual(40);
    expect(words(VERSION_1_PT)).toBeLessThanOrEqual(50);
  });
});

// A plan records the language of the text acknowledged (docs/DOMAIN.md §2.1): a language counsel approved
// has its own hand-written text; every other one shows the English text, and records en.
type Onboarding = { readonly disclosure: { readonly text: string } };
const written = import.meta.glob<Onboarding>('../messages/*.json', { eager: true, import: 'default' });
const merged = import.meta.glob<Onboarding>('../../../messages/*/onboarding.json', { eager: true, import: 'default' });
const tag = (path: string) => /([^/]+)(?:\/onboarding)?\.json$/.exec(path)?.[1] ?? '';

describe('the languages of the plan-creation disclosure', () => {
  it('every approved language other than en has its own text in the hand-written file', () => {
    expect(RISK_WORDING_LANGUAGES).toContain('en');
    for (const language of RISK_WORDING_LANGUAGES.filter((each) => each !== 'en')) {
      const own = written[`../messages/${language}.json`];
      expect(own?.disclosure.text, language).toBeDefined();
      expect(own?.disclosure.text, language).not.toBe(onboarding.disclosure.text);
    }
  });

  it("every other language's generated file shows the English text, and a language without one loads English", () => {
    const others = UI_LANGUAGES.filter((language) => !RISK_WORDING_LANGUAGES.includes(language));
    expect(others).toContain('de');
    expect(others).not.toContain('pt-PT');
    for (const [path, file] of Object.entries(merged)) {
      if (others.includes(tag(path) as never)) expect(file.disclosure.text, path).toBe(onboarding.disclosure.text);
    }
    const files = Object.keys(merged).map(tag);
    for (const language of others.filter((each) => !files.includes(each))) {
      expect(NAMESPACE_LOADERS[language].onboarding, language).toBe(NAMESPACE_LOADERS.en.onboarding);
    }
  });

  it('records the language shown when it is approved, else en', () => {
    expect(riskWordingLanguage('en')).toBe('en');
    expect(riskWordingLanguage('pt-PT')).toBe('pt-PT');
    expect(riskWordingLanguage('de')).toBe('en');
    expect(riskWordingLanguage('pt-PT', ['en'])).toBe('en');
  });
});

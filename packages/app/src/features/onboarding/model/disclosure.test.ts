import { describe, expect, it } from 'vitest';
import { RISK_WORDING_LANGUAGES, RISK_WORDING_VERSION, riskWordingLanguage } from '../../../lib/brand';
import { UI_LANGUAGES } from '../../../lib/i18n/locale';
import { NAMESPACE_LOADERS } from '../../../lib/i18n/namespaces';
import onboarding from '../messages/en.json';

// The plan-creation disclosure is acknowledged with its wording version (docs/LEGAL.md §4, docs/DOMAIN.md
// §2.1): a plan records the version it was started under, so the words of a version never change.

/** Version 1, the text of docs/LEGAL.md §4 with the product's name as the message's `{product}`. */
const VERSION_1 =
  '{product} is software for a plan you design: no orders, no financial or tax advice. You can lose all of it: ' +
  'Bitcoin has fallen more than 75 % from a high four times since 2011; Ethereum fell 94 % in 2018. ' +
  'Use only money you will not need for years.';

describe('the plan-creation disclosure', () => {
  it('is the text of its wording version', () => {
    expect(RISK_WORDING_VERSION).toBe(1);
    expect(
      onboarding.disclosure.text,
      'The acknowledged text changed: raise RISK_WORDING_VERSION, then record the new text here as that version.',
    ).toBe(VERSION_1);
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
    expect(others).toContain('pt-PT');
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
    expect(riskWordingLanguage('pt-PT')).toBe('en');
    expect(riskWordingLanguage('de')).toBe('en');
    expect(riskWordingLanguage('pt-PT', ['en', 'pt-PT'])).toBe('pt-PT');
  });
});

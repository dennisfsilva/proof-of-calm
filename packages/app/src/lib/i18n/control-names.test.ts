import { describe, expect, it } from 'vitest';

// A control named inside a sentence (docs/CONTENT-STYLE.md §9): English writes its visible name bare, as the control
// shows it (`choose Add coins you already have`), and pt-PT writes the same control's name in guillemets
// (`escolha «Adicionar moedas que já tem»`). The list comes from the English messages: a label of more than one word,
// or one with a placeholder, that another message names after a lower-case word. Its pt-PT sentence then names the
// pt-PT label only in guillemets. An entry kind (`a Coins added entry`) is a noun in pt-PT (`um movimento de moedas
// adicionadas`) and never shows the label verbatim, so it is not checked. German's check is at the end of the file.

type Tree = { [key: string]: string | Tree };
const files = import.meta.glob<Tree>('../../messages/*/*.json', { eager: true, import: 'default' });

function leaves(language: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: string | Tree, path: string) => {
    if (typeof node === 'string') out.set(path, node);
    else for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
  };
  for (const [path, tree] of Object.entries(files)) {
    const match = /messages\/([^/]+)\/([^/]+)\.json$/u.exec(path);
    if (match?.[1] === language) walk(tree, match[2] ?? '');
  }
  return out;
}

const en = leaves('en');
const literal = (text: string) => text.replace(/[{}()[\]^$.*+?|\\]/gu, '\\$&');
const isLabel = (text: string) => /^\p{Lu}/u.test(text) && text.length <= 40 && !/[.:?]$/u.test(text);
// A one-word label is also a screen's or a coin's name, so it counts only where English says to choose it, in any
// tense (`if you chose Later`); `open Today` names a screen, a place, so other verbs do not count.
const isPhrase = (text: string) => text.includes(' ') || text.includes('{');
const choose = 'cho(?:ose|se|sen)';

/** Each English label another English message names mid-sentence, with that message's key. */
const english = [...en].flatMap(([labelKey, label]) => {
  // A country's name is no control: its forms (the `countries` namespace) name it after their preposition.
  if (!isLabel(label) || labelKey.startsWith('countries.')) return [];
  const inSentence = new RegExp(`${isPhrase(label) ? '\\p{Ll}' : choose} ${literal(label)}(?!\\p{L})`, 'u');
  return [...en].filter(([key, text]) => key !== labelKey && inSentence.test(text)).map(([key]) => ({ labelKey, key }));
});
/** Whether `language` translates the label: German's merged files still show English where a namespace is not. */
const translates = (local: Map<string, string>, labelKey: string) => local.get(labelKey) !== en.get(labelKey);

/** The English pairs whose sentence in `language` holds that language's label, with both texts. */
function pairs(language: string, translatedOnly = false) {
  const local = leaves(language);
  return english.flatMap(({ labelKey, key }) => {
    const label = local.get(labelKey) ?? '';
    const sentence = local.get(key) ?? '';
    if (translatedOnly && !translates(local, labelKey)) return [];
    return sentence.includes(label) ? [{ labelKey, key, label, sentence }] : [];
  });
}
/** One check per label and sentence: a tab's name is also a legend's and a summary row's. */
const once = (found: ReturnType<typeof pairs>) => [
  ...new Map(found.map((pair) => [`${pair.label} in ${pair.key}`, pair])).values(),
];
/** Whether `sentence` still shows `label` once every quoted use of it is taken out. */
const showsBare = (sentence: string, label: string, [open, close]: readonly [string, string]) =>
  sentence.split(`${open}${label}${close}`).join('').includes(label);

const found = pairs('pt-PT');
const named = once(found);

describe('a control named inside a pt-PT sentence', () => {
  it('is found for the controls the English sentences name', () => {
    expect(new Set(found.map(({ labelKey }) => labelKey))).toEqual(
      new Set([
        'log.move.title.new',
        'log.recordHeld',
        'log.recordMoved',
        'onboarding.reminder.later',
        'onboarding.summary.coins',
        'plan.coins.legend',
        'settings.tabs.coins',
        'settings.tabs.hold',
        'settings.tabs.data',
        'settings.country.question.keep',
        'settings.country.question.country',
        'settings.country.payCurrency.button',
        'settings.data.import.replace',
        'settings.data.confirm.replace',
        'today.action.asPlanned',
      ]),
    );
  });

  it('finds a one-word label after any tense of choose', () => {
    const later = found.filter(({ labelKey }) => labelKey === 'onboarding.reminder.later').map(({ key }) => key);
    expect(later).toEqual(expect.arrayContaining(['onboarding.reminder.notSaved', 'settings.reminder.line']));
  });

  it.each(named.map(({ label, key, sentence }) => [label, key, sentence]))(
    'stands in guillemets: %s in %s',
    (label, _key, sentence) => {
      expect(showsBare(sentence, label, ['«', '»'])).toBe(false);
    },
  );
});

// German (docs/CONTENT-STYLE.md §10) names the same controls in „…“, as the control shows it
// (`wählen Sie im Protokoll „Vorhandene Coins hinzufügen“`). German is translated namespace by namespace, so the
// check reads only the labels its files translate; a sentence still in English cannot hold a German label.
describe('a control named inside a German sentence', () => {
  const de = leaves('de');
  const german = pairs('de', true);
  /** The Settings tabs a sentence names; `Plan` is one word, so only `choose Plan` would count. */
  const TABS = ['settings.tabs.coins', 'settings.tabs.hold', 'settings.tabs.data'];

  it('reads the controls the German files translate', () => {
    const translated = new Set(
      english.filter(({ labelKey }) => translates(de, labelKey)).map(({ labelKey }) => labelKey),
    );
    expect([...translated]).toEqual(expect.arrayContaining(['today.action.asPlanned', ...TABS]));
  });

  // German Settings names its own tabs in its sentences, and German Plan's early-window lines name the holding
  // tab, so the check reads each of them against the tab's label.
  it('finds every German sentence that names a Settings tab', () => {
    const naming = german.filter(({ labelKey }) => TABS.includes(labelKey));
    expect(new Set(naming.map(({ labelKey, key }) => `${labelKey} in ${key}`))).toEqual(
      new Set([
        'settings.tabs.hold in plan.earlyWindow.notice',
        'settings.tabs.hold in plan.earlyWindow.refused',
        'settings.tabs.hold in settings.country.notSaved',
        'settings.tabs.hold in settings.data.prototype.country',
        'settings.tabs.data in settings.data.prototype.country',
        'settings.tabs.coins in settings.data.prototype.report.coins-defaulted',
        'settings.tabs.coins in settings.data.prototype.report.coin-not-in-plan',
        'settings.tabs.hold in settings.data.prototype.report.sell-window-dropped',
        'settings.tabs.coins in settings.data.exchange.leftOut.not-in-plan',
      ]),
    );
  });

  // German Settings' exchange import names Today's one-tap button and the Log's two controls for coins from
  // elsewhere, so the check reads each of them; the Log's move control and its sheet's title share one label.
  it('finds the controls the German exchange import names', () => {
    const inExchange = german.filter(({ key }) => key.startsWith('settings.data.exchange.'));
    expect(new Set(inExchange.map(({ labelKey, key }) => `${labelKey} in ${key}`))).toEqual(
      new Set([
        'today.action.asPlanned in settings.data.exchange.replaces',
        'today.action.asPlanned in settings.data.exchange.keeps',
        'today.action.asPlanned in settings.data.exchange.estimateLeft',
        'today.action.asPlanned in settings.data.exchange.heldReplaces',
        'today.action.asPlanned in settings.data.exchange.leftOut.uncovered',
        'log.recordHeld in settings.data.exchange.leftOut.coin-deposit',
        'log.recordMoved in settings.data.exchange.leftOut.coin-deposit',
        'log.recordMoved in settings.data.exchange.leftOut.notLogged',
        'log.move.title.new in settings.data.exchange.leftOut.coin-deposit',
        'log.move.title.new in settings.data.exchange.leftOut.notLogged',
        'settings.tabs.coins in settings.data.exchange.leftOut.not-in-plan',
      ]),
    );
  });

  // German Portfolio names the Log's control in a sentence, so the check reads it.
  it('finds the control German Portfolio names', () => {
    const inPortfolioOrLog = german.filter(({ key }) => /^(?:portfolio|log)\./u.test(key));
    expect(new Set(inPortfolioOrLog.map(({ labelKey, key }) => `${labelKey} in ${key}`))).toEqual(
      new Set(['log.recordHeld in portfolio.notBought']),
    );
  });

  // German Onboarding names the Log's control and its own reminder choice in sentences, so the check reads both;
  // Today's review choice shows the same word („Später“), so it is found in the same sentence.
  it('finds the controls German Onboarding names', () => {
    const inOnboarding = german.filter(({ key }) => key.startsWith('onboarding.'));
    expect(new Set(inOnboarding.map(({ labelKey, key }) => `${labelKey} in ${key}`))).toEqual(
      new Set([
        'log.recordHeld in onboarding.dates.startingHint',
        'log.recordHeld in onboarding.numbers.startingHint',
        'onboarding.reminder.later in onboarding.reminder.notSaved',
        'today.review.later in onboarding.reminder.notSaved',
      ]),
    );
  });

  it('tells a quoted name from a bare one', () => {
    const quotes = ['„', '“'] as const;
    expect(showsBare('Wählen Sie „Wie geplant gekauft“.', 'Wie geplant gekauft', quotes)).toBe(false);
    expect(showsBare('Wählen Sie Wie geplant gekauft.', 'Wie geplant gekauft', quotes)).toBe(true);
  });

  it('stands in „…“ in every German sentence that names one', () => {
    const bare = once(german).filter(({ label, sentence }) => showsBare(sentence, label, ['„', '“']));
    expect(bare.map(({ label, key }) => `${label} in ${key}`)).toEqual([]);
  });
});

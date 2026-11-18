import { describe, expect, it } from 'vitest';

// A control named inside a sentence (docs/CONTENT-STYLE.md §9): English writes its visible name bare, as the control
// shows it (`choose Add coins you already have`), and pt-PT writes the same control's name in guillemets
// (`escolha «Adicionar moedas que já tem»`). The list comes from the English messages: a label of more than one word,
// or one with a placeholder, that another message names after a lower-case word. Its pt-PT sentence then names the
// pt-PT label only in guillemets. An entry kind (`a Coins added entry`) is a noun in pt-PT (`um movimento de moedas
// adicionadas`) and never shows the label verbatim, so it is not checked.

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
const pt = leaves('pt-PT');
const literal = (text: string) => text.replace(/[{}()[\]^$.*+?|\\]/gu, '\\$&');
const isLabel = (text: string) => /^\p{Lu}/u.test(text) && text.length <= 40 && !/[.:?]$/u.test(text);
// A one-word label is also a screen's or a coin's name, so it counts only where English says to choose it, in any
// tense (`if you chose Later`); `open Today` names a screen, a place, so other verbs do not count.
const isPhrase = (text: string) => text.includes(' ') || text.includes('{');
const choose = 'cho(?:ose|se|sen)';

/** Each English label another English message names mid-sentence, with that message's key and both pt-PT texts. */
const found = [...en].flatMap(([labelKey, label]) => {
  if (!isLabel(label)) return [];
  const inSentence = new RegExp(`${isPhrase(label) ? '\\p{Ll}' : choose} ${literal(label)}(?!\\p{L})`, 'u');
  const ptLabel = pt.get(labelKey) ?? '';
  return [...en]
    .filter(([key, text]) => key !== labelKey && inSentence.test(text) && (pt.get(key) ?? '').includes(ptLabel))
    .map(([key]) => ({ labelKey, key, label: ptLabel, sentence: pt.get(key) ?? '' }));
});
/** One check per pt-PT label and sentence: a tab's name is also a legend's and a summary row's. */
const named = [...new Map(found.map((pair) => [`${pair.label} in ${pair.key}`, pair])).values()];

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
      const bare = sentence.split(`«${label}»`).join('');
      expect(bare.includes(label)).toBe(false);
    },
  );
});

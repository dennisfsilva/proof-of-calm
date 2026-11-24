// §2's German lists read from docs/CONTENT-STYLE.md, each entry asserted against findBanned, so the document and
// the code cannot part: the registration claim's regulators, prepositions, participles, gap and Aufsicht forms,
// and the gain noun's qualifiers and connectors. A near miss of each list passes, so the list bounds the code.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import banned from '../../style/banned.json' with { type: 'json' };
import { findBanned } from './banned.ts';

const rules = (text: string) => findBanned(text).map((finding) => `${finding.rule}: ${finding.match}`);
const styleGuide = readFileSync(new URL('../../../../docs/CONTENT-STYLE.md', import.meta.url), 'utf8');
const section2 = styleGuide.slice(styleGuide.indexOf('## 2. '), styleGuide.indexOf('## 3. '));
const germanRows = section2.slice(section2.indexOf('The German rows'));
const backticked = (text: string) =>
  [...text.matchAll(/`([^`]+)`/g)].map((match) => (match[1] ?? '').replace(/\s+/gu, ' '));
const subBullet = (opening: string, end: string) => {
  const start = germanRows.indexOf(opening);
  return start === -1 ? '' : germanRows.slice(start, germanRows.indexOf(end, start + 1)).replace(/\s+/gu, ' ');
};

const registration = subBullet('  - a registration claim', '\n\n');
const sentences = registration.split(/\.\s+(?=[A-Z])/u);
const sentence = (opening: string) => sentences.find((text) => text.startsWith(opening)) ?? '';
const regulators = backticked(sentence('Its regulator is')).flatMap((word) =>
  word === 'regulators' ? banned.regulators : [word],
);
const [byPart = '', registerPart = ''] = sentence('Its preposition is').split("before the regulator's register");
// Each group of prepositions with the articles it takes, then the prepositions before a register.
const prepositions = [...byPart.matchAll(/((?:`[^`]+`[^`(]*?)+)\(with or without ([^)]*)\)/gu)].flatMap((group) =>
  backticked(group[1] ?? '').flatMap((preposition) =>
    ['', ...backticked(group[2] ?? '')].map((article) => (article ? `${preposition} ${article}` : preposition)),
  ),
);
const registerPrepositions = backticked(byPart.slice(byPart.lastIndexOf(')')));
const [compound = '', ...registerArticles] = backticked(registerPart);
const registers = [
  compound,
  ...registerArticles.map((article) => `Register ${article.replace(/^Register /u, '')} BaFin`),
];
const [participleList = '', participleExample = ''] = sentence('Its participle is').split('(');
const participles = backticked(participleList);
const gapSentence = sentence('A gap is');
const gapBound = ['one', 'two', 'three', 'four'].indexOf(/at most (\w+) other words/u.exec(gapSentence)?.[1] ?? '') + 1;
const hyphens = [
  ...backticked(gapSentence),
  ...[...gapSentence.matchAll(/U\+([0-9A-F]{4})/gu)].map((match) =>
    String.fromCodePoint(Number.parseInt(match[1] ?? '', 16)),
  ),
];
const aufsicht = sentence('Or `Aufsicht`');
const [aufsichtPart = '', unterliegenPart = ''] = aufsicht.slice(0, aufsicht.lastIndexOf('(')).split('a form of');

describe('§2’s German registration claim, read from the document', () => {
  it('finds each list', () => {
    expect(regulators).toEqual([...banned.regulators, 'Finanzaufsicht', 'Aufsichtsbehörde', 'Finanzaufsichtsbehörde']);
    expect(prepositions).toEqual([
      'bei',
      'bei der',
      'bei dem',
      'bei den',
      'von',
      'von der',
      'von dem',
      'von den',
      'durch',
      'durch die',
      'durch den',
      'durch das',
    ]);
    expect(registerPrepositions).toEqual(['im', 'ins', 'in das', 'in dem']);
    expect(registers).toEqual(['BaFin-Register', 'Register der BaFin', 'Register des BaFin']);
    expect(participles).toEqual([
      'registriert',
      'eingetragen',
      'gemeldet',
      'beaufsichtigt',
      'überwacht',
      'kontrolliert',
    ]);
    expect(backticked(participleExample)).toEqual(['registrierter']);
    expect(gapBound).toBe(3);
    expect(hyphens).toEqual(['-', '‑']);
  });

  it.each(regulators)('refuses the regulator %j with a participle last and first', (regulator) => {
    expect(rules(`Proof of Calm ist bei der ${regulator} registriert.`)).toEqual([
      `advice: bei der ${regulator} registriert`,
    ]);
    expect(rules(`Registriert bei der ${regulator}.`)).toEqual([`advice: Registriert bei der ${regulator}`]);
  });

  it.each(prepositions)('refuses the preposition %j before the regulator', (preposition) => {
    expect(rules(`Proof of Calm ist ${preposition} BaFin registriert.`)).toEqual([
      `advice: ${preposition} BaFin registriert`,
    ]);
    expect(rules(`Eingetragen ${preposition} BaFin.`)).toEqual([`advice: Eingetragen ${preposition} BaFin`]);
  });

  it.each(registerPrepositions.flatMap((preposition) => registers.map((register) => `${preposition} ${register}`)))(
    'refuses the register %j with a participle last and first',
    (register) => {
      expect(rules(`Proof of Calm ist ${register} eingetragen.`)).toEqual([`advice: ${register} eingetragen`]);
      expect(rules(`Eingetragen ${register}.`)).toEqual([`advice: Eingetragen ${register}`]);
    },
  );

  it.each(participles)('refuses the participle %j last, first, longer and joined', (participle) => {
    expect(rules(`Von der BaFin ${participle}.`)).toEqual([`advice: Von der BaFin ${participle}`]);
    expect(rules(`Proof of Calm ist ${participle} bei der BaFin.`)).toEqual([`advice: ${participle} bei der BaFin`]);
    expect(rules(`Ein bei der BaFin ${participle}er Anbieter.`)).toEqual([`advice: bei der BaFin ${participle}er`]);
    for (const hyphen of hyphens) {
      expect(rules(`Proof of Calm ist BaFin${hyphen}${participle}.`)).toEqual([`advice: BaFin${hyphen}${participle}`]);
    }
  });

  it.each(hyphens)('counts the gap’s words with the hyphen %j, up to the bound, in both orders', (hyphen) => {
    const words = (count: number) =>
      ['als', 'seit', '2024', 'ein'].slice(0, count - 1).concat(`Krypto${hyphen}Anbieter`);
    for (let count = 1; count <= gapBound; count += 1) {
      const gap = words(count).join(' ');
      expect(rules(`Bei der BaFin ${gap} registriert.`), gap).toEqual([`advice: Bei der BaFin ${gap} registriert`]);
      expect(rules(`Registriert ${gap} bei der BaFin.`), gap).toEqual([`advice: Registriert ${gap} bei der BaFin`]);
    }
    const over = words(gapBound + 1).join(' ');
    expect(findBanned(`Bei der BaFin ${over} registriert.`), over).toEqual([]);
    expect(findBanned(`Registriert ${over} bei der BaFin.`), over).toEqual([]);
  });

  it('refuses Aufsicht and unterliegen with each article, and the regulator joined to Aufsicht', () => {
    const aufsichtArticles = backticked(aufsichtPart).slice(1);
    const [unterliegen = '', ...unterliegenArticles] = backticked(unterliegenPart);
    expect(aufsichtArticles).toEqual(['der', 'des', 'durch die']);
    expect([unterliegen, ...unterliegenArticles]).toEqual(['unterliegen', 'der', 'dem', 'den']);
    for (const article of aufsichtArticles) {
      expect(rules(`Unter Aufsicht ${article} BaFin.`)).toEqual([`advice: Aufsicht ${article} BaFin`]);
    }
    for (const form of ['unterliegt', 'unterliegen', 'unterliegst']) {
      for (const article of unterliegenArticles) {
        expect(rules(`Proof of Calm ${form} ${article} BaFin.`)).toEqual([`advice: ${form} ${article} BaFin`]);
      }
    }
    for (const hyphen of hyphens) {
      expect(rules(`Unter BaFin${hyphen}Aufsicht.`)).toEqual([`advice: BaFin${hyphen}Aufsicht`]);
    }
  });

  it('passes the near misses: no regulator, an article the list leaves out, and another verb', () => {
    for (const text of [
      'Proof of Calm unterliegt keiner Aufsicht.',
      'Proof of Calm unterliegt keiner Finanzaufsicht.',
      'Bei keiner Finanzaufsichtsbehörde registriert.',
      'Proof of Calm ist bei keiner BaFin registriert.',
      'Die BaFin führt ein öffentliches Register.',
      'Im BaFin-Register stehen Anbieter mit Lizenz.',
      'Von der BaFin veröffentlicht.',
      // The past forms are left out, since „Unterlagen der BaFin“ names the regulator's documents.
      'Die Unterlagen der BaFin sind öffentlich.',
    ]) {
      expect(findBanned(text), text).toEqual([]);
    }
  });
});

const noun = subBullet('  - A noun may take', '\n  - ');
const qualifiers = backticked(noun.slice(0, noun.indexOf('; then a colon')));
const connectors = backticked(noun.slice(noun.lastIndexOf('; then ')));

describe('§2’s German gain noun’s qualifiers and connectors, read from the document', () => {
  it('finds both lists', () => {
    expect(qualifiers).toEqual([
      'pro Jahr',
      'im Jahr',
      'je Jahr',
      'pro Monat',
      'im Monat',
      'je Monat',
      'p. a.',
      'p.a.',
      'im Schnitt',
    ]);
    expect(connectors).toEqual([
      'bis zu',
      'über',
      'mehr als',
      'rund',
      'etwa',
      'ca.',
      'circa',
      'ungefähr',
      'um',
      'um die',
      'durchschnittlich',
      'jährlich',
      'monatlich',
    ]);
  });

  it.each(qualifiers)('refuses the qualifier %j between the noun and its join', (qualifier) => {
    expect(rules(`Eine Rendite ${qualifier} von 8 %.`)).toEqual([`return-percentage: Rendite ${qualifier} von 8 %`]);
  });

  it.each(connectors)('refuses the connector %j before the figure', (connector) => {
    expect(rules(`Eine Rendite von ${connector} 8 %.`)).toEqual([`return-percentage: Rendite von ${connector} 8 %`]);
  });

  it('passes a qualifier or a connector the lists leave out', () => {
    for (const text of [
      'Eine Rendite pro Woche von 8 %.',
      'Eine Rendite im Quartal von 8 %.',
      'Eine Rendite von knapp 8 %.',
    ]) {
      expect(findBanned(text), text).toEqual([]);
    }
  });
});

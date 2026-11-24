// §2's German lists read from docs/CONTENT-STYLE.md, each entry asserted against findBanned, so the document and
// the code cannot part: the registration claim's regulators, prepositions, register, adjective, participles,
// nouns, gap, Aufsicht and unterliegen forms and examples, §10's register sentences, and the gain noun's
// qualifiers and connectors and the Prozent line. A near miss of each list passes, so the list bounds the code.
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
// Each bracket's parts marked „fails:“ or „passes:“ are whole examples; the other brackets name parts of the claim.
const examples = (mark: 'fails' | 'passes') =>
  [...registration.matchAll(/\(([^)]*)\)/gu)].flatMap((bracket) =>
    (bracket[1] ?? '')
      .split(';')
      .map((part) => part.trim())
      .flatMap((part) => (part.startsWith(`${mark}:`) ? backticked(part) : [])),
  );
const regulatorSentence = sentence('Its regulator is');
const longerAt = regulatorSentence.indexOf('or a longer word');
const regulators = backticked(regulatorSentence.slice(0, longerAt)).flatMap((word) =>
  word === 'regulators' ? banned.regulators : [word],
);
const longerStarts = backticked(regulatorSentence.slice(longerAt, regulatorSentence.lastIndexOf('(')));
const longerRegulators = backticked(regulatorSentence.slice(regulatorSentence.lastIndexOf('(')));
const byPart = sentence('Its preposition is').split("before the regulator's register")[0] ?? '';
// Each group of prepositions with the articles it takes, then the prepositions before a register.
const prepositions = [...byPart.matchAll(/((?:`[^`]+`[^`(]*?)+)\(with or without ([^)]*)\)/gu)].flatMap((group) =>
  backticked(group[1] ?? '').flatMap((preposition) =>
    ['', ...backticked(group[2] ?? '')].map((article) => (article ? `${preposition} ${article}` : preposition)),
  ),
);
const registerPrepositions = backticked(byPart.slice(byPart.lastIndexOf(')')));
const registerParts = backticked(sentence('That register is'));
const adjectiveSentence = sentence('Each article');
const adjectiveContractions = backticked(adjectiveSentence.slice(0, adjectiveSentence.indexOf('may take')));
const adjectiveBound =
  ['one', 'two', 'three'].indexOf(/up to (\w+) adjectives/u.exec(adjectiveSentence)?.[1] ?? '') + 1;
const adjectiveEndings = backticked(adjectiveSentence.slice(adjectiveSentence.indexOf('whose last part')));
const bareSentence = sentence('With no article');
const [barePrepositions, bareException] = ((words) => [words.slice(0, -1), words.at(-1) ?? ''] as const)(
  backticked(bareSentence.slice(0, bareSentence.indexOf('('))),
);
const [participleList = '', participleExample = ''] = sentence('Its participle is').split('(');
const participles = backticked(participleList);
const nouns = backticked(sentence('Its noun is'));
const gapSentence = sentence('A gap is');
const gapBound = ['one', 'two', 'three', 'four'].indexOf(/at most (\w+) other words/u.exec(gapSentence)?.[1] ?? '') + 1;
const hyphens = [
  ...backticked(gapSentence),
  ...[...gapSentence.matchAll(/U\+([0-9A-F]{4})/gu)].map((match) =>
    String.fromCodePoint(Number.parseInt(match[1] ?? '', 16)),
  ),
];
// The register's two forms, each article with a regulator that takes it: BaFin is die BaFin, and des goes with
// der Banco de España, a regulator of the list.
const genitive: Record<string, string> = { der: 'BaFin', des: 'Banco de España' };
const registers = [
  ...hyphens.map((hyphen) => `BaFin${hyphen}Register`),
  ...registerParts.slice(2, 3),
  ...registerParts.slice(3).map((form) => `${form} ${genitive[form.replace(/^Register /u, '')] ?? ''}`),
];
const genitiveSentence = sentence('Genitive:');
const genitiveArticles = backticked(genitiveSentence.slice(0, genitiveSentence.indexOf('(')));
const aufsicht = sentence('Or `Aufsicht`');
const [aufsichtPart = '', unterliegenPart = ''] = aufsicht.slice(0, aufsicht.indexOf('(fails:')).split('a word that');
const plural = (noun: string) => (noun === 'Erlaubnis' ? 'Erlaubnisse' : `${noun}en`);
// §2's status words take every word that begins „Erlaubnis“, so that noun fails by itself as well.
const byItself = (word: string) => (/^erlaubnis/iu.test(word) ? [`advice: ${word}`] : []);

describe('§2’s German registration claim, read from the document', () => {
  it('finds each list', () => {
    expect(regulators).toEqual([...banned.regulators, 'Finanzaufsicht', 'Aufsichtsbehörde']);
    expect(longerStarts).toEqual(['Finanzaufsicht', 'Aufsichtsbehörde']);
    expect(longerRegulators).toEqual(['Finanzaufsichtsbehörde']);
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
    // A plain U+002D: §10 keeps the no-break hyphen U+2011 for numeral compounds.
    expect(registerParts).toEqual(['-', 'Register', 'ESMA-Registereintrag', 'Register der', 'Register des']);
    expect(registers).toEqual([
      'BaFin-Register',
      'BaFin‑Register',
      'ESMA-Registereintrag',
      'Register der BaFin',
      'Register des Banco de España',
    ]);
    expect(adjectiveContractions).toEqual(['im', 'ins']);
    expect(adjectiveBound).toBe(2);
    expect(adjectiveEndings).toEqual(['e', 'en', 'er', 'es']);
    expect(barePrepositions).toEqual(['bei', 'von', 'durch']);
    expect(bareException).toBe('kein');
    expect(participles).toEqual([
      'registriert',
      'eingetragen',
      'gemeldet',
      'beaufsichtigt',
      'überwacht',
      'kontrolliert',
    ]);
    expect(backticked(participleExample)).toEqual(['registrierter']);
    expect(nouns).toEqual(['Lizenz', 'Zulassung', 'Registrierung', 'Eintragung', 'Genehmigung', 'Erlaubnis']);
    expect(gapBound).toBe(3);
    expect(hyphens).toEqual(['-', '‑']);
  });

  // Every example is listed, so one cut from the document fails here as well as one added unread.
  it('finds every example', () => {
    expect(examples('fails')).toEqual([
      'bei der zuständigen deutschen Aufsichtsbehörde registriert',
      'im öffentlichen Register der BaFin eingetragen',
      'in das öffentliche BaFin-Register eingetragen',
      'bei deutscher Finanzaufsicht registriert',
      'bei der EU-weiten Aufsichtsbehörde registriert',
      'bei der BaFin seit 2024 registriert',
      'von der BaFin überwacht',
      'hat bei der BaFin eine Lizenz',
      'bei der BaFin die Registrierungsnummer',
      'registriert als Krypto-Dienstleister bei der BaFin',
      'Zulassung durch die BaFin',
      'eine Zulassung der BaFin',
      'eine Lizenz der BaFin',
      'Erlaubnis der zuständigen deutschen Aufsichtsbehörde',
      'Die Zulassung der BaFin ist für Anbieter Pflicht',
      'BaFin-registriert',
      'BaFin-Lizenz',
      'BaFin-Lizenznummer',
      'BaFin-aufsichtspflichtig',
      'unterliegt keiner BaFin-Aufsicht',
      'unter Aufsicht der BaFin',
      'unterliegt der deutschen Finanzaufsicht',
      'Krypto-Dienstleister in der EU unterliegen der MiCA-Verordnung',
    ]);
    expect(examples('passes')).toEqual([
      'bei keiner zuständigen Aufsichtsbehörde registriert',
      'bei der zuständigen deutschen staatlichen Aufsichtsbehörde registriert',
      'Im BaFin-Register stehen Anbieter mit Lizenz',
      'Zulassung der Anbieter',
      'Anbieter brauchen eine Zulassung, die die BaFin erteilt',
      'BaFin-Aufsichtsrecht',
      'BaFin-Aufsichtsmitteilung',
      'BaFin-Zulassungsverfahren',
      'unterliegt keiner Finanzaufsicht',
      'unterlag der BaFin',
      'Die MiCA-Verordnung gilt für Krypto-Dienstleister in der EU',
    ]);
  });

  // A status claim the lint lets through says so: §2's status row still refuses it in copy.
  it('marks the adjective bound’s pass as the lint’s only', () => {
    expect(sentence('Three adjectives pass')).toMatch(
      /pass the lint only; §2's status row still refuses them in copy/u,
    );
    expect(registration).not.toMatch(/table's status row|neuen/u);
  });

  it.each(adjectiveEndings)(
    'refuses up to the bound of adjectives with the ending %j, with or without an article',
    (ending) => {
      const adjectives = (count: number) =>
        ['staatlich', 'zuständig', 'deutsch']
          .slice(0, count)
          .map((stem) => `${stem}${ending}`)
          .join(' ');
      for (let count = 1; count <= adjectiveBound; count += 1) {
        for (const preposition of [...barePrepositions, 'bei der']) {
          const claim = `${preposition} ${adjectives(count)} Finanzaufsicht registriert`;
          expect(rules(`Proof of Calm ist ${claim}.`), claim).toEqual([`advice: ${claim}`]);
        }
      }
      for (const preposition of [...barePrepositions, 'bei der']) {
        const over = `Proof of Calm ist ${preposition} ${adjectives(adjectiveBound + 1)} Finanzaufsicht registriert.`;
        expect(findBanned(over), over).toEqual([]);
      }
      for (const preposition of barePrepositions) {
        const negation = `Proof of Calm ist ${preposition} ${bareException}${ending} Finanzaufsicht registriert.`;
        expect(findBanned(negation), negation).toEqual([]);
      }
    },
  );

  it('refuses each noun joined to nummer and the joined aufsichtspflichtig with either initial', () => {
    const joined = backticked(sentence('Joined:').slice(0, sentence('Joined:').indexOf('(')));
    expect(joined).toEqual(['nummer', 'Aufsicht', 'aufsichtspflichtig']);
    for (const hyphen of hyphens) {
      for (const noun of nouns) {
        const word = `BaFin${hyphen}${noun}${noun.endsWith('ung') ? 's' : ''}nummer`;
        expect(rules(`Die ${word} lautet 12345.`), word).toEqual([`advice: ${word}`]);
      }
      for (const word of ['aufsichtspflichtig', 'Aufsichtspflichtig']) {
        expect(rules(`Proof of Calm ist BaFin${hyphen}${word}.`)).toEqual([`advice: BaFin${hyphen}${word}`]);
      }
    }
  });

  it.each([...regulators, ...longerRegulators])(
    'refuses the regulator %j with a participle last and first',
    (regulator) => {
      expect(rules(`Proof of Calm ist bei der ${regulator} registriert.`)).toEqual([
        `advice: bei der ${regulator} registriert`,
      ]);
      expect(rules(`Registriert bei der ${regulator}.`)).toEqual([`advice: Registriert bei der ${regulator}`]);
    },
  );

  it('reads each longer regulator as a word that begins with one of the two', () => {
    for (const regulator of longerRegulators) {
      expect(
        longerStarts.some((start) => regulator.startsWith(start)),
        regulator,
      ).toBe(true);
    }
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

  it('reads the register as a word that begins with Register', () => {
    expect(registerParts[1]).toBe('Register');
    expect(registerParts[2]?.split('-')[1]?.startsWith('Register')).toBe(true);
  });

  it.each(adjectiveEndings)('refuses one adjective with the ending %j after each article', (ending) => {
    const adjective = `zuständig${ending}`;
    for (const preposition of prepositions.filter((group) => group.includes(' '))) {
      expect(rules(`Proof of Calm ist ${preposition} ${adjective} BaFin registriert.`), preposition).toEqual([
        `advice: ${preposition} ${adjective} BaFin registriert`,
      ]);
    }
    expect(rules(`Eingetragen im Register der ${adjective} BaFin.`)).toEqual([
      `advice: Eingetragen im Register der ${adjective} BaFin`,
    ]);
    // The register's prepositions hold an article (im, ins) or are one with it (in das, in dem), so each takes one too.
    expect(adjectiveContractions.every((contraction) => registerPrepositions.includes(contraction))).toBe(true);
    for (const preposition of registerPrepositions) {
      for (const register of registers) {
        const claim = `${preposition} öffentlich${ending} ${register} eingetragen`;
        expect(rules(`Proof of Calm ist ${claim}.`), claim).toEqual([`advice: ${claim}`]);
        const two = `${preposition} amtlich${ending} öffentlich${ending} ${register} eingetragen`;
        expect(rules(`Proof of Calm ist ${two}.`), two).toEqual([`advice: ${two}`]);
        expect(
          findBanned(
            `Proof of Calm ist ${preposition} neu${ending} amtlich${ending} öffentlich${ending} ${register} eingetragen.`,
          ),
        ).toEqual([]);
      }
    }
    expect(rules(`Proof of Calm unterliegt der ${adjective} BaFin.`)).toEqual([
      `advice: unterliegt der ${adjective} BaFin`,
    ]);
  });

  it.each(participles)('refuses the participle %j last, first, longer and joined', (participle) => {
    expect(rules(`Von der BaFin ${participle}.`)).toEqual([`advice: Von der BaFin ${participle}`]);
    expect(rules(`Proof of Calm ist ${participle} bei der BaFin.`)).toEqual([`advice: ${participle} bei der BaFin`]);
    expect(rules(`Ein bei der BaFin ${participle}er Anbieter.`)).toEqual([`advice: bei der BaFin ${participle}er`]);
    for (const hyphen of hyphens) {
      expect(rules(`Proof of Calm ist BaFin${hyphen}${participle}.`)).toEqual([`advice: BaFin${hyphen}${participle}`]);
    }
  });

  it.each(nouns)('refuses the noun %j first, longer and joined with its plural, and passes it last', (noun) => {
    expect(rules(`Eine ${noun} bei der BaFin.`)).toEqual([`advice: ${noun} bei der BaFin`]);
    expect(rules(`Die ${noun}snummer bei der BaFin.`)).toEqual([`advice: ${noun}snummer bei der BaFin`]);
    for (const hyphen of hyphens) {
      expect(rules(`Eine BaFin${hyphen}${noun}.`)).toEqual([`advice: BaFin${hyphen}${noun}`]);
      expect(rules(`Die BaFin${hyphen}${plural(noun)}.`)).toEqual([`advice: BaFin${hyphen}${plural(noun)}`]);
    }
    // Lengthened past its plural, a joined noun names a procedure („BaFin-Zulassungsverfahren“), so it passes.
    expect(rules(`Das BaFin-${noun}sverfahren.`)).toEqual(byItself(`${noun}sverfahren`));
    expect(rules(`Im BaFin-Register stehen Anbieter mit ${noun}.`)).toEqual(byItself(noun));
  });

  it.each(nouns)('refuses the noun %j in the genitive of each listed article, and passes another article', (noun) => {
    expect(genitiveArticles).toEqual(['der', 'des']);
    for (const article of genitiveArticles) {
      const regulator = genitive[article] ?? '';
      expect(rules(`Eine ${noun} ${article} ${regulator}.`)).toEqual([`advice: ${noun} ${article} ${regulator}`]);
      expect(rules(`Eine ${noun} ${article} zuständigen ${regulator}.`)).toEqual([
        `advice: ${noun} ${article} zuständigen ${regulator}`,
      ]);
      expect(rules(`Die ${noun}snummer ${article} ${regulator}.`)).toEqual([
        `advice: ${noun}snummer ${article} ${regulator}`,
      ]);
    }
    for (const article of ['die', 'dem', 'den']) {
      expect(rules(`Eine ${noun} ${article} BaFin.`), article).toEqual(byItself(noun));
    }
    expect(rules(`Eine ${noun} der zuständigen deutschen BaFin.`)).toEqual([
      `advice: ${noun} der zuständigen deutschen BaFin`,
    ]);
    expect(rules(`Eine ${noun} der zuständigen deutschen staatlichen BaFin.`)).toEqual(byItself(noun));
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

  it('refuses Aufsicht and the present forms of unterliegen with each article, and the regulator joined to Aufsicht', () => {
    const aufsichtArticles = backticked(aufsichtPart).slice(1);
    const [stem = '', ...unterliegenWords] = backticked(unterliegenPart);
    const forms = unterliegenWords.slice(0, 2);
    const unterliegenArticles = unterliegenWords.slice(2);
    expect(aufsichtArticles).toEqual(['der', 'des', 'durch die']);
    expect([stem, ...forms, ...unterliegenArticles]).toEqual([
      'unterlieg',
      'unterliegt',
      'unterliegen',
      'der',
      'dem',
      'den',
    ]);
    for (const article of aufsichtArticles) {
      expect(rules(`Unter Aufsicht ${article} BaFin.`)).toEqual([`advice: Aufsicht ${article} BaFin`]);
    }
    for (const form of [...forms, `${stem}st`]) {
      expect(form.startsWith(stem), form).toBe(true);
      for (const article of unterliegenArticles) {
        expect(rules(`Proof of Calm ${form} ${article} BaFin.`)).toEqual([`advice: ${form} ${article} BaFin`]);
      }
    }
    for (const hyphen of hyphens) {
      expect(rules(`Unter BaFin${hyphen}Aufsicht.`)).toEqual([`advice: BaFin${hyphen}Aufsicht`]);
    }
  });

  it('refuses the joined form after whatever word stands before it, the named one included', () => {
    const joinedSentence = sentence('The joined form fails whatever word stands before it');
    const named = backticked(joinedSentence.slice(0, joinedSentence.indexOf('(')));
    expect(named).toEqual(['keiner']);
    for (const word of [...named, 'keine', 'nicht', 'ohne', 'eine']) {
      for (const joined of ['Aufsicht', 'Lizenz', 'registriert']) {
        expect(rules(`Proof of Calm hat ${word} BaFin-${joined}.`), `${word} ${joined}`).toEqual([
          `advice: BaFin-${joined}`,
        ]);
      }
    }
  });

  it('reads the past forms of unterliegen as passes, since Unterlagen names documents', () => {
    expect(backticked(sentence('The past forms pass'))).toEqual(['Unterlagen der BaFin', 'unterlag der BaFin']);
    // They pass the lint only: the table's status row still refuses them in copy, since no status is claimed.
    expect(sentence('The past forms pass')).toMatch(/pass the lint only.*status row.*refuses them in copy/u);
    expect(findBanned('Proof of Calm unterlag der BaFin.')).toEqual([]);
    expect(findBanned('Die Unterlagen der BaFin sind öffentlich.')).toEqual([]);
  });

  it.each(examples('fails'))('refuses the example %j', (text) => {
    expect(findBanned(text)).not.toEqual([]);
  });

  it.each(examples('passes'))('passes the example %j', (text) => {
    expect(findBanned(text)).toEqual([]);
  });

  it('passes the near misses: no regulator, an article the list leaves out, another verb, three adjectives', () => {
    for (const text of [
      'Proof of Calm unterliegt keiner Aufsicht.',
      'Proof of Calm unterliegt keiner Finanzaufsicht.',
      'Bei keiner Finanzaufsichtsbehörde registriert.',
      'Proof of Calm ist bei keiner BaFin registriert.',
      'Die BaFin führt ein öffentliches Register.',
      'Im BaFin-Register stehen Anbieter mit Lizenz.',
      'Von der BaFin veröffentlicht.',
      'Proof of Calm ist bei der zuständigen deutschen staatlichen Aufsichtsbehörde registriert.',
      'Proof of Calm ist bei der zuständigem BaFin registriert.',
      'Proof of Calm ist bei der 2024 BaFin registriert.',
    ]) {
      expect(findBanned(text), text).toEqual([]);
    }
  });
});

const section10 = styleGuide.slice(styleGuide.indexOf('## 10. '));
const pointer = /`(Prüfen Sie dort[^`]*)`/u.exec(section10)?.[1] ?? '';
const notListed = /`(Proof of Calm ist kein Anbieter[^`]*)`/u.exec(section10)?.[1] ?? '';
const registerNamed = /`(Die ESMA führt[^`]*)`/u.exec(section10)?.[1] ?? '';
const term = /They hold one term, `([^`]+)`, the short form of the\s+glossary's `([^`]+)`/u.exec(section10);

describe('§10’s German register sentences, read from the document', () => {
  it('finds the three and passes them, alone and together', () => {
    expect(registerNamed).toBe(
      'Die ESMA führt ein öffentliches Register der Anbieter von Kryptowerte-Dienstleistungen.',
    );
    expect(pointer).toBe('Prüfen Sie dort, ob ein Anbieter eingetragen ist, bevor Sie ihm Geld senden.');
    expect(notListed).toBe('Proof of Calm ist kein Anbieter und dort nicht eingetragen.');
    for (const text of [registerNamed, pointer, notListed, `${registerNamed} ${pointer} ${notListed}`]) {
      expect(findBanned(text), text).toEqual([]);
    }
  });

  it('holds one term, the short form of the glossary’s', () => {
    const [, short = '', long = ''] = term ?? [];
    expect(short).toBe('Anbieter');
    expect(section10).toContain(`| ${long} |`);
    expect(long.startsWith(`${short} `)).toBe(true);
    for (const text of [registerNamed, pointer, notListed]) expect(text).toContain(short);
  });

  // Refused on purpose: a lint cannot tell the subject, so the register with a participle fails whoever is in it.
  // The comma keeps „im ESMA-Register“ apart from „eingetragen“, so the register named first passes.
  it('refuses the register sentence with the register beside its participle, and passes it named first', () => {
    expect(rules('Prüfen Sie, ob ein Anbieter im ESMA-Register eingetragen ist.')).toEqual([
      'advice: im ESMA-Register eingetragen',
    ]);
    expect(rules('Proof of Calm ist kein Anbieter und ist nicht im Register der ESMA eingetragen.')).toEqual([
      'advice: im Register der ESMA eingetragen',
    ]);
    expect(findBanned('Prüfen Sie im ESMA-Register, ob ein Anbieter eingetragen ist.')).toEqual([]);
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

// The Prozent line: its ending, then the examples that fail and the one that passes, as §2 writes them.
const percentLine = subBullet('  - `Prozent` reads as', '\n- ');
const [percentFails = '', percentPasses = ''] = percentLine.slice(percentLine.indexOf('So ')).split(' fail, and ');

describe('§2’s German Prozent line, read from the document', () => {
  it('finds its ending and examples', () => {
    expect(backticked(percentLine.slice(percentLine.indexOf('Either'), percentLine.indexOf('So ')))).toEqual([
      'ig',
      '5-prozentige',
      '5%ige',
    ]);
    expect(backticked(percentFails)).toEqual(['5-Prozent-Rendite', '5-prozentige Rendite', '5%ige Rendite']);
    expect(backticked(percentPasses)).toEqual(['5‑Prozent‑Hürde']);
  });

  it('refuses each failing example in a sentence, with either hyphen', () => {
    for (const example of backticked(percentFails)) {
      for (const text of [example, example.replaceAll('-', '‑')]) {
        expect(rules(`Eine ${text} ist möglich.`), text).toEqual([`return-percentage: ${text}`]);
      }
    }
  });

  it('passes the Hürde with both hyphens', () => {
    for (const example of backticked(percentPasses)) {
      for (const text of [example, example.replaceAll('‑', '-')]) {
        expect(findBanned(`Die ${text} gilt.`), text).toEqual([]);
      }
    }
  });
});

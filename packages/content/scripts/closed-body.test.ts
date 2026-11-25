import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkModuleBody } from '@proofofcalm/config/vite';
import { describe, expect, it } from 'vitest';
import { moduleTranslationProblems } from '../src/i18n/module-overlay-validate.ts';
import { parseModule } from '../src/loaders/modules.ts';
import { moduleProblems } from '../src/modules-validate.ts';
import type { Problem } from '../src/problem.ts';
import { figureContext } from '../src/validate.ts';
import { closedBodyProblems } from './closed-body.ts';

const learn = fileURLToPath(new URL('../learn/', import.meta.url));
const FRONT = ['---', 'slug: noise', 'title: Noise', '---', ''].join('\n');
// The chart's rows and the catalogue as scripts/validate.ts reads them, from the live files.
const content = fileURLToPath(new URL('../', import.meta.url));
const figures = figureContext(
  ['coins.json', ...readdirSync(join(content, 'cycles')).map((name) => `cycles/${name}`)].map((name) => ({
    path: `packages/content/${name}`,
    json: JSON.parse(readFileSync(join(content, name), 'utf8')),
  })),
);
// The live English modules, and each translated language's modules, every .mdx of its i18n/<language>/learn folder.
const i18n = fileURLToPath(new URL('../i18n/', import.meta.url));
const LEARN_LANGUAGES = readdirSync(i18n).filter((name) => existsSync(join(i18n, name, 'learn')));
const englishModules = () =>
  readdirSync(learn)
    .filter((name) => name.endsWith('.mdx'))
    .map((name) => parseModule(`packages/content/learn/${name}`, readFileSync(join(learn, name), 'utf8')))
    .flatMap((parsed) => (parsed.ok ? [parsed.value] : []));
const translatedModules = (language: string) => {
  const folder = join(i18n, language, 'learn');
  return readdirSync(folder)
    .filter((name) => name.endsWith('.mdx'))
    .map((name) => ({
      language,
      name,
      path: `packages/content/i18n/${language}/learn/${name}`,
      source: readFileSync(join(folder, name), 'utf8'),
    }));
};
// The element tests' bodies state no figures; src/module-figures.test.ts holds the figure rule.
const elementsOnly = (problems: readonly Problem[]) => problems.filter(({ code }) => !code.startsWith('figure-'));

// A literal English noise module and its literal pt-PT translation, through both checks as scripts/validate.ts runs them.
const at = 'packages/content/i18n/pt-PT/learn/noise.mdx';
const englishSource = (body: string, chart = 'none') => {
  const front = ['---', 'slug: noise', 'title: Noise', 'idea: Most price moves are noise.'];
  const rest = ['caveat: A plan can lose money.', `chart: ${chart}`, 'facts: ', 'lastReviewed: 2026-11-02'];
  return [...front, ...rest, 'nextReviewDue: 2027-11-02', 'reviewedBy: owner', '---', '', body].join('\n');
};
const englishOf = (body: string, chart = 'none') => {
  const parsed = parseModule('packages/content/learn/noise.mdx', englishSource(body, chart));
  if (!parsed.ok) throw new Error('the English fixture does not parse');
  return [parsed.value];
};
const translationFront = ['---', 'slug: noise', 'title: Ruído', 'idea: A maior parte das variações de preço é ruído.'];
const translationOf = (body: string) =>
  [...translationFront, 'caveat: Um plano pode perder dinheiro.', '---', '', body].join('\n');
const validated = async (englishBody: string, body: string, chart = 'none') => {
  const english = englishOf(englishBody, chart);
  const files = [{ language: 'pt-PT', path: at, source: translationOf(body) }];
  const problems = [
    ...moduleTranslationProblems(files, english),
    ...elementsOnly(await closedBodyProblems(files, { english, figures })),
  ];
  return problems.map(({ code, detail }) => `${code}: ${detail}`);
};
const banned = (match: string) =>
  `banned-advice: body: "${match}" is on the ban list; reword it (docs/CONTENT-STYLE.md §2)`;
// Brand, 25m round 1: the elements problem names its fix (docs/CONTENT-STYLE.md §1, rule 8).
const ORDER =
  "; write English's elements and ## headings in English's order, a flow element on a line of its own and a text element inside its sentence";

describe('closedBodyProblems: pnpm validate:content refuses what the build refuses (ADR-0048)', () => {
  it('reports a module holding an element outside the set, with its line', async () => {
    const path = 'packages/content/learn/noise.mdx';
    const problems = await closedBodyProblems([{ path, source: `${FRONT}Text.\n\n<Foo />\n` }], { figures });
    expect(problems).toEqual([
      { path, code: 'module-closed-body', detail: expect.stringMatching(/^line 7: <Foo> is not allowed/) },
    ]);
  });

  // The early check counts the words `<Chart />`; this gate counts the elements in the compiled tree.
  describe('one flow <Chart /> exactly when the front matter names a chart (docs/EDUCATION.md §10)', () => {
    const path = 'packages/content/learn/risk-honestly.mdx';
    const source = (chart: string, body: string) =>
      [
        '---',
        'slug: risk-honestly',
        'title: Risk, honestly',
        'idea: A plan can lose money.',
        'caveat: A calm plan can still lose money.',
        `chart: ${chart}`,
        'facts: ',
        'lastReviewed: 2026-10-16',
        'nextReviewDue: 2027-10-16',
        'reviewedBy: owner',
        '---',
        '',
        body,
      ].join('\n');
    const problemsOf = async (chart: string, body: string) =>
      elementsOnly(await closedBodyProblems([{ path, source: source(chart, body) }], { figures })).map(
        ({ code, detail }) => `${code}: ${detail}`,
      );
    const ONE =
      'module-chart-element: write <Chart /> once, on a line of its own, where the drawdowns-bar chart stands';

    it('passes <Chart /> on a line of its own on a module with a chart', async () => {
      expect(await problemsOf('drawdowns-bar', 'Text.\n\n<Chart />\n\nMore text.\n')).toEqual([]);
    });

    it('refuses <Chart /> at the end of a paragraph line, where its block would sit inside the <p>', async () => {
      expect(await problemsOf('drawdowns-bar', 'A sign. <Chart />\n')).toEqual([
        expect.stringMatching(/^module-closed-body: line 13: <Chart> stands on a line of its own/),
      ]);
    });

    // The page renders no children of an allowed element, so a nested <Chart /> would leave the module chartless.
    it('refuses a <Chart /> inside another element, with its line', async () => {
      const nested = 'Text.\n\n<PastPerformance>\n\n<Chart />\n\n</PastPerformance>\n';
      expect(await problemsOf('drawdowns-bar', nested)).toEqual([
        expect.stringMatching(/^module-closed-body: line 15: <PastPerformance> takes no content/),
      ]);
      expect(await problemsOf('drawdowns-bar', '<Chart>\n\n<Chart />\n\n</Chart>\n')).toEqual([
        expect.stringMatching(/^module-closed-body: line 13: <Chart> takes no content/),
      ]);
    });

    it('counts an escaped <Chart /> and one in a code span as no chart', async () => {
      expect(await problemsOf('drawdowns-bar', 'A \\<Chart /> sign.\n')).toEqual([ONE]);
      expect(await problemsOf('drawdowns-bar', 'A `<Chart />` sign.\n')).toEqual([ONE]);
      expect(await problemsOf('none', 'A `<Chart />` sign.\n')).toEqual([]);
    });

    it('refuses two charts, and a chart on a module with chart: none', async () => {
      expect(await problemsOf('drawdowns-bar', '<Chart />\n\nText.\n\n<Chart />\n')).toEqual([ONE]);
      expect(await problemsOf('none', 'Text.\n\n<Chart />\n')).toEqual([
        'module-chart-element: remove <Chart />: the front matter says chart: none',
      ]);
    });

    // A translation has no chart key (ADR-0048 Deviations); review 25l round 1 found a code-span chart passing.
    describe('a translation, held to the chart of the English module its file is named after', () => {
      const translated = 'packages/content/i18n/pt-PT/learn/risk-honestly.mdx';
      const englishOf = (chart: string) => {
        const parsed = parseModule(path, source(chart, 'Text.\n\n<Chart />\n'));
        if (!parsed.ok) throw new Error('the English fixture does not parse');
        return [parsed.value];
      };
      const translation = (body: string) =>
        ['---', 'slug: risk-honestly', 'title: Risco', 'idea: Um plano.', 'caveat: Um plano.', '---', '', body].join(
          '\n',
        );
      const translatedOf = async (chart: string, body: string, at = translated) =>
        elementsOnly(
          await closedBodyProblems([{ language: 'pt-PT', path: at, source: translation(body) }], {
            english: englishOf(chart),
            figures,
          }),
        ).map(({ path: where, code, detail }) => `${where}: ${code}: ${detail}`);

      it("passes <Chart /> on a line of its own, and refuses it in a code span or a fence with English's code", async () => {
        expect(await translatedOf('drawdowns-bar', 'Texto.\n\n<Chart />\n')).toEqual([]);
        const elements = `${translated}: module-overlay-elements: English flow:Chart; translation none${ORDER}`;
        expect(await translatedOf('drawdowns-bar', 'Um `<Chart />` sinal.\n')).toEqual([
          `${translated}: ${ONE}`,
          elements,
        ]);
        expect(await translatedOf('drawdowns-bar', '```\n<Chart />\n```\n')).toEqual([
          `${translated}: ${ONE}`,
          elements,
        ]);
      });

      it("refuses a <Chart /> where English's chart is none, and skips a file named after no English module", async () => {
        expect(await translatedOf('none', 'Texto.\n\n<Chart />\n')).toEqual([
          `${translated}: module-chart-element: remove <Chart />: the front matter says chart: none`,
        ]);
        const orphan = 'packages/content/i18n/pt-PT/learn/ruido.mdx';
        expect(await translatedOf('drawdowns-bar', 'Texto.\n', orphan)).toEqual([]);
      });
    });
  });

  // Review 25l round 2 (D11): the regex remover read code unlike the compiler, in both directions. Both checks run,
  // as scripts/validate.ts runs them, on literal translations against a literal English; each value is the compiler's.
  describe("a translation's elements, as the compiler reads them, against its English module's", () => {
    const PAST = 'Text.\n\n<PastPerformance />\n\nAn end.\n';

    it('reads a fence closed by ~~~` as still open, so the element after it is code', async () => {
      const english = 'Text.\n\n~~~\ncode\n~~~\n\n<PastPerformance />\n';
      expect(await validated(english, 'Texto.\n\n~~~\ncódigo\n~~~`\n\n<PastPerformance />\n')).toEqual([
        `module-overlay-elements: English flow:PastPerformance; translation none${ORDER}`,
      ]);
    });

    it('pairs no code span across a blank line, so the element between the backticks shows', async () => {
      expect(await validated(PAST, 'Um `sinal.\n\n<PastPerformance />\n\nUm` fim.\n')).toEqual([]);
    });

    it('closes a fence left open in a list item where the item ends', async () => {
      expect(await validated(PAST, '- Um item:\n\n  ```\n  código\n\n<PastPerformance />\n\nUm fim.\n')).toEqual([]);
    });

    it('reads a backtick fence with a backtick in its info string as text, not a fence', async () => {
      expect(await validated(PAST, '```js`\n\n<PastPerformance />\n\nUm fim.\n')).toEqual([]);
    });

    it("refuses a missing element, another order and an element in a sentence where English's is a block", async () => {
      const english = 'Text.\n\n<Chart />\n\n<PastPerformance />\n';
      const CHART =
        'module-chart-element: write <Chart /> once, on a line of its own, where the drawdowns-bar chart stands';
      expect(await validated(english, 'Texto.\n\n<PastPerformance />\n', 'drawdowns-bar')).toEqual([
        CHART,
        `module-overlay-elements: English flow:Chart, flow:PastPerformance; translation flow:PastPerformance${ORDER}`,
      ]);
      expect(await validated(english, '<PastPerformance />\n\nTexto.\n\n<Chart />\n', 'drawdowns-bar')).toEqual([
        `module-overlay-elements: English flow:Chart, flow:PastPerformance; translation flow:PastPerformance, flow:Chart${ORDER}`,
      ]);
      expect(await validated(PAST, 'Texto. <PastPerformance />\n\nUm fim.\n')).toEqual([
        `module-overlay-elements: English flow:PastPerformance; translation text:PastPerformance${ORDER}`,
      ]);
    });

    it('counts an element in a code span or a fenced block as none, and passes one after a fence left open', async () => {
      const english = 'Text.\n\n<Chart />\n\n<PastPerformance />\n';
      const CHART =
        'module-chart-element: write <Chart /> once, on a line of its own, where the drawdowns-bar chart stands';
      const missing = `module-overlay-elements: English flow:Chart, flow:PastPerformance; translation flow:PastPerformance${ORDER}`;
      for (const chart of ['`<Chart />`', '```\n<Chart />\n```', '~~~~mdx\n<Chart />\n~~~~']) {
        const body = `Texto.\n\n${chart}\n\n<PastPerformance />\n`;
        expect(await validated(english, body, 'drawdowns-bar')).toEqual([CHART, missing]);
      }
      const open = 'Texto.\n\n<Chart />\n\n<PastPerformance />\n\n```\n<Chart />\n';
      expect(await validated(english, open, 'drawdowns-bar')).toEqual([]);
    });

    it("gives each English module's elements alike from its file and from its body", async () => {
      const names = readdirSync(learn).filter((name) => name.endsWith('.mdx'));
      expect(names).toHaveLength(6);
      for (const name of names) {
        const path = `packages/content/learn/${name}`;
        const source = readFileSync(join(learn, name), 'utf8');
        const parsed = parseModule(path, source);
        if (!parsed.ok) throw new Error(`${name} does not parse`);
        const [file, body] = [await checkModuleBody(source, path), await checkModuleBody(parsed.value.body, path)];
        expect([name, body.problem, body.elements]).toEqual([name, null, file.elements]);
      }
    });

    it('passes the real pt-PT start-here against the real English module', async () => {
      const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
      const english = parseModule('packages/content/learn/start-here.mdx', source('learn/start-here.mdx'));
      if (!english.ok) throw new Error('the English start-here does not parse');
      const path = 'packages/content/i18n/pt-PT/learn/start-here.mdx';
      const files = [{ language: 'pt-PT', path, source: source('i18n/pt-PT/learn/start-here.mdx') }];
      expect(await closedBodyProblems(files, { english: [english.value], figures })).toEqual([]);
    });

    // Every language folder under i18n/ that holds a learn/ folder, read by folder, as scripts/validate.ts finds them.
    for (const language of LEARN_LANGUAGES)
      it(`passes every real ${language} module against the real English modules, by both checks`, async () => {
        const files = translatedModules(language);
        expect(files.length).toBeGreaterThan(0);
        const english = englishModules();
        const problems = [
          ...moduleTranslationProblems(files, english),
          ...(await closedBodyProblems(files, { english, figures })),
        ];
        expect(problems).toEqual([]);
      });

    // D12 of #322: a pt-PT module joins a numeral to its sign or unit word with U+00A0, as English joins its figure,
    // so a line never breaks inside a figure; an ordinary space or a source line break would render as a breakable one.
    // D3 of #328: a currency code joins its figure the same way, after it or before it (`100 USD`, CONTENT-STYLE §4).
    it('joins every numeral of a real pt-PT module to its sign, unit word or currency code with a no-break space', () => {
      const translated = fileURLToPath(new URL('../i18n/pt-PT/learn/', import.meta.url));
      const units = 'dias?|semanas?|mês|meses|anos?|horas?|minutos?|pontos|episódios|EUR|GBP|USD';
      const gap = '[ \\t\\r\\n]+';
      const before = `(?<![\\p{L}\\d])(?:EUR|GBP|USD)${gap}\\d`;
      const broken = new RegExp(`\\d${gap}(?:%|×|(?:${units})(?![\\p{L}\\d]))|${before}`, 'gu');
      const names = readdirSync(translated).filter((name) => name.endsWith('.mdx'));
      expect(names.length).toBeGreaterThan(0);
      const found = names.flatMap((name) =>
        [...readFileSync(join(translated, name), 'utf8').matchAll(broken)].map((match) => `${name}: ${match[0]}`),
      );
      expect(found).toEqual([]);
    });

    // docs/CONTENT-STYLE.md §10: a German module joins a numeral to its sign, unit word or currency code with U+00A0,
    // as pt-PT does, so a line never breaks inside a figure.
    it('joins every numeral of a real German module to its sign, unit word or currency code with a no-break space', () => {
      const units =
        'Tage?n?|Tages|Wochen?|Monate?n?|Monats|Jahre?n?|Jahres|Stunden?|Minuten?|Punkte?n?|Episoden|Mrd\\.|Mio\\.|EUR|GBP|USD';
      const gap = '[ \\t\\r\\n]+';
      const before = `(?<![\\p{L}\\d])(?:EUR|GBP|USD)${gap}\\d`;
      const broken = new RegExp(`\\d${gap}(?:%|×|(?:${units})(?![\\p{L}\\d]))|${before}`, 'gu');
      const files = translatedModules('de');
      expect(files.length).toBeGreaterThan(0);
      const found = files.flatMap(({ path, source }) =>
        [...source.matchAll(broken)].map((match) => `${path}: ${match[0]}`),
      );
      expect(found).toEqual([]);
    });
  });

  // Review 25m round 1: the ban list read `imperd&iacute;vel` in the source, where the page shows imperdível. A
  // translation's ban list, number check and hyphen check read the text the compiled page shows.
  describe("a translation's ban list, numbers and hyphens, on the text the compiled page shows", () => {
    const TEXT = 'Text.\n';

    it('decodes a named character reference, so a banned phrase written with one is refused', async () => {
      expect(await validated(TEXT, 'Uma ocasião imperd&iacute;vel.\n')).toEqual([banned('imperdível')]);
    });

    it('decodes a named character reference at the start of a banned phrase', async () => {
      expect(await validated(TEXT, 'Uma compra de &uacute;ltima hora.\n')).toEqual([banned('última hora')]);
    });

    it('decodes a numeric character reference in a banned word', async () => {
      expect(await validated(TEXT, 'Uma ocasião imperd&#237;vel.\n')).toEqual([banned('imperdível')]);
    });

    it('reads a digit written as a numeric character reference as the digit', async () => {
      expect(await validated(TEXT, 'Um passo de &#49;.\n')).toEqual(['overlay-number-mismatch: body: 1, English none']);
      expect(await validated('A step of 1.\n', 'Um passo de &#49;.\n')).toEqual([]);
    });

    it('reads a code span and a fenced block as the page shows them, a tag inside included', async () => {
      expect(await validated(TEXT, 'Uma ocasião `imperdível`.\n')).toEqual([banned('imperdível')]);
      expect(await validated(TEXT, 'Um código `<imperdível>`.\n')).toEqual([banned('imperdível')]);
      expect(await validated(TEXT, 'Texto.\n\n```\nimperdível\n```\n')).toEqual([banned('imperdível')]);
    });

    // The block read takes no info string; English's module reads on the source keep it (plainText), as on English.
    it("refuses a banned word in a fence's info string once, as English's module reads do", async () => {
      expect(await validated(TEXT, 'Texto.\n\n```imperdível\ncódigo\n```\n')).toEqual([banned('imperdível')]);
    });

    it('joins a word split by emphasis, as the page shows it', async () => {
      expect(await validated(TEXT, 'Uma ocasião imperd*í*vel.\n')).toEqual([banned('imperdível')]);
    });

    it("reads each side's figures in its own separators, and refuses a pt-PT 31.4 % against English's", async () => {
      const english = 'A fall of 31.4 % in a month.\n';
      expect(await validated(english, 'Uma queda de 31,4 % num mês.\n')).toEqual([]);
      expect(await validated(english, 'Uma queda de 31.4 % num mês.\n')).toEqual([
        'overlay-number-mismatch: body: 31 4, English 31.4',
      ]);
    });

    it('refuses a pt-PT banned row in the body', async () => {
      expect(await validated(TEXT, 'Recomendamos manter o plano.\n')).toEqual([banned('Recomendamos')]);
    });

    it('refuses an ordinary hyphen between a number and its unit, where English writes U+2011', async () => {
      const english = 'A 12‑month plan.\n';
      expect(await validated(english, 'Um plano de 12‑month.\n')).toEqual([]);
      expect((await validated(english, 'Um plano de 12-month.\n')).map((line) => line.split(':')[0])).toEqual([
        'number-unit-hyphen',
      ]);
    });

    // Brand, 25h round 2: the two pt-PT sentences of start-here hold no number and no banned row.
    it('passes the pt-PT start-here sentences against English', async () => {
      const plan = 'Com ela, define o plano uma vez e regista cada compra, estejam as moedas onde estiverem.';
      const where = 'Mostra-lhe em que ponto do plano está.';
      const english =
        'You set a plan once and record each purchase, wherever the coins are. It shows where you are in the plan.\n';
      expect(await validated(english, `${plan} ${where}\n`)).toEqual([]);
    });
  });

  // D4's carry-over (#421, 2026-11-24): English's three module reads also run on a translation's source body, beside
  // the block read, so a line the page starts inside a block and a phrase across a source wrap are refused alike.
  describe("a translation's ban list, by English's module reads on its source as well", () => {
    const TEXT = 'Text.\n';
    const imperative = (match: string) =>
      `banned-imperative: body: "${match}" is on the ban list; reword it (docs/CONTENT-STYLE.md §2)`;
    const refusals = (problems: readonly Problem[]) => problems.filter(({ code }) => code.startsWith('banned-'));
    const asEnglish = (body: string) =>
      refusals(
        moduleProblems(
          { path: 'packages/content/learn/noise.mdx', source: englishSource(body) },
          { facts: new Map(), today: '2026-11-24' },
        ),
      );
    const asTranslation = async (body: string) => {
      const files = [{ language: 'pt-PT', path: at, source: translationOf(body) }];
      return refusals(await closedBodyProblems(files, { english: englishOf(body), figures }));
    };

    it('refuses a capital German form after a hard break, which the block read joins with a space', async () => {
      expect(await validated(TEXT, 'Der Plan bleibt gleich\\\nHalte Bitcoin bis zum Ende\n')).toEqual([
        imperative('Der Plan bleibt gleich — Halte Bitcoin bis zum Ende'),
      ]);
    });

    it("refuses as a translation's body every D4 row English's module reads refuse, 106 of 148", async () => {
      const refused: string[] = [];
      const missed: string[] = [];
      for (const [ids, body] of D4_ROWS) {
        if (asEnglish(`${body}\n`).length === 0) continue;
        refused.push(ids);
        if ((await asTranslation(`${body}\n`)).length === 0) missed.push(ids);
      }
      expect(missed).toEqual([]);
      expect(refused).toHaveLength(106);
    }, 60_000);

    // D4 §7 item 2 named the English imperative whose asset follows a wrap: b:R7 in a module, a:O1 in an overlay.
    it("passes b:R7 in English, the gap carried over, and refuses a:O1 now in a translation's body too", async () => {
      const row = (ids: string) => `${D4_ROWS.find(([id]) => id === ids)?.[1]}\n`;
      expect(asEnglish(row('b:R7'))).toEqual([]);
      const shown = (problems: readonly Problem[]) => problems.map(({ code, detail }) => `${code}: ${detail}`);
      expect(shown(await asTranslation(row('b:R7')))).toEqual([imperative('Buy every month some Bitcoin')]);
      expect(asEnglish(row('a:O1 b:R1')).map(({ code }) => code)).toEqual(['banned-imperative']);
      expect((await asTranslation(row('a:O1 b:R1'))).map(({ code }) => code)).toEqual(['banned-imperative']);
    });

    it('gives one finding for a line both the block read and the module reads refuse', async () => {
      expect(await validated(TEXT, 'Recomendamos manter o plano.\n')).toEqual([banned('Recomendamos')]);
      expect(await validated(TEXT, 'Ein Rückgang ist kein Grund zur Eile.\nKauf jeden Monat BTC.\n')).toEqual([
        imperative('Ein Rückgang ist kein Grund zur Eile. Kauf jeden Monat BTC.'),
      ]);
      expect(await validated(TEXT, '- Ein ruhiger Plan\n- Kauf jeden Monat BTC\n')).toEqual([
        imperative('Kauf jeden Monat BTC'),
      ]);
    });

    // Review round 1 of this branch: the block read quotes the whole block, the module reads the line, so the two
    // quotes of one refused line differ.
    it('gives one finding for a line both reads refuse when each read quotes another span of it', async () => {
      expect(await validated(TEXT, 'Há quem diga:\nCompre Bitcoin todos os meses.\n')).toHaveLength(1);
    });

    it('keeps a second refusal of one phrase on another line, by each read', async () => {
      expect(await validated(TEXT, 'Recomendamos manter o plano.\n\nRecomendamos esperar.\n')).toEqual([
        banned('Recomendamos'),
        banned('Recomendamos'),
      ]);
      const twice = 'Há quem diga:\nCompre Bitcoin todos os meses.\n\nCompre Bitcoin todos os meses.\n';
      expect(await validated(TEXT, twice)).toHaveLength(asEnglish(twice).length);
    });

    // On the branch before the fix, 10 rows gave English 1 and a translation 2 (a:L12, a:G8, a:G12 b:S1, a:O2 b:R2,
    // a:O4, b:P8, b:P9, b:S2, j:S4, j:S9); b:E4 refuses two lines in both.
    it("reports each refused line of a D4 row once per code, as many per code as English's module reads", async () => {
      const codes = (problems: readonly Problem[]) => problems.map(({ code }) => code).sort();
      const counted: string[] = [];
      for (const [ids, body] of D4_ROWS) {
        const english = codes(asEnglish(`${body}\n`));
        const mine = codes(await asTranslation(`${body}\n`));
        if (english.length > 0 && mine.join() !== english.join()) counted.push(`${ids}: ${english} / ${mine}`);
      }
      expect(counted).toEqual([]);
      const twoLines = `${D4_ROWS.find(([id]) => id === 'b:E4')?.[1]}\n`;
      expect(await asTranslation(twoLines)).toHaveLength(2);
    }, 60_000);

    // A greedy pairing took the first block finding a source finding matched. A source finding that matched only a
    // block finding already taken stayed unpaired and was reported twice.
    describe('pairs the two reads by a maximum matching, whatever the order of the blocks', () => {
      const codes = (problems: readonly Problem[]) => problems.map(({ code }) => code).sort();
      const sameCodes = async (body: string) => {
        const english = codes(asEnglish(body));
        expect(codes(await asTranslation(body))).toEqual(english);
        return english;
      };
      const blocksOf = (body: string) => body.split(/\n[ \t]*\n/);
      // Every order of up to 5 blocks (120 at most); a body of more than 5 blocks takes its rotations and its
      // reversal, which keep the run short.
      const ordersOf = (items: readonly string[]): string[][] => {
        if (items.length > 5) {
          const rotations = items.map((_, start) => [...items.slice(start), ...items.slice(0, start)]);
          return [...rotations, [...items].reverse()];
        }
        if (items.length <= 1) return [[...items]];
        return items.flatMap((item, index) =>
          ordersOf([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]),
        );
      };

      it("gives English's count per code for a line refused alone and inside another block, in both orders", async () => {
        const wrapped = 'Compre\nsempre Bitcoin todos os meses.';
        const quoted = 'Há quem diga:\nCompre Bitcoin.';
        expect(await sameCodes(`${wrapped}\n\n${quoted}\n`)).toHaveLength(2);
        expect(await sameCodes(`${quoted}\n\n${wrapped}\n`)).toHaveLength(2);
      });

      it("gives English's count per code for every D4 row of two or more blocks, in every order", async () => {
        const rows: string[] = [];
        const counted: string[] = [];
        for (const [ids, body] of D4_ROWS) {
          const blocks = blocksOf(body);
          if (blocks.length < 2) continue;
          rows.push(ids);
          for (const order of ordersOf(blocks)) {
            const reordered = `${order.join('\n\n')}\n`;
            const english = codes(asEnglish(reordered));
            const mine = codes(await asTranslation(reordered));
            if (mine.join() !== english.join()) counted.push(`${ids} ${JSON.stringify(order)}: ${english} / ${mine}`);
          }
        }
        expect(counted).toEqual([]);
        expect(rows.length).toBeGreaterThan(0);
      }, 30_000);
    });
  });

  // Review 25m round 2 (D12; #322's D3 and D4): the checks read each compiled block on its own, with every
  // default-ignorable code point removed, so no phrase or figure is read across a block or hidden inside a word.
  describe("a translation's checks, per compiled block, on the characters the page shows", () => {
    const TEXT = 'Text.\n';
    const IMPERDIVEL = banned('imperdível');

    // One case per literal, so a mutation names each character it lets through.
    const HIDDEN: readonly [string, string][] = [
      ['&shy;', 'imper&shy;dível'],
      ['&#8203;', 'imper&#8203;dível'],
      ...['00AD', '200B', '200C', '200D', '2060', 'FEFF', '034F', '2061'].map((hex): [string, string] => [
        `U+${hex}`,
        `imper${String.fromCodePoint(Number.parseInt(hex, 16))}dível`,
      ]),
    ];
    it.each(HIDDEN)('refuses a banned word with %s inside it', async (_name, word) => {
      expect(await validated(TEXT, `Uma ocasião ${word}.\n`)).toEqual([IMPERDIVEL]);
    });

    it('reads a heading and the paragraph after it apart, as 3 and 100, never 3100', async () => {
      const english = '## Step 3\n\n100 euros a month.\n';
      expect(await validated(english, '## 3.º passo\n\n100 euros por mês.\n')).toEqual([]);
      expect(await validated(english, '## 3.º passo\n\n101 euros por mês.\n')).toEqual([
        'overlay-number-mismatch: body: 101 3, English 100 3',
      ]);
    });

    it('reads a figure at the end of one paragraph apart from one at the start of the next, as 1 and 250', async () => {
      expect(await validated('Buy 1\n\n250 euros.\n', 'Compre 1\n\n250 euros.\n')).toEqual([]);
      expect(await validated('Buy 1\n\n250 euros.\n', 'Compre 1\n\n251 euros.\n')).toEqual([
        'overlay-number-mismatch: body: 1 251, English 1 250',
      ]);
    });

    it('reads a figure at the end of one list item apart from one at the start of the next, as 1 and 250', async () => {
      expect(await validated('- Step 1\n- 250 euros\n', '- Passo 1\n- 250 euros\n')).toEqual([]);
      expect(await validated('- Step 1\n- 250 euros\n', '- Passo 1\n- 251 euros\n')).toEqual([
        'overlay-number-mismatch: body: 1 251, English 1 250',
      ]);
    });

    // Review of #361 round 1: `1975. Text.` shows 1975 as the item's number, which no block's text holds.
    it("reads an ordered item's shown number as one of the page's numbers, in English and in the translation", async () => {
      const english = '1. A plan.\n2. A day.\n';
      expect(await validated(english, '1. Um plano.\n2. Um dia.\n')).toEqual([]);
      expect(await validated(english, '1975. Um plano.\n1976. Um dia.\n')).toEqual([
        'overlay-number-mismatch: body: 1975 1976, English 1 2',
      ]);
      expect(await validated('3. A plan.\n', '1. Um plano.\n')).toEqual([
        'overlay-number-mismatch: body: 1, English 3',
      ]);
      expect(await validated('A plan.\n', '1975.\n\nUm plano.\n')).toEqual([
        'overlay-number-mismatch: body: 1975, English none',
      ]);
    });

    it('reads no banned phrase across a heading and a paragraph, and one inside a paragraph', async () => {
      expect(await validated(TEXT, '# Última\n\nhora de comprar.\n')).toEqual([]);
      expect(await validated(TEXT, 'Última hora de comprar.\n')).toEqual([banned('Última hora')]);
    });

    it('joins emphasis, strong and a code span inside a word, and a hard break with a space', async () => {
      for (const word of ['imperd*í*vel', 'imperd**í**vel', 'imper`dí`vel']) {
        expect([word, await validated(TEXT, `Uma ocasião ${word}.\n`)]).toEqual([word, [IMPERDIVEL]]);
      }
      expect(await validated(TEXT, 'Última\\\nhora de comprar.\n')).toEqual([banned('Última hora')]);
    });

    // Brand, 25m round 2: a module holds no link (closedBody refuses one), so none is read.
    it('refuses a link around a banned word as a link, never passing it', async () => {
      expect(await validated(TEXT, 'Uma ocasião [imperd*í*vel](x).\n')).toEqual([
        expect.stringMatching(/^module-closed-body: line 8: a link is not allowed/),
      ]);
    });

    it("holds the translation's depth-2 headings to English's, in order among the elements", async () => {
      const english = '## One\n\nText.\n\n## Two\n\nMore.\n';
      expect(await validated(english, '## Um\n\nTexto.\n\n## Dois\n\nMais.\n')).toEqual([]);
      expect(await validated(english, '## Um\n\nTexto.\n\nMais.\n')).toEqual([
        `module-overlay-elements: English heading:2, heading:2; translation heading:2${ORDER}`,
      ]);
      const past = '## One\n\n<PastPerformance />\n\n## Two\n\nText.\n';
      expect(await validated(past, '## Um\n\n## Dois\n\n<PastPerformance />\n\nTexto.\n')).toEqual([
        `module-overlay-elements: English heading:2, flow:PastPerformance, heading:2; translation heading:2, heading:2, flow:PastPerformance${ORDER}`,
      ]);
    });
  });

  it('reports one problem per refused module', async () => {
    const modules = [
      { path: 'packages/content/learn/a.mdx', source: `${FRONT}Text with {1} in it.\n` },
      { path: 'packages/content/learn/b.mdx', source: `${FRONT}A line. <PastPerformance />\n` },
      { path: 'packages/content/learn/c.mdx', source: `${FRONT}A [link](/plan).\n` },
    ];
    const problems = await closedBodyProblems(modules, { figures });
    expect(problems.map(({ path, code }) => `${path}: ${code}`)).toEqual([
      'packages/content/learn/a.mdx: module-closed-body',
      'packages/content/learn/c.mdx: module-closed-body',
    ]);
  });

  it("passes main's modules", async () => {
    const names = readdirSync(learn).filter((name) => name.endsWith('.mdx'));
    expect(names.length).toBeGreaterThan(0);
    const modules = names.map((name) => ({
      path: `packages/content/learn/${name}`,
      source: readFileSync(join(learn, name), 'utf8'),
    }));
    expect(await closedBodyProblems(modules, { figures })).toEqual([]);
  });

  // docs/CONTENT-STYLE.md §4: a count and its listed noun, on the path scripts/validate.ts runs, in every module, with
  // a chart or none, and in the front matter the sheet shows; src/module-counts.test.ts holds the rule.
  describe('a count joined to its listed noun by one U+00A0', () => {
    const NBSP = String.fromCodePoint(0xa0);
    const live = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
    const english = parseModule('packages/content/learn/noise.mdx', live('learn/noise.mdx'));

    it("refuses English noise's 6 inputs written with a space, and passes the live module", async () => {
      const path = 'packages/content/learn/noise.mdx';
      const source = live('learn/noise.mdx');
      const seeded = source.replace(`6${NBSP}inputs`, '6 inputs');
      expect(seeded).not.toBe(source);
      const codes = async (text: string) =>
        (await closedBodyProblems([{ path, source: text }], { figures })).map(({ code }) => code);
      expect([await codes(source), await codes(seeded)]).toEqual([[], ['figure-join']]);
    });

    it("refuses pt-PT noise's 6 componentes across a source line break, and passes the live translation", async () => {
      if (!english.ok) throw new Error('the English noise does not parse');
      const source = live('i18n/pt-PT/learn/noise.mdx');
      const seeded = source.replace(`6${NBSP}componentes`, '6\ncomponentes');
      expect(seeded).not.toBe(source);
      const codes = async (text: string) =>
        (
          await closedBodyProblems([{ language: 'pt-PT', path: at, source: text }], {
            english: [english.value],
            figures,
          })
        ).map(({ code }) => code);
      expect([await codes(source), await codes(seeded)]).toEqual([[], ['figure-join']]);
    });

    it('reads the front matter and the body of a module whose front matter names no chart', async () => {
      const path = 'packages/content/learn/noise.mdx';
      const source = `${FRONT.replace('title: Noise', 'title: 2 indexes')}It mixes 6 inputs.\n\n- 5 components\n`;
      const problems = await closedBodyProblems([{ path, source }], { figures });
      expect(problems.map(({ detail }) => detail.split(' and ')[0])).toEqual([
        'title: the count "2"',
        'body: the count "6"',
        'body: the count "5"',
      ]);
    });

    // #387: the body is read as the parser decoded it, as the front matter is read as written, so a hidden break
    // beside the noun is refused in either, and the fix (one U+00A0 over the whole gap) removes a soft hyphen too.
    it('refuses a hidden character in the gap of a paragraph, a heading and the idea alike', async () => {
      const path = 'packages/content/learn/noise.mdx';
      const zwsp = String.fromCodePoint(0x200b);
      const shy = String.fromCodePoint(0xad);
      const details = async (source: string) =>
        (await closedBodyProblems([{ path, source }], { figures })).map(({ code, detail }) => `${code} ${detail}`);
      const joined = (field: string, gap: string) =>
        `figure-join ${field}: the count "6" and its noun "inputs" are joined by ${gap}, not U+00A0; replace the gap ` +
        'with one U+00A0; R7 (docs/CONTENT-STYLE.md §4)';
      expect(await details(`${FRONT}It mixes 6${NBSP}${zwsp}inputs.\n`)).toEqual([joined('body', 'U+00A0 U+200B')]);
      expect(await details(`${FRONT}It mixes 6${shy} inputs.\n`)).toEqual([joined('body', 'U+00AD U+0020')]);
      const idea = FRONT.replace('title: Noise', `title: Noise\nidea: It mixes 6${NBSP}${zwsp}inputs.`);
      expect(await details(`${idea}It mixes 6${NBSP}${zwsp}inputs.\n`)).toEqual([
        joined('idea', 'U+00A0 U+200B'),
        joined('body', 'U+00A0 U+200B'),
      ]);
      expect(await details(`${FRONT}## 6${zwsp}inputs\n`)).toEqual([joined('body', 'U+200B')]);
    });

    // #387: the pair is found as the reader reads it, so a hidden character inside the noun never hides the gap.
    it('refuses a plain space before a noun a hidden character splits, in a paragraph and the idea alike', async () => {
      const path = 'packages/content/learn/noise.mdx';
      const shy = String.fromCodePoint(0xad);
      const details = async (source: string) =>
        (await closedBodyProblems([{ path, source }], { figures })).map(({ code, detail }) => `${code} ${detail}`);
      const joined = (field: string) =>
        `figure-join ${field}: the count "6" and its noun "inU+00AD puts" are joined by U+0020, not U+00A0; replace ` +
        'the gap with one U+00A0; R7 (docs/CONTENT-STYLE.md §4)';
      expect(await details(`${FRONT}It mixes 6 in${shy}puts.\n`)).toEqual([joined('body')]);
      const idea = FRONT.replace('title: Noise', `title: Noise\nidea: It mixes 6 in${shy}puts.`);
      expect(await details(`${idea}It mixes 6${NBSP}inputs.\n`)).toEqual([joined('idea')]);
      expect(await details(`${FRONT}It mixes 6${NBSP}in${shy}puts.\n`)).toEqual([]);
    });

    // #387: a hidden character between a word and the count, or the noun and a word, separates them as written.
    it('refuses a plain space when a hidden character parts the count or the noun from a word', async () => {
      const path = 'packages/content/learn/noise.mdx';
      const zwsp = String.fromCodePoint(0x200b);
      const details = async (source: string) =>
        (await closedBodyProblems([{ path, source }], { figures })).map(({ code, detail }) => `${code} ${detail}`);
      const joined = (field: string) =>
        `figure-join ${field}: the count "6" and its noun "inputs" are joined by U+0020, not U+00A0; replace the gap ` +
        'with one U+00A0; R7 (docs/CONTENT-STYLE.md §4)';
      for (const text of [`It mixes${zwsp}6 inputs.`, `It mixes 6 inputs${zwsp}x.`]) {
        const idea = FRONT.replace('title: Noise', `title: Noise\nidea: ${text}`);
        expect(await details(`${idea}${text}\n`)).toEqual([joined('idea'), joined('body')]);
      }
      const idea = FRONT.replace('title: Noise', 'title: Noise\nidea: It mixes6 inputs.');
      expect(await details(`${idea}It mixes 6 inputsx.\n`)).toEqual([]);
    });

    // #388: a default-ignorable code point is never a letter, mark or digit beside the pair, whatever its category,
    // so a block that lost one keeps every refusal main gives, and a character reference counts as its character.
    const cp = (...points: number[]) => String.fromCodePoint(...points);
    const pairDetails = async (body: string) =>
      (
        await closedBodyProblems([{ path: 'packages/content/learn/noise.mdx', source: `${FRONT}${body}\n` }], {
          figures,
        })
      ).map(({ code, detail }) => `${code} ${detail}`);
    const joinedBy = (gap: string, count = '6', noun = 'inputs') =>
      `figure-join body: the count "${count}" and its noun "${noun}" are joined by ${gap}, not U+00A0; replace the ` +
      'gap with one U+00A0; R7 (docs/CONTENT-STYLE.md §4)';

    it("refuses round 2's repro as main does", async () => {
      expect(await pairDetails(`It mixes ${cp(0xfe0f)}6 inputs.`)).toEqual([joinedBy('U+0020')]);
    });

    it("reads a heading's and a list item's edges as written", async () => {
      expect(await pairDetails(`## 6 inputs${cp(0x3164)}`)).toEqual([joinedBy('U+0020')]);
      expect(await pairDetails(`3. 6 inputs${cp(0xfe0f)}`)).toEqual([joinedBy('U+0020')]);
      expect(await pairDetails(`## ${cp(0x34f)}6${NBSP}inputs`)).toEqual([]);
      expect(await pairDetails(`## 6${NBSP}${cp(0x2060)}cycles`)).toEqual([joinedBy('U+00A0 U+2060', '6', 'cycles')]);
    });

    it('reads a character reference as the character it stands for', async () => {
      expect(await pairDetails('It has 6&nbsp;&#x200B;inputs.')).toEqual([joinedBy('U+00A0 U+200B')]);
      expect(await pairDetails('It has 1&#x34F;2&nbsp;inputs.')).toEqual([
        'figure-join body: the count "1U+034F 2" before its noun "inputs" holds U+034F; delete it; R7 ' +
          '(docs/CONTENT-STYLE.md §4)',
      ]);
      // A reference that decodes to U+00A0 passes, though §4 asks for the character itself (a later rule, #388).
      expect(await pairDetails('It has 6&nbsp;inputs.')).toEqual([]);
    });

    it('refuses a hidden character after U+00A0 in the live noise modules, English and pt-PT', async () => {
      if (!english.ok) throw new Error('the English noise does not parse');
      const path = 'packages/content/learn/noise.mdx';
      const source = live('learn/noise.mdx');
      const seeded = source.replace(`6${NBSP}inputs`, `6${NBSP}${cp(0x200b)}inputs`);
      expect(seeded).not.toBe(source);
      const codes = async (text: string) =>
        (await closedBodyProblems([{ path, source: text }], { figures })).map(({ code }) => code);
      expect(await codes(seeded)).toEqual(['figure-join']);
      const translated = live('i18n/pt-PT/learn/noise.mdx');
      const twin = translated.replace(`6${NBSP}componentes`, `6${NBSP}${cp(0xfe0f)}componentes`);
      expect(twin).not.toBe(translated);
      const problems = await closedBodyProblems([{ language: 'pt-PT', path: at, source: twin }], {
        english: [english.value],
        figures,
      });
      expect(problems.map(({ code }) => code)).toEqual(['figure-join']);
    });

    it('refuses a German count joined to its noun by an ordinary space (figure-join)', async () => {
      if (!english.ok) throw new Error('the English noise does not parse');
      const path = 'packages/content/i18n/de/learn/noise.mdx';
      const source = live('i18n/de/learn/noise.mdx');
      const seeded = source.replace(`6${NBSP}Komponenten`, '6 Komponenten');
      expect(seeded).not.toBe(source);
      const codes = async (text: string) =>
        (await closedBodyProblems([{ language: 'de', path, source: text }], { english: [english.value], figures })).map(
          ({ code }) => code,
        );
      expect([await codes(source), await codes(seeded)]).toEqual([[], ['figure-join']]);
    });

    // A translation reads as many counts as its English module: with every U+00A0 an ordinary space, each count the
    // English list reads is refused once, so a German count its own list does not read shows as a gap. German only:
    // pt-PT's when-the-market-drops reads 1 count to English's 3, its list naming neither episódios nor meses.
    const r7 = (problems: readonly Problem[]) =>
      problems.filter(({ code, detail }) => code === 'figure-join' && detail.endsWith('R7 (docs/CONTENT-STYLE.md §4)'))
        .length;
    for (const language of ['de'])
      for (const { name, path, source } of translatedModules(language))
        it(`reads as many counts in ${language}'s ${name} as in its English module`, async () => {
          const theirs = live(`learn/${name}`);
          const at = `packages/content/learn/${name}`;
          const parsed = parseModule(at, theirs);
          if (!parsed.ok) throw new Error(`the English ${name} does not parse`);
          const spaced = (text: string) => text.replaceAll(NBSP, ' ');
          const ours = await closedBodyProblems([{ language, path, source: spaced(source) }], {
            english: [parsed.value],
            figures,
          });
          const english = await closedBodyProblems([{ path: at, source: spaced(theirs) }], { figures });
          expect([name, r7(ours)]).toEqual([name, r7(english)]);
        });
  });

  // The figure rules on the path scripts/validate.ts runs: its context from the live files, on a compiled module;
  // scripts/validate.test.ts runs the script itself.
  it('reads a module and its translation against the chart as scripts/validate.ts passes them', async () => {
    expect([figures.rows === null, figures.coins === null]).toEqual([false, false]);
    const path = 'packages/content/learn/risk-honestly.mdx';
    const live = readFileSync(join(learn, 'risk-honestly.mdx'), 'utf8');
    const source = live.replace('<Chart />\n', '<Chart />\n\nSolana could fall 50 % again.\n');
    expect(source).not.toBe(live);
    const codes = async (text: string) =>
      (await closedBodyProblems([{ path, source: text }], { figures })).map(({ code }) => code);
    expect([await codes(live), await codes(source)]).toEqual([[], ['figure-chart']]);
    // A translation is held to its English module's chart in its own language's shapes and list, so English's intro,
    // B and E fail in pt-PT.
    const parsed = parseModule(path, live);
    if (!parsed.ok) throw new Error(path);
    const translated = live.replace(
      /^chart: .*\n|^facts:.*\n(?: {2}- .*\n)*|^lastReviewed: .*\n|^nextReviewDue: .*\n|^reviewedBy: .*\n/gmu,
      '',
    );
    const at = 'packages/content/i18n/pt-PT/learn/risk-honestly.mdx';
    const file = { language: 'pt-PT', path: at, source: translated };
    const problems = await closedBodyProblems([file], { english: [parsed.value], figures });
    const figureProblems = problems.filter(({ code }) => code.startsWith('figure-'));
    expect(figureProblems.map(({ code }) => code)).toEqual([
      ...Array<string>(5).fill('figure-chart'),
      ...Array<string>(4).fill('figure-unstated'),
    ]);
    expect(figureProblems[0]?.detail).toMatch(
      /^body: "A monthly plan sets when you buy\." is not a sentence pt-PT's list holds and matches neither shape /u,
    );
    expect(figureProblems[3]?.detail).toMatch(
      /"In the chart, .* matches neither shape of a chart's section; write it as B or E \(docs\/CONTENT-STYLE\.md §9\); R5 /u,
    );
  });
});

// D4's 148 decided rows (#421's verdict, 2026-11-24): designer a's and b's cases, the English collisions and the
// structure rows, by their ids, each body as the case table holds it. The judge's verdicts are D4's; these tests
// hold a translation's ban list to what English's module reads refuse.
const D4_ROWS: readonly (readonly [string, string])[] = [
  ['a:P1 b:P2', 'Ein Rückgang allein ist kein Grund für einen\nKauf von Bitcoin.'],
  ['a:P2', 'Nach dem Rückgang war der\nTausch von ETH in BTC teurer.'],
  ['a:P3 b:P3', 'Ein Rückgang ist kein Grund zur Eile.\nKauf jeden Monat BTC.'],
  ['a:P4 b:P4', 'Ein Rückgang ist kein Grund zur Eile.\nKaufen Sie trotzdem Bitcoin.'],
  ['a:P5 b:P5', 'Nach einem Rückgang legen Sie Ihr Geld\nin Bitcoin an.'],
  ['a:P6', 'Nach dem Kauf legen Sie den Plan an\neinem ruhigen Tag für BTC fest.'],
  ['a:P7', 'Ein ruhiger Plan\nKauf jeden Monat BTC'],
  ['a:P8', 'Ein ruhiger Plan, der jeden Monat\nBitcoin kauft.'],
  ['a:H1 b:H1', 'Ein ruhiger Plan\\\nKauf jeden Monat BTC'],
  ['a:H2 b:H2', 'Ein ruhiger Plan  \nKauf jeden Monat BTC'],
  ['a:H3', 'Ein Rückgang ist kein Grund für einen\\\nKauf von Bitcoin.'],
  ['a:H4', 'Kaufen Sie jeden Monat\\\nBitcoin.'],
  ['a:H5', 'Legen Sie Ihr Geld in Bitcoin an\\\nein ruhiger Plan'],
  ['a:L1 b:L1', '- Ein ruhiger Plan\n- Kauft BTC jeden Monat'],
  ['a:L2', '* Ein ruhiger Plan\n* Kauf jeden Monat BTC'],
  ['a:L3', '+ Ein ruhiger Plan\n+ Kauf jeden Monat BTC'],
  ['a:L4', '1. Ein ruhiger Plan\n2. Kauf jeden Monat BTC'],
  ['a:L5', '1) Ein ruhiger Plan\n2) Kauf jeden Monat BTC'],
  ['a:L6', '- Ein ruhiger Plan\n  - Kauf jeden Monat BTC'],
  ['a:L7', '- Ein Rückgang ist kein Grund für einen\n  Kauf von Bitcoin.'],
  ['a:L8', '- Ein Rückgang ist kein Grund für einen\nKauf von Bitcoin.'],
  ['a:L9', '- Ein ruhiger Plan\n\n- Kauf jeden Monat BTC'],
  ['a:L10', '- Legen Sie Ihr Geld in Bitcoin an\n- Ein ruhiger Plan'],
  ['a:L11', 'Ein ruhiger Plan\n- Kauf jeden Monat BTC'],
  ['a:L12', 'Der Kurs fiel im Jahr\n2018. Kauf von BTC war danach billiger.'],
  ['a:L13', '- Prices fall\n- Halt: Bitcoin prices fall too.'],
  ['a:G1 b:T1', '# Ein ruhiger Plan\nKauf jeden Monat BTC'],
  ['a:G2 b:T2', '## Ein ruhiger Plan\nKauf jeden Monat BTC'],
  ['a:G3 b:T3', '### Ein ruhiger Plan\nKauf jeden Monat BTC'],
  ['a:G4 b:T4', '#### Ein ruhiger Plan\nKauf jeden Monat BTC'],
  ['a:G5 b:T5', '##### Ein ruhiger Plan\nKauf jeden Monat BTC'],
  ['a:G6 b:T6', '###### Ein ruhiger Plan\nKauf jeden Monat BTC'],
  ['a:G7', '####### Ein ruhiger Plan\nKauf jeden Monat BTC'],
  ['a:G8', '## Kauf jeden Monat BTC\nEin ruhiger Plan.'],
  ['a:G9', '## Kaufen Sie jeden Monat\nBitcoin ist volatil.'],
  ['a:G10 b:T8', '## Ein ruhiger Plan\n\nKauf jeden Monat BTC'],
  ['a:G11', 'Ein ruhiger Plan\n---\nKauf jeden Monat BTC'],
  ['a:G12 b:S1', 'Ein ruhiger Plan\n===\nKauf jeden Monat BTC'],
  ['a:G13', 'Ein Rückgang ist kein Grund für einen\nKauf von Bitcoin\n---'],
  ['a:T1 b:S5', 'Ein ruhiger Plan\n***\nKauf jeden Monat BTC'],
  ['a:T2', 'Ein ruhiger Plan\n\n- - -\nKauf jeden Monat BTC'],
  ['a:Q1 b:Q1', '> Kauf jeden Monat BTC'],
  ['a:Q2', '> Ein Rückgang ist kein Grund für einen\n> Kauf von Bitcoin.'],
  ['a:Q3', '> Ein ruhiger Plan\n> Kauf jeden Monat BTC'],
  ['a:Q4 b:Q4', '> Ein ruhiger Plan\n>\n> Kauf jeden Monat BTC'],
  ['a:Q5 b:Q8', 'Ein ruhiger Plan\n> Kauf jeden Monat BTC'],
  ['a:Q6', '> Ein Rückgang ist kein Grund für einen\nKauf von Bitcoin.'],
  ['a:Q7', '> Ein ruhiger Plan\n> - Kauf jeden Monat BTC'],
  ['a:Q8', '> ## Ein ruhiger Plan\n> Kauf jeden Monat BTC'],
  ['a:X1', '| Kauf | BTC |\n|---|---|\n| 100 € | monatlich |'],
  ['a:X2', '| Plan | Schritt |\n|---|---|\n| BTC | Jetzt kaufen |'],
  ['a:X3', '| Plan | Schritt |\n|---|---|\n| BTC | Kauf jeden Monat |'],
  ['a:X4', '| Plan | Schritt |\n|---|---|\n| BTC | ein Kauf pro Monat |'],
  ['a:E1 b:I1', '**Kauf** jeden Monat BTC'],
  ['a:E2', 'Ein **Kauf** von BTC ist eine Entscheidung.'],
  ['a:E3', 'Ein ruhiger Plan: **Kauf** jeden Monat BTC'],
  ['a:E5', 'Die Taste `Kauf` trägt einen Kauf von BTC ein.'],
  ['a:E6 b:I4', '`Kauf` jeden Monat BTC'],
  ['a:J1', 'Ein ruhiger Plan\n<Chart />\nKauf jeden Monat BTC'],
  ['a:J2', 'Ein ruhiger Plan\n<PastPerformance />\nKauf jeden Monat BTC'],
  ['a:J3', 'Die Zahlen sind Schlusskurse <PastPerformance /> Kauf jeden Monat BTC'],
  ['a:Z2', 'Ab \\{date\\} gilt ein Kauf von BTC als steuerfrei.'],
  ['a:C1', '```\nEin ruhiger Plan\nKauf jeden Monat BTC\n```'],
  ['a:C2', '```text\nKauf jeden Monat BTC\n```'],
  ['a:C3', '~~~\nKauf jeden Monat BTC\n~~~'],
  ['a:C4', 'Ein ruhiger Plan\n```\nKauf jeden Monat BTC\n```'],
  ['a:O1 b:R1', 'Some people say:\nBuy Bitcoin every month.'],
  ['a:O2 b:R2', 'Há quem diga:\nCompre Bitcoin todos os meses.'],
  ['a:O3', 'Some think you\nshould buy the dip in BTC.'],
  ['a:O4', '- Some buy the\n- dip of BTC.'],
  ['a:O5', '## Die Zeile\n„Investiert“ zeigt BTC.'],
  ['a:O6', 'Sie sollten Ihre Coins\nnicht verkaufen.'],
  ['b:P1', 'Ein Rückgang allein ist kein Grund für einen\nVerkauf von Bitcoin.'],
  ['b:P6', 'Nach einem Rückgang\nverkaufen Sie Ihre Coins.'],
  ['b:P7', 'Kauf jeden Monat\nfür 100 € BTC.'],
  ['b:P8', 'Der Plan begann im Jahr\n2022. Kauf von BTC folgte.'],
  ['b:P9', 'Verkaufen Sie am\n15. März Ihre BTC.'],
  ['b:P10', 'Der Kurs von BTC fiel am\n15. März um 30 %.'],
  ['b:H3', 'Ein Rückgang ist kein Grund für einen\\\nVerkauf von Bitcoin.'],
  ['b:L2', '* Ein ruhiger Plan\n* Kauf BTC jeden Monat'],
  ['b:L3', '+ Ein ruhiger Plan\n+ Kauf BTC jeden Monat'],
  ['b:L4', '1. Ein ruhiger Plan\n2. Kauf BTC jeden Monat'],
  ['b:L5', '1) Ein ruhiger Plan\n2) Kauf BTC jeden Monat'],
  ['b:L6', '- Ein ruhiger Plan\n  - Kauf BTC jeden Monat'],
  ['b:L7', '- Ein Rückgang ist kein Grund für einen\n  Verkauf von Bitcoin.'],
  ['b:L8', '- Ein Rückgang ist kein Grund für einen\nVerkauf von Bitcoin.'],
  ['b:L9', '- Ein ruhiger Plan\n\n- Kauf BTC jeden Monat'],
  ['b:L10', 'Ein ruhiger Plan\n- Kauf BTC jeden Monat'],
  ['b:L11', '- Der Kauf von BTC\n- Der Verkauf von ETH'],
  ['b:L12', '- Ein ruhiger Plan\n- Kauf von BTC am 1.'],
  ['b:L13', 'Ein ruhiger Plan\n2) Kauf BTC jeden Monat'],
  ['b:L14', '- Kaufen Sie jeden Monat\n- Bitcoin'],
  ['b:L15', '- Ein ruhiger Plan\n\n  Kauf jeden Monat BTC'],
  ['b:L16', '- A calm plan\n- Halt: Bitcoin trading stopped for a day.'],
  ['b:T7', '## Kauft BTC jeden Monat'],
  ['b:T9', '## Der Kauf von BTC\nDer Plan sieht jeden Monat einen Kauf vor.'],
  ['b:T10', '## Bitcoin\nKaufen Sie jeden Monat.'],
  ['b:T11', '## Why a halt?\nBitcoin withdrawals stopped for 3 weeks.'],
  ['b:S2', 'Kauf jeden Monat BTC\n---'],
  ['b:S3', 'Ein Rückgang ist kein Grund für einen\nVerkauf von Bitcoin\n---'],
  ['b:S4', 'Ein ruhiger Plan.\n\n---\n\nKauf jeden Monat BTC'],
  ['b:Q2', '> Ein ruhiger Plan.\n> Kauf jeden Monat BTC.'],
  ['b:Q3', '> Ein Rückgang ist kein Grund für einen\n> Verkauf von Bitcoin.'],
  ['b:Q5', '> Ein Rückgang ist kein Grund für einen\nVerkauf von Bitcoin.'],
  ['b:Q6', '> Ein ruhiger Plan\n>> Kauf jeden Monat BTC'],
  ['b:Q7', '> - Ein ruhiger Plan\n> - Kauf jeden Monat BTC'],
  ['b:G1', '| Plan | Betrag |\n|---|---|\n| Kauft BTC | 100 € |'],
  ['b:G2', '| Plan | Betrag |\n|---|---|\n| Monatlich | Kauft BTC |'],
  ['b:G3', '| Kauf | Betrag |\n|---|---|\n| BTC | 100 € |'],
  ['b:I2', 'Der **Kauf** von BTC ist im Plan.'],
  ['b:I3', '_Kauft_ BTC jeden Monat'],
  ['b:I5', 'Ein Rückgang ist kein Grund für *einen\nVerkauf* von Bitcoin.'],
  ['b:E1', 'Ein ruhiger Plan.\n\n<Chart />\n\nKauf jeden Monat BTC'],
  ['b:E2', 'Ein ruhiger Plan.\n\n<Chart />\nKauf jeden Monat BTC'],
  ['b:E3', 'Ein ruhiger Plan <PastPerformance /> Kauf jeden Monat BTC'],
  ['b:E4', 'Bitcoin fiel um 77 %. <PastPerformance />\nKauf jeden Monat BTC'],
  ['b:C1', '```\nKauft BTC jeden Monat\n```'],
  ['b:C2', '```\nEin ruhiger Plan\nKauft BTC jeden Monat\n```'],
  ['b:C3', '```text\nKauft BTC jeden Monat\n```'],
  ['b:C4', 'Ein ruhiger Plan\n~~~\nKauft BTC jeden Monat\n~~~'],
  ['b:X1', 'Ein ruhiger Plan\n—\nKauf jeden Monat BTC'],
  ['b:X2', 'Ein ruhiger Plan\n…\nKauf jeden Monat BTC'],
  ['b:R3', '- A calm plan\n- Buy Bitcoin every month'],
  ['b:R4', 'Many say you\nshould hold BTC for years.'],
  ['b:R5', 'Check the list of providers authorised\nunder MiCA.'],
  ['b:R6', 'Bitcoin ist keine sichere\nAnlage.'],
  ['b:R7', '## A plan\nBuy every month\nsome Bitcoin.'],
  ['b:R8', 'Kaufen Sie jeden Monat Bitcoin.'],
  ['j:E1', 'Keep a spare copy of your Bitcoin plan.'],
  ['j:E2', '- A calm plan\n- Spare coins sit in a wallet.'],
  ['j:E3', '## Why trading can halt\nBitcoin exchanges pause in a crash.'],
  ['j:E4', 'Money you can spare\n\nBitcoin is volatile.'],
  ['j:E5', '- Halt\n- Bitcoin trading paused for a day.'],
  ['j:E6', 'Bitcoin fell for a year\\\nHole by hole the plan held.'],
  ['j:E7', 'A plan is a staple of calm\nfor people who hold coins.'],
  ['j:E8', '## Bitcoin\nHalt: the exchange paused.'],
  ['j:S1', 'Ein Text.\n\n    Ein ruhiger Plan\n    Kauf jeden Monat BTC'],
  ['j:S2', '- Bitcoin und Ether\n\n    Ein Rückgang ist kein Grund für einen\n    Kauf von Bitcoin.'],
  ['j:S3', '- ## Ein ruhiger Plan\nKauf jeden Monat BTC'],
  ['j:S4', '-\nKauf jeden Monat BTC'],
  ['j:S5', '```\nBTC fällt\n\nKauft jeden Monat\n```'],
  ['j:S6', '1. Bitcoin seit 2009\n2. Kauf: einmal im Monat'],
  ['j:S6u', '1. Bitcoin seit 2009\n2. Kauf und Verkauf trägt man selbst ein'],
  [
    'j:S7',
    'Ein Plan hält fest:\n- Coins und Anteile: BTC 70 %, ETH 30 %\n- Kauftag: der 5. jedes Monats\n- Verkauf: ab dem Datum, das Sie wählen',
  ],
  ['j:S8', 'Ein Plan für Bitcoin\\\nKauft jeden Monat'],
  ['j:S9', 'Der Kurs fiel am\n3. Kauf von BTC folgte.'],
  ['j:S10', 'Bitcoin fiel stark <PastPerformance />\nKauft jeden Monat'],
  ['j:S11', '## Bitcoin und Ether\nKauf: einmal im Monat.'],
];

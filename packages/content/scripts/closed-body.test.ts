import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkModuleBody } from '@proofofcalm/config/vite';
import { describe, expect, it } from 'vitest';
import { moduleTranslationProblems } from '../src/i18n/module-overlay-validate.ts';
import { parseModule } from '../src/loaders/modules.ts';
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
// The element tests' bodies state no figures; src/module-figures.test.ts holds the figure rule.
const elementsOnly = (problems: readonly Problem[]) => problems.filter(({ code }) => !code.startsWith('figure-'));

// A literal English noise module and its literal pt-PT translation, through both checks as scripts/validate.ts runs them.
const at = 'packages/content/i18n/pt-PT/learn/noise.mdx';
const englishOf = (body: string, chart = 'none') => {
  const front = ['---', 'slug: noise', 'title: Noise', 'idea: Most price moves are noise.'];
  const rest = ['caveat: A plan can lose money.', `chart: ${chart}`, 'facts: ', 'lastReviewed: 2026-11-02'];
  const lines = [...front, ...rest, 'nextReviewDue: 2027-11-02', 'reviewedBy: owner', '---', '', body];
  const parsed = parseModule('packages/content/learn/noise.mdx', lines.join('\n'));
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

    it('passes every real pt-PT module against the real English modules, by both checks', async () => {
      const english = readdirSync(learn)
        .filter((name) => name.endsWith('.mdx'))
        .map((name) => parseModule(`packages/content/learn/${name}`, readFileSync(join(learn, name), 'utf8')))
        .flatMap((parsed) => (parsed.ok ? [parsed.value] : []));
      const translated = fileURLToPath(new URL('../i18n/pt-PT/learn/', import.meta.url));
      const files = readdirSync(translated)
        .filter((name) => name.endsWith('.mdx'))
        .map((name) => ({
          language: 'pt-PT',
          path: `packages/content/i18n/pt-PT/learn/${name}`,
          source: readFileSync(join(translated, name), 'utf8'),
        }));
      expect(files.length).toBeGreaterThan(0);
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

    it("reads no fence's info string, which the page does not show", async () => {
      expect(await validated(TEXT, 'Texto.\n\n```imperdível\ncódigo\n```\n')).toEqual([]);
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

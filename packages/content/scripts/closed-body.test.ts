import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkModuleBody } from '@proofofcalm/config/vite';
import { describe, expect, it } from 'vitest';
import { moduleTranslationProblems } from '../src/i18n/module-overlay-validate.ts';
import { parseModule } from '../src/loaders/modules.ts';
import { closedBodyProblems } from './closed-body.ts';

const learn = fileURLToPath(new URL('../learn/', import.meta.url));
const FRONT = ['---', 'slug: noise', 'title: Noise', '---', ''].join('\n');

describe('closedBodyProblems: pnpm validate:content refuses what the build refuses (ADR-0048)', () => {
  it('reports a module holding an element outside the set, with its line', async () => {
    const path = 'packages/content/learn/noise.mdx';
    const problems = await closedBodyProblems([{ path, source: `${FRONT}Text.\n\n<Foo />\n` }]);
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
      (await closedBodyProblems([{ path, source: source(chart, body) }])).map(
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
        (await closedBodyProblems([{ path: at, source: translation(body) }], englishOf(chart))).map(
          ({ path: where, code, detail }) => `${where}: ${code}: ${detail}`,
        );

      it("passes <Chart /> on a line of its own, and refuses it in a code span or a fence with English's code", async () => {
        expect(await translatedOf('drawdowns-bar', 'Texto.\n\n<Chart />\n')).toEqual([]);
        const elements = `${translated}: module-overlay-elements: English flow:Chart; translation none`;
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
    const at = 'packages/content/i18n/pt-PT/learn/noise.mdx';
    const englishOf = (body: string, chart = 'none') => {
      const front = ['---', 'slug: noise', 'title: Noise', 'idea: Most price moves are noise.'];
      const rest = ['caveat: A plan can lose money.', `chart: ${chart}`, 'facts: ', 'lastReviewed: 2026-11-02'];
      const lines = [...front, ...rest, 'nextReviewDue: 2027-11-02', 'reviewedBy: owner', '---', '', body];
      const parsed = parseModule('packages/content/learn/noise.mdx', lines.join('\n'));
      if (!parsed.ok) throw new Error('the English fixture does not parse');
      return [parsed.value];
    };
    const front = ['---', 'slug: noise', 'title: Ruído', 'idea: A maior parte das variações de preço é ruído.'];
    const translationOf = (body: string) =>
      [...front, 'caveat: Um plano pode perder dinheiro.', '---', '', body].join('\n');
    const validated = async (englishBody: string, body: string, chart = 'none') => {
      const english = englishOf(englishBody, chart);
      const files = [{ language: 'pt-PT', path: at, source: translationOf(body) }];
      const problems = [...moduleTranslationProblems(files, english), ...(await closedBodyProblems(files, english))];
      return problems.map(({ code, detail }) => `${code}: ${detail}`);
    };
    const PAST = 'Text.\n\n<PastPerformance />\n\nAn end.\n';

    it('reads a fence closed by ~~~` as still open, so the element after it is code', async () => {
      const english = 'Text.\n\n~~~\ncode\n~~~\n\n<PastPerformance />\n';
      expect(await validated(english, 'Texto.\n\n~~~\ncódigo\n~~~`\n\n<PastPerformance />\n')).toEqual([
        'module-overlay-elements: English flow:PastPerformance; translation none',
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
        'module-overlay-elements: English flow:Chart, flow:PastPerformance; translation flow:PastPerformance',
      ]);
      expect(await validated(english, '<PastPerformance />\n\nTexto.\n\n<Chart />\n', 'drawdowns-bar')).toEqual([
        'module-overlay-elements: English flow:Chart, flow:PastPerformance; translation flow:PastPerformance, flow:Chart',
      ]);
      expect(await validated(PAST, 'Texto. <PastPerformance />\n\nUm fim.\n')).toEqual([
        'module-overlay-elements: English flow:PastPerformance; translation text:PastPerformance',
      ]);
    });

    it('counts an element in a code span or a fenced block as none, and passes one after a fence left open', async () => {
      const english = 'Text.\n\n<Chart />\n\n<PastPerformance />\n';
      const CHART =
        'module-chart-element: write <Chart /> once, on a line of its own, where the drawdowns-bar chart stands';
      const missing =
        'module-overlay-elements: English flow:Chart, flow:PastPerformance; translation flow:PastPerformance';
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
      expect(await closedBodyProblems(files, [english.value])).toEqual([]);
    });
  });

  it('reports one problem per refused module', async () => {
    const modules = [
      { path: 'packages/content/learn/a.mdx', source: `${FRONT}Text with {1} in it.\n` },
      { path: 'packages/content/learn/b.mdx', source: `${FRONT}A line. <PastPerformance />\n` },
      { path: 'packages/content/learn/c.mdx', source: `${FRONT}A [link](/plan).\n` },
    ];
    const problems = await closedBodyProblems(modules);
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
    expect(await closedBodyProblems(modules)).toEqual([]);
  });
});

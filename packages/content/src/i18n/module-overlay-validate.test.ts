import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type LearnModule, parseModule } from '../loaders/modules.ts';
import {
  moduleTranslationProblems,
  readTranslatedModule,
  translatedModuleProblems,
} from './module-overlay-validate.ts';

// A translated Learn module against its English module (ADR-0057, ADR-0048 Deviations), on literal fixtures.

const PATH = 'packages/content/i18n/pt-PT/learn/noise.mdx';

const ENGLISH: LearnModule = {
  slug: 'noise',
  title: 'Noise',
  idea: 'Most price moves are noise.',
  caveat: 'A plan can lose 87 % of its value.',
  chart: 'drawdowns-bar',
  facts: [],
  lastReviewed: '2026-11-02',
  nextReviewDue: '2027-11-02',
  reviewedBy: 'owner',
  body: '## Noise\n\nA fall of 31.4 % in a month.\n\n<Chart />\n\n<PastPerformance />\n',
  words: 9,
  readingMinutes: 1,
};

const FRONT = {
  slug: 'noise',
  title: 'Ruído',
  idea: 'A maior parte das variações de preço é ruído.',
  caveat: 'Um plano pode perder 87 % do valor.',
};
const BODY = '## Ruído\n\nUma queda de 31,4 % num mês.\n\n<Chart />\n\n<PastPerformance />\n';

const codes = (front: Record<string, string> = FRONT, body = BODY) =>
  translatedModuleProblems(PATH, ENGLISH, { front, body }, 'pt-PT').map((problem) => problem.code);

describe('translatedModuleProblems', () => {
  it('passes a translation with the same numbers, read in its own separators, and the same elements', () => {
    expect(codes()).toEqual([]);
  });

  it('fails a dropped 87 %', () => {
    expect(codes({ ...FRONT, caveat: 'Um plano pode perder quase todo o valor.' })).toEqual([
      'overlay-number-mismatch',
    ]);
  });

  it('reads 31.4 % in English against 31,4 % in pt-PT, and fails 31.4 % written in pt-PT', () => {
    expect(codes(FRONT, BODY.replace('31,4', '31.4'))).toEqual(['overlay-number-mismatch']);
  });

  it('fails an added facts key, an idea over 120 characters and a caveat over 240', () => {
    expect(codes({ ...FRONT, facts: 'drawdowns' })).toEqual(['module-overlay-front-matter']);
    expect(codes({ ...FRONT, idea: 'a'.repeat(121) })).toEqual(['module-overlay-front-matter']);
    expect(codes({ ...FRONT, caveat: `87 % ${'a'.repeat(236)}` })).toEqual(['module-overlay-front-matter']);
  });

  it('fails a missing <Chart /> and elements in another order', () => {
    expect(codes(FRONT, BODY.replace('<Chart />', ''))).toEqual(['module-overlay-elements']);
    const swapped = BODY.replace('<Chart />', 'X')
      .replace('<PastPerformance />', '<Chart />')
      .replace('X', '<PastPerformance />');
    expect(codes(FRONT, swapped)).toEqual(['module-overlay-elements']);
  });

  it('fails an orphan slug', () => {
    const problems = translatedModuleProblems(PATH, undefined, { front: FRONT, body: BODY }, 'pt-PT');
    expect(problems.map((problem) => problem.code)).toEqual(['module-overlay-orphan']);
  });

  it('fails a pt-PT banned row in the body and in the front matter', () => {
    expect(codes(FRONT, `${BODY}\nRecomendamos manter o plano.\n`)).toEqual(['banned-advice']);
    expect(codes({ ...FRONT, title: 'Dicas sobre ruído' })).toEqual(['banned-advice']);
  });
});

describe('translatedModuleProblems, field by field', () => {
  it('fails a file whose name is not its slug', () => {
    const problems = translatedModuleProblems(
      'packages/content/i18n/pt-PT/learn/ruido.mdx',
      ENGLISH,
      { front: FRONT, body: BODY },
      'pt-PT',
    );
    expect(problems.map((problem) => problem.code)).toEqual(['file-name']);
  });

  it('fails an ordinary hyphen between a number and its unit, where English writes U+2011', () => {
    const english = { ...ENGLISH, body: `${ENGLISH.body}\nA 12‑month plan.\n` };
    const problems = (body: string) =>
      translatedModuleProblems(PATH, english, { front: FRONT, body }, 'pt-PT').map((problem) => problem.code);
    expect(problems(`${BODY}\nUm plano de 12‑month.\n`)).toEqual([]);
    expect(problems(`${BODY}\nUm plano de 12-month.\n`)).toEqual(['number-unit-hyphen']);
  });

  it('fails a number the title or the idea adds or drops', () => {
    expect(codes({ ...FRONT, title: 'Ruído em 3 passos' })).toEqual(['overlay-number-mismatch']);
    const idea = translatedModuleProblems(
      PATH,
      { ...ENGLISH, idea: 'Most of 100 price moves are noise.' },
      { front: FRONT, body: BODY },
      'pt-PT',
    );
    expect(idea.map((problem) => problem.detail)).toEqual(['idea: none, English 100']);
  });
});

describe('moduleTranslationProblems', () => {
  const file = (language: string, source: string) => ({ language, path: PATH, source });
  const SOURCE = ['---', ...Object.entries(FRONT).map(([key, value]) => `${key}: ${value}`), '---', BODY].join('\n');

  it('checks each file of an overlay language against the English module of its slug', () => {
    expect(moduleTranslationProblems([file('pt-PT', SOURCE)], [ENGLISH])).toEqual([]);
    expect(moduleTranslationProblems([file('pt-PT', SOURCE)], []).map((problem) => problem.code)).toEqual([
      'module-overlay-orphan',
    ]);
  });

  it('fails a folder that names no overlay language, English included, and a file without front matter', () => {
    const problems = moduleTranslationProblems(
      [file('fr', SOURCE), file('en', SOURCE), file('pt-PT', BODY)],
      [ENGLISH],
    );
    expect(problems.map(({ code, detail }) => `${code}: ${detail}`)).toEqual([
      'module-overlay-orphan: fr is not a content language',
      'module-overlay-orphan: en is not a content language',
      'module-overlay-front-matter: open the file with front matter between 2 --- lines',
    ]);
  });

  it('passes the real pt-PT start-here against the real English module', () => {
    const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
    const english = parseModule('packages/content/learn/start-here.mdx', read('learn/start-here.mdx'));
    if (!english.ok) throw new Error('the English start-here does not parse');
    const translated = file('pt-PT', read('i18n/pt-PT/learn/start-here.mdx'));
    expect(
      moduleTranslationProblems(
        [{ ...translated, path: 'packages/content/i18n/pt-PT/learn/start-here.mdx' }],
        [english.value],
      ),
    ).toEqual([]);
  });
});

describe('the pt-PT start-here, split as English is (brand, 25h round 2)', () => {
  const PLAN = 'Com ela, define o plano uma vez e regista cada compra, estejam as moedas onde estiverem.';
  const WHERE = 'Mostra-lhe em que ponto do plano está.';

  it('passes the number and ban rows with the two sentences against English', () => {
    const english: LearnModule = {
      ...ENGLISH,
      slug: 'start-here',
      chart: 'none',
      body: 'You set a plan once and record each purchase, wherever the coins are. It shows where you are in the plan.\n',
    };
    const front = { ...FRONT, slug: 'start-here', caveat: 'Um plano pode perder 87 % do valor.' };
    const path = 'packages/content/i18n/pt-PT/learn/start-here.mdx';
    expect(translatedModuleProblems(path, english, { front, body: `${PLAN} ${WHERE}\n` }, 'pt-PT')).toEqual([]);
  });

  it('writes the two sentences in the real file', () => {
    const source = readFileSync(new URL('../../i18n/pt-PT/learn/start-here.mdx', import.meta.url), 'utf8');
    const text = source.replace(/\s+/g, ' ');
    expect(text).toContain(`${PLAN} ${WHERE}`);
  });
});

describe('readTranslatedModule', () => {
  it('reads the flat front matter and keeps the body from the line after the fence', () => {
    const source = ['---', 'slug: noise', 'title: Ruído', '---', '', '## Ruído', ''].join('\n');
    expect(readTranslatedModule(source)).toEqual({ front: { slug: 'noise', title: 'Ruído' }, body: '\n## Ruído\n' });
  });

  it('answers null for a file without front matter', () => {
    expect(readTranslatedModule('## Ruído\n')).toBeNull();
  });
});

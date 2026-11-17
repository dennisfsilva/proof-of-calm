import { describe, expect, it } from 'vitest';
import { hyphenProblems, numberUnitHyphens } from './hyphen-validate.ts';

describe('numberUnitHyphens: a numeral joined to its unit by an ordinary hyphen (docs/CONTENT-STYLE.md §4)', () => {
  it.each(['90-dias', '3-meses', '1-mês', '2-anos', '24-horas', '5-minutos', '1-semana'])(
    'refuses the Portuguese %s with the whole numeral',
    (match) => {
      expect(numberUnitHyphens(`Uma subida de ${match} no preço.`)).toEqual([match]);
    },
  );

  it.each(['90‑dias', '24-D/2022', '2026-27', '2026-11-17'])('passes %s', (text) => {
    expect(numberUnitHyphens(`Lido em ${text}, sem unidade.`)).toEqual([]);
  });

  it('still refuses the English 90-day', () => {
    expect(numberUnitHyphens('A close below the 90-day high.')).toEqual(['90-day']);
  });

  it('names the field and the fix in each problem', () => {
    expect(hyphenProblems('packages/content/i18n/pt-PT/learn/noise.mdx', 'body', 'Um máximo de 90-dias.')).toEqual([
      {
        path: 'packages/content/i18n/pt-PT/learn/noise.mdx',
        code: 'number-unit-hyphen',
        detail: 'body: "90-dias"; write U+2011 between the number and its unit (90‑day)',
      },
    ]);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import allowList from '../../sources.allow.json' with { type: 'json' };
import banned from '../../style/banned.json' with { type: 'json' };
import { validateContent } from '../validate.ts';
import { findBanned } from './banned.ts';

const rules = (text: string) => findBanned(text).map((finding) => `${finding.rule}: ${finding.match}`);

describe('findBanned (docs/CONTENT-STYLE.md §2, docs/LEGAL.md §6)', () => {
  it('passes the microcopy of the style guide', () => {
    for (const copy of [
      'Bought as planned',
      'Recorded: €100 of BTC on 16 Oct 2026.',
      'Buy day was 1 October, 15 days ago. Record it or skip the month.',
      'Your data lives only on this device. Export a copy.',
      'Tax-free from 2 Mar 2027',
      '0.1234 BTC sellable now · 0.0100 BTC from 12 Mar 2030',
      'You can lose all of it. Bitcoin has fallen more than 75 % from a high four times since 2011.',
      'Your buy day is 1 March. Today is not a buy day unless you decided that earlier.',
      'Proof of Calm never asks for exchange API keys.',
    ]) {
      expect(rules(copy), copy).toEqual([]);
    }
  });

  it('finds advice-shaped words in English, German and Portuguese, whatever the case', () => {
    expect(rules('We recommend this. Recommended for you.')).toEqual(['advice: recommend', 'advice: Recommended']);
    expect(rules('A safe way to build wealth. Guaranteed.')).toEqual([
      'advice: safe',
      'advice: wealth',
      'advice: Guaranteed',
    ]);
    expect(rules("You should buy now, do not miss it; don’t miss it; don't miss it")).toEqual([
      'advice: You should',
      'advice: don’t miss',
      "advice: don't miss",
    ]);
    expect(rules('Wir empfehlen eine sichere Anlage, um Vermögen aufbauen zu können.')).toEqual([
      'advice: empfehlen',
      'advice: sichere',
      'advice: Vermögen aufbauen',
    ]);
    expect(rules('Recomendamos: é seguro e garantido.')).toEqual([
      'advice: Recomendamos',
      'advice: seguro',
      'advice: garantido',
    ]);
  });

  it('matches whole words only', () => {
    expect(rules('unsafe safeguard wealthy? no: wealth')).toEqual(['advice: wealth']);
  });

  it('finds dip on its own, not inside a longer word (docs/CONTENT-STYLE.md §2)', () => {
    expect(rules('Wait for a dip. A Dip is coming.')).toEqual(['advice: dip', 'advice: Dip']);
    expect(rules('The price dipped. A diploma.')).toEqual([]);
    expect(rules('Buy the dip.')).toEqual(['advice: Buy the dip']);
  });

  it('finds a claim of regulatory status in the three languages (docs/LEGAL.md §6, ADR-0047)', () => {
    expect(rules('A regulated, licensed and authorised app, MiCA-compliant and approved by ESMA.')).toEqual([
      'advice: regulated',
      'advice: licensed',
      'advice: authorised',
      'advice: MiCA-compliant',
      'advice: approved by',
    ]);
    expect(rules('Authorized. Licenced.')).toEqual(['advice: Authorized', 'advice: Licenced']);
    expect(rules('Eine regulierte, lizenzierte und zugelassene App.')).toEqual([
      'advice: regulierte',
      'advice: lizenzierte',
      'advice: zugelassene',
    ]);
    expect(rules('Uma app regulada, licenciada e autorizada.')).toEqual([
      'advice: regulada',
      'advice: licenciada',
      'advice: autorizada',
    ]);
    expect(rules('Crypto-assets are unregulated in most places.')).toEqual([]);
    // The Impressum's identification line (docs/LEGAL.md §5 and §6) carries no status word.
    expect(rules('No authorisation scheme applies; no supervisory authority.')).toEqual([]);
  });

  it('allows the register sentence of the Risk page, which names other providers', () => {
    expect(
      rules('ESMA keeps a public register of the providers authorised under MiCA. Check any provider there.'),
    ).toEqual([]);
    expect(rules('ESMA führt ein öffentliches Register der nach MiCA zugelassenen Anbieter.')).toEqual([]);
    expect(rules('A ESMA mantém um registo público dos prestadores autorizados ao abrigo do MiCA.')).toEqual([]);
    expect(rules('Proof of Calm is authorised under MiCA.')).toEqual(['advice: authorised']);
  });

  it('finds filler words, except in allow-listed phrases', () => {
    expect(rules('A seamless journey to unlock the key benefits')).toEqual([
      'filler: seamless',
      'filler: journey',
      'filler: unlock',
      'filler: key',
    ]);
    expect(rules('Never an API key. No API keys.')).toEqual([]);
  });

  it('finds a percentage next to a return, a gain, a profit or a yield', () => {
    expect(rules('A 12 % return, gains of 30%, yield 4.5 %')).toEqual([
      'return-percentage: 12 % return',
      'return-percentage: gains of 30%',
      'return-percentage: yield 4.5 %',
    ]);
    expect(rules('down 35 % from the 90-day high')).toEqual([]);
  });

  it('finds an imperative about buying or holding next to an asset', () => {
    expect(rules('Buy Bitcoin every month. Hold ETH until 2029. Get the link.')).toEqual([
      'imperative: Buy Bitcoin every month',
      'imperative: Hold ETH until 2029',
    ]);
    expect(rules('Kaufen Sie Ethereum.')).toEqual(['imperative: Kaufen Sie Ethereum']);
  });
});

// A template's date placeholder holds a dotted path ({date:sellWindow.opens}), and the person reads a date there, so
// the lint reads each date placeholder as one word: its dots end no sentence, and a ticker in its path names no asset.
describe('findBanned reads a placeholder as one word (docs/CONTENT-STYLE.md §2)', () => {
  it('refuses an imperative before a dotted placeholder and an asset after it, as with the date written out', () => {
    expect(rules('Hold until 1 June 2029 your Bitcoin.')).toEqual(['imperative: Hold until 1 June 2029 your Bitcoin']);
    expect(rules('Hold until {date:sellWindow.opens} your Bitcoin.')).toEqual([
      'imperative: Hold until {date:sellWindow.opens} your Bitcoin',
    ]);
    expect(rules('Mantenha até 1 de junho de 2029 as suas bitcoins.')).toEqual([
      'imperative: Mantenha até 1 de junho de 2029 as suas bitcoins',
    ]);
    expect(rules('Mantenha até {date:sellWindow.opens} as suas bitcoins.')).toEqual([
      'imperative: Mantenha até {date:sellWindow.opens} as suas bitcoins',
    ]);
    expect(rules('Sell before {date:drawdowns.BTC.high} all of it, it is Bitcoin.')).toEqual([
      'imperative: Sell before {date:drawdowns.BTC.high} all of it, it is Bitcoin',
    ]);
    expect(rules('Buy {coin} on {date}, Bitcoin first.')).toEqual(['imperative: Buy {coin} on {date}, Bitcoin first']);
  });

  it('ends a sentence at a dot after a placeholder, and keeps two sentences apart across one', () => {
    expect(rules('Hold until {date:sellWindow.opens}. Bitcoin fell 78 % from its high.')).toEqual([]);
    expect(rules('Hold until the window opens. From {date:sellWindow.opens}, Bitcoin is sold in thirds.')).toEqual([]);
    expect(rules('Hold until {date:sellWindow.opens}. Then sell your Bitcoin.')).toEqual([]);
    expect(rules('Bitcoin peaked on {date:references.peakFrom}. Sell ETH.')).toEqual(['imperative: Sell ETH']);
  });

  it('reads no asset in a placeholder’s path, since the person reads a date there', () => {
    expect(rules('Hold until {date:drawdowns.BTC.high}.')).toEqual([]);
    expect(rules('Mantenha até {date:drawdowns.SOL.low}.')).toEqual([]);
  });

  it('reads every other brace as written: an ICU branch body is copy, a non-date path is text', () => {
    expect(rules('{count, plural, one {Mantenha} other {Mantenham}} as suas bitcoins.')).toEqual([
      'imperative: {count, plural, one {Mantenha} other {Mantenham}} as suas bitcoins',
    ]);
    expect(rules('{n, plural, one {Compre} other {Comprem}} BTC todos os meses.')).toEqual([
      'imperative: {n, plural, one {Compre} other {Comprem}} BTC todos os meses',
    ]);
    expect(rules('Até {date}, {formal, select, yes {mantenha} other {mantém}} as suas bitcoins.')).toEqual([
      'imperative: Até {date}, {formal, select, yes {mantenha} other {mantém}} as suas bitcoins',
    ]);
    // Only a date placeholder is one word: this path's dot ends the sentence, and its ticker names an asset.
    expect(rules('Sell {coins:BTC.units} now.')).toEqual(['imperative: Sell {coins:BTC']);
  });

  // The app fills {coin} with a ticker, {coins} and {names} with a list of coins: the person reads a coin there.
  it('counts a placeholder the app fills with a coin as an asset name', () => {
    expect(rules('Buy {coin} on {date}.')).toEqual(['imperative: Buy {coin} on {date}']);
    expect(rules('Compre {coin} todos os meses.')).toEqual(['imperative: Compre {coin} todos os meses']);
    expect(rules('Hold {coins} until {date:sellWindow.opens}.')).toEqual([
      'imperative: Hold {coins} until {date:sellWindow.opens}',
    ]);
    expect(rules('Mantenha {names} até {date}.')).toEqual(['imperative: Mantenha {names} até {date}']);
    expect(rules('Registado: comprou {amount} de {coin} em {date}.')).toEqual([]);
    expect(rules('{coins, select, one {} other {Hold}} the amounts on {date}.')).toEqual([]);
  });

  it('returns the sentence exactly as written, its figures and placeholders restored', () => {
    expect(rules('Sell 0.5 BTC on {date:lastBuy} now.')).toEqual(['imperative: Sell 0.5 BTC on {date:lastBuy} now']);
    expect(rules('Sell 10 BTC on {date:lastBuy} or {date:sellWindow.opens}, 1.000 € each.')).toEqual([
      'imperative: Sell 10 BTC on {date:lastBuy} or {date:sellWindow.opens}, 1.000 € each',
    ]);
  });

  it('refuses the sentence in a template’s text through the validator, its placeholder as written', () => {
    const json = JSON.parse(readFileSync(new URL('../../templates/cycle-plan.json', import.meta.url), 'utf8'));
    const path = 'packages/content/templates/cycle-plan.json';
    const { $comment: _, ...allow } = allowList;
    const bannedCodes = (sentence: string) =>
      validateContent([{ path, json: { ...json, explanation: `${json.explanation}${sentence}` } }], {
        today: '2026-10-17',
        allow,
      })
        .filter((problem) => problem.code.startsWith('banned-'))
        .map((problem) => `${problem.code}: ${problem.detail}`);
    expect(bannedCodes('')).toEqual([]);
    expect(bannedCodes(' Hold until {date:lastBuy} your Bitcoin.')).toEqual([
      'banned-imperative: explanation: "Hold until {date:lastBuy} your Bitcoin" is on the ban list; reword it (docs/CONTENT-STYLE.md §2)',
    ]);
    expect(bannedCodes(' Hold until {date:sellWindow.opens} your Bitcoin.')).toEqual([
      'banned-imperative: explanation: "Hold until {date:sellWindow.opens} your Bitcoin" is on the ban list; reword it (docs/CONTENT-STYLE.md §2)',
    ]);
  });
});

// The pt-PT rows (docs/CONTENT-STYLE.md §2 and §9): one positive per §2 row that has a Portuguese form.
describe('findBanned in Portuguese (docs/CONTENT-STYLE.md §2 and §9)', () => {
  it.each([
    ['recommend', 'Recomendamos este plano.', ['advice: Recomendamos']],
    ['you should', 'Deveria comprar todos os meses.', ['advice: Deveria comprar']],
    ['must buy', 'Tem de comprar antes de março.', ['advice: Tem de comprar']],
    ['we suggest, our pick', 'Sugerimos isto: a nossa escolha.', ['advice: Sugerimos', 'advice: a nossa escolha']],
    ['tip', 'Uma dica para o dia de compra.', ['advice: dica']],
    ['safe', 'Um investimento seguro.', ['advice: seguro']],
    ['guarantee', 'Sem garantia. Garantimos o valor.', ['advice: garantia', 'advice: Garantimos']],
    ['wealth', 'Construir património e ficar rico.', ['advice: Construir património', 'advice: ficar rico']],
    [
      'passive income, earn',
      'Rendimento passivo: ganhe dinheiro.',
      ['advice: Rendimento passivo', 'advice: ganhe dinheiro'],
    ],
    [
      'expected return, target price',
      'O retorno esperado e o preço-alvo.',
      ['advice: retorno esperado', 'advice: preço-alvo'],
    ],
    ['will rise, will recover', 'Vai subir e recuperará.', ['advice: Vai subir', 'advice: recuperará']],
    [
      'best coins, top coins',
      'As melhores moedas e as top criptomoedas.',
      ['advice: melhores moedas', 'advice: top criptomoedas'],
    ],
    [
      'to the moon, buy the dip, stack sats',
      'Rumo à lua: compre na queda, acumule sats.',
      ['advice: Rumo à lua', 'advice: compre na queda', 'advice: acumule sats'],
    ],
    [
      'opportunity, do not miss, now is the time',
      'Não perca esta ocasião: agora é a altura, uma oportunidade.',
      ['advice: Não perca esta ocasião', 'advice: agora é a altura', 'advice: oportunidade'],
    ],
    ['simply, effortless', 'Simplesmente registe, sem esforço.', ['advice: Simplesmente', 'advice: sem esforço']],
    [
      'inflation hedge, digital gold',
      'Ouro digital, uma proteção contra a inflação.',
      ['advice: Ouro digital', 'advice: proteção contra a inflação'],
    ],
    ['undervalued', 'Uma moeda subvalorizada.', ['advice: subvalorizada']],
    [
      'beat the market, beat inflation',
      'Bater o mercado e vencer a inflação.',
      ['advice: Bater o mercado', 'advice: vencer a inflação'],
    ],
    ['congratulations', 'Parabéns pelo registo.', ['advice: Parabéns']],
    [
      'approved by, MiCA-compliant',
      'Aprovado pela CMVM, em conformidade com o MiCA.',
      ['advice: Aprovado pela', 'advice: em conformidade com o MiCA'],
    ],
  ])('finds the %s row', (_row, text, expected) => {
    expect(rules(text)).toEqual(expected);
  });

  it('finds the Portuguese filler words', () => {
    expect(rules('Uma jornada poderosa para desbloquear e potenciar pontos-chave robustos.')).toEqual([
      'filler: jornada',
      'filler: poderosa',
      'filler: desbloquear',
      'filler: potenciar',
      'filler: pontos-chave',
      'filler: robustos',
    ]);
  });

  it('finds a gain word next to a percentage in both orders, and passes the tax prose a profile needs', () => {
    expect(rules('Um rendimento de 8 %, 8 % de retorno, lucro de 12,5 %, 5% lucro.')).toEqual([
      'return-percentage: rendimento de 8 %',
      'return-percentage: 8 % de retorno',
      'return-percentage: lucro de 12,5 %',
      'return-percentage: 5% lucro',
    ]);
    expect(rules('Um ganho de 30%, uma mais-valia de 15 % e um rendimento anual de 8 %.')).toEqual([
      'return-percentage: ganho de 30%',
      'return-percentage: mais-valia de 15 %',
      'return-percentage: rendimento anual de 8 %',
    ]);
    for (const copy of [
      'As mais-valias são tributadas à taxa especial de 28 %.',
      'A taxa sobre as mais-valias é de 28 %.',
      'Englobamento: 50 % das mais-valias.',
      'Os rendimentos de 2026 declaram-se no Anexo G; a taxa é de 28%.',
    ]) {
      expect(rules(copy), copy).toEqual([]);
    }
  });

  it('finds a Portuguese imperative about buying or holding next to an asset, and nothing without one', () => {
    expect(rules('Guarde as suas bitcoins. Compre BTC. Mantenha o ETH até 2029.')).toEqual([
      'imperative: Guarde as suas bitcoins',
      'imperative: Compre BTC',
      'imperative: Mantenha o ETH até 2029',
    ]);
    expect(rules('Invista em criptomoedas. Aproveite o bitcoin. Venda BTC agora.')).toEqual([
      'imperative: Invista em criptomoedas',
      'imperative: Aproveite o bitcoin',
      'imperative: Venda BTC agora',
    ]);
    for (const copy of [
      'Guarde o ficheiro.',
      'Guardar',
      'Registar compra',
      'Montante da compra mensal de BTC.',
      'Comprei BTC em março.',
      'Registada uma venda de 0,1 BTC.',
      '0,1 BTC vendidos em 3 nov. 2026.',
      'Vendas de ETH em 2026.',
    ]) {
      expect(rules(copy), copy).toEqual([]);
    }
  });

  // "Compra" and "Venda" opening a sentence can be a label noun or an imperative, and no pattern tells them apart, so
  // the lint refuses both; the label takes a determiner or the plural (docs/CONTENT-STYLE.md §2, Portuguese).
  it('refuses a label that opens with a buying or selling form beside an asset, and passes its rewording', () => {
    for (const [refused, instead] of [
      ['Compra mensal de BTC.', 'Montante da compra mensal de BTC.'],
      ['Compra periódica de BTC.', 'Compras periódicas de BTC.'],
      ['Venda de 0,1 BTC registada.', 'Registada uma venda de 0,1 BTC.'],
      ['Venda registada: 0,1 BTC.', '0,1 BTC vendidos em 3 nov. 2026.'],
      ['Venda em 3 de março de 2027: 0,1 BTC', 'A venda de 3 de março de 2027: 0,1 BTC'],
      ['Venda parcial de ETH', 'Uma venda parcial de ETH'],
    ] as [string, string][]) {
      expect(rules(refused), refused).not.toEqual([]);
      expect(rules(instead), instead).toEqual([]);
    }
  });

  it('passes the glossary and pt-PT microcopy, so no English row fires on Portuguese words', () => {
    for (const copy of [
      'Hoje · Registo · Portefólio · Plano · Aprender · Definições',
      'Movimento registado. Anular.',
      'Comissão de rede: 0,0002 BTC.',
      'Dia de compra: 1 de março de 2027.',
      'Janela de venda a partir de 2 de março de 2027.',
      'Período de detenção de 365 dias; não tributado a partir de 2 de março de 2027.',
      'Compras periódicas de BTC.',
      'Os seus dados ficam apenas neste dispositivo. Exporte uma cópia.',
      'Pode perder tudo. A bitcoin caiu mais de 75% a partir de um máximo 4 vezes desde 2011.',
      'A Proof of Calm nunca pede chaves de API nem a sua chave privada.',
      'Declare a venda no Anexo G, Quadro 18A, ao abrigo do CIRS.',
    ]) {
      expect(rules(copy), copy).toEqual([]);
    }
  });

  // An allow-list entry must be needed: these names never put a gain word right beside a percentage, so each
  // passes in the sentences a profile writes without an entry (docs/CONTENT-STYLE.md §2).
  it('passes the tax authority’s proper names without an allow-list entry', () => {
    for (const copy of [
      'O IRS, Imposto sobre o Rendimento das Pessoas Singulares, tributa as mais-valias a 28%.',
      'A taxa é de 28% sobre os rendimentos de capitais (categoria E).',
      'Os rendimentos de capitais pagam 28%.',
      'Anexo G, Mais-valias e outros incrementos patrimoniais: 28%.',
      'Mais-valias e outros incrementos patrimoniais, à taxa de 28 %.',
    ]) {
      expect(rules(copy), copy).toEqual([]);
    }
    const phrases = banned.allow.map((entry) => entry.phrase.toLowerCase());
    for (const name of ['imposto sobre o rendimento', 'rendimentos de capitais', 'incrementos patrimoniais']) {
      expect(
        phrases.some((phrase) => phrase.includes(name)),
        name,
      ).toBe(false);
    }
    expect(rules('Rendimentos de 28 %.')).toEqual(['return-percentage: Rendimentos de 28 %']);
  });

  it('keeps the filler list in two languages', () => {
    expect(banned.filler.en).toContain('key');
    expect(banned.filler.pt).toContain('jornada');
  });
});

// The rows the review of the pt-PT ban list added: one positive per new pattern, one negative per guard.
describe('findBanned in Portuguese: advice, forecasts, urgency, status and the voice', () => {
  it.each([
    ['devia', 'Devia comprar todos os meses.', ['advice: Devia comprar']],
    ['deviam', 'Deviam vender agora.', ['advice: Deviam vender']],
    ['deve-se', 'Deve-se manter.', ['advice: Deve-se manter']],
    ['deverá', 'Deverá acumular durante 4 anos.', ['advice: Deverá acumular']],
    ['aconselho', 'Aconselho isto. Aconselhamos isto.', ['advice: Aconselho', 'advice: Aconselhamos']],
    ['aconselha-se', 'Aconselha-se um plano. É aconselhável.', ['advice: Aconselha-se', 'advice: aconselhável']],
    ['têm de', 'Tem de manter até 2027. Têm que vender.', ['advice: Tem de manter', 'advice: Têm que vender']],
    [
      'precisa de',
      'Precisa de investir. Precisam de manter.',
      ['advice: Precisa de investir', 'advice: Precisam de manter'],
    ],
    ['vale a pena', 'Vale a pena guardar.', ['advice: Vale a pena guardar']],
    ['há de', 'Há de subir.', ['advice: Há de subir']],
    ['vai voltar a', 'Vai voltar a valorizar.', ['advice: Vai voltar a valorizar']],
    ['deverá subir', 'Deverá recuperar em 2027.', ['advice: Deverá recuperar']],
    ['disparar', 'Disparou em 2024 e dispara outra vez.', ['advice: Disparou', 'advice: dispara']],
    ['projected', 'O valor projetado e a projeção.', ['advice: projetado', 'advice: projeção']],
    ['de certeza que vai', 'De certeza que vai correr bem.', ['advice: De certeza que vai']],
    [
      'buy the dip',
      'Comprar nas quedas e aproveitar as quedas.',
      ['advice: Comprar nas quedas', 'advice: aproveitar as quedas'],
    ],
    ['do not miss', 'Não deixe passar. Não fique de fora.', ['advice: Não deixe passar', 'advice: Não fique de fora']],
    ['a não perder', 'Uma ocasião a não perder, imperdível.', ['advice: a não perder', 'advice: imperdível']],
    ['breaking, trending', 'Última hora: tendência de alta.', ['advice: Última hora', 'advice: tendência de alta']],
    ['store of value', 'Uma reserva de valor.', ['advice: reserva de valor']],
    ['não perca before an opportunity', 'Não perca o momento.', ['advice: Não perca o momento']],
    ['supervised', 'Uma app supervisionada.', ['advice: supervisionada']],
    ['approved by', 'Aprovado por reguladores.', ['advice: Aprovado por']],
    ['MiCA-compliant', 'Conforme o MiCA; cumpre o MiCA.', ['advice: Conforme o MiCA', 'advice: cumpre o MiCA']],
    [
      'registered with',
      'Registada na CMVM. Registado junto do Banco de Portugal.',
      ['advice: Registada na CMVM', 'advice: Registado junto do Banco de Portugal'],
    ],
    [
      'badge',
      'Crachás, emblemas e medalhas; subir de nível.',
      ['advice: Crachás', 'advice: emblemas', 'advice: medalhas', 'advice: subir de nível'],
    ],
    [
      'praise',
      'Muito bem. Bom trabalho, continue assim.',
      ['advice: Muito bem', 'advice: Bom trabalho', 'advice: continue assim'],
    ],
    ['reassurance', 'Não se preocupe, fique descansado.', ['advice: Não se preocupe', 'advice: fique descansado']],
    [
      'reassurance',
      'Fique tranquila: paz de espírito, no bom caminho.',
      ['advice: Fique tranquila', 'advice: paz de espírito', 'advice: bom caminho'],
    ],
    ['price alert', 'Alertas de preço. Sem alertas.', ['advice: Alertas de preço', 'advice: Sem alertas']],
    ['você', 'Você pode. Vocês podem.', ['advice: Você', 'advice: Vocês']],
    ['guarantee', 'Garanta que guardou o ficheiro.', ['advice: Garanta']],
  ])('finds the %s row', (_row, text, expected) => {
    expect(rules(text)).toEqual(expected);
  });

  it('passes the everyday words each row leaves out', () => {
    for (const copy of [
      'Não constitui aconselhamento.',
      'A disparidade entre os preços.',
      'O dia de compra previsto é 1 de março de 2027.',
      'Não perca a sua chave privada.',
      'Não perca o acesso à carteira.',
      'Compra registada no Registo.',
      'Venda registada.',
      'Acesso de terceiros sem a sua autorização: nunca partilhe a chave privada.',
      'Um alerta do navegador.',
      'Uma queda de 35% desde o máximo de 90 dias.',
    ]) {
      expect(rules(copy), copy).toEqual([]);
    }
    expect(rules('Uma app autorizada.')).toEqual(['advice: autorizada']);
    expect(rules('Acesso não autorizado.')).toEqual(['advice: autorizado']);
  });

  it('finds the Portuguese filler words of the voice', () => {
    expect(rules('Por favor, escolha uma data. Lamentamos.')).toEqual(['filler: Por favor', 'filler: Lamentamos']);
  });

  it('finds a gain word beside a percentage through the connectors and up to two adjectives', () => {
    for (const [copy, match] of [
      ['Uma rentabilidade de 8 % ao ano.', 'rentabilidade de 8 %'],
      ['Uma rendibilidade de 8% ao ano.', 'rendibilidade de 8%'],
      ['Um retorno potencial de 300 %.', 'retorno potencial de 300 %'],
      ['Um rendimento de cerca de 8 %.', 'rendimento de cerca de 8 %'],
      ['Lucro superior a 10 %.', 'Lucro superior a 10 %'],
      ['Ganhos acima de 10%.', 'Ganhos acima de 10%'],
      ['Um retorno até 50%.', 'retorno até 50%'],
      ['Um rendimento médio anual de 8 %.', 'rendimento médio anual de 8 %'],
      ['Um retorno esperado de 8%.', 'retorno esperado de 8%'],
      ['Ganhe 8 % ao ano.', 'Ganhe 8 %'],
      ['O rendimento é de 8 % ao ano.', 'rendimento é de 8 %'],
    ]) {
      expect(
        findBanned(copy as string)
          .filter((finding) => finding.rule === 'return-percentage')
          .map((finding) => finding.match),
        copy,
      ).toEqual([match]);
    }
    for (const copy of [
      'As mais-valias são tributadas à taxa especial de 28%.',
      'As mais-valias são tributadas à taxa especial de 28 %.',
      '28% das mais-valias',
      'taxa de 28 % sobre as mais-valias',
      'Mais-valias: 28%',
      'A taxa sobre as mais-valias é de 28%.',
      'A taxa sobre os rendimentos é de 28 %.',
    ]) {
      expect(rules(copy), copy).toEqual([]);
    }
  });

  it('finds a Portuguese imperative anywhere in a sentence that names an asset, after "não" too', () => {
    expect(rules('Não venda as suas bitcoins numa queda. No dia de compra, compre BTC.')).toEqual([
      'imperative: Não venda as suas bitcoins numa queda',
      'imperative: No dia de compra, compre BTC',
    ]);
    expect(rules('Continue a comprar ETH. Acumule bitcoin. Adquira SOL.')).toEqual([
      'imperative: Continue a comprar ETH',
      'imperative: Acumule bitcoin',
      'imperative: Adquira SOL',
    ]);
    expect(rules('Reforce a posição em BTC. Detenha ETH. Segure as criptomoedas.')).toEqual([
      'imperative: Reforce a posição em BTC',
      'imperative: Detenha ETH',
      'imperative: Segure as criptomoedas',
    ]);
    for (const copy of [
      'Registar compra',
      'Montante da compra mensal de BTC.',
      'Registada uma venda de 0,1 BTC.',
      'Guarde o ficheiro.',
      'Registe cada venda de BTC no Registo.',
      'A janela de venda abre em 2029 para os seus BTC.',
      'Cada venda de ETH conta.',
    ]) {
      expect(rules(copy), copy).toEqual([]);
    }
  });

  it('finds an infinitive about buying at the start of a sentence that names an asset, not in English', () => {
    expect(rules('Comprar BTC. Vender ETH todos os meses. Investir em criptomoedas.')).toEqual([
      'imperative: Comprar BTC',
      'imperative: Vender ETH todos os meses',
      'imperative: Investir em criptomoedas',
    ]);
    expect(rules('Acumular BTC. Acumular sats.')).toEqual(['advice: Acumular sats', 'imperative: Acumular BTC']);
    expect(rules('O plano é comprar BTC todos os meses.')).toEqual([
      'imperative: O plano é comprar BTC todos os meses',
    ]);
    expect(rules('O plano compra BTC todos os meses.')).toEqual([]);
    expect(rules('You hold BTC. Kept BTC since 2024.')).toEqual([]);
  });
});

// The second review of the pt-PT ban list: each gap must fail and each sentence the copy needs must pass.
describe('findBanned in Portuguese: the gaps and over-catches of the second review', () => {
  const returns = (copy: string) =>
    findBanned(copy)
      .filter((finding) => finding.rule === 'return-percentage')
      .map((finding) => finding.match);

  it('finds the gain verbs through the connectors the nouns take, "mais de" too', () => {
    for (const [copy, match] of [
      ['Ganhe até 8 % ao ano.', 'Ganhe até 8 %'],
      ['Pode ganhar cerca de 8 % ao ano.', 'ganhar cerca de 8 %'],
      ['Ganham até 10% ao mês.', 'Ganham até 10%'],
      ['Ganhe mais de 8% por ano.', 'Ganhe mais de 8%'],
      ['Um rendimento de mais de 8%.', 'rendimento de mais de 8%'],
      ['Lucros de mais de 10 % ao ano.', 'Lucros de mais de 10 %'],
      ['O retorno é de mais de 8%.', 'retorno é de mais de 8%'],
    ] as const) {
      expect(returns(copy), copy).toEqual([match]);
    }
    expect(rules('A bitcoin caiu mais de 75% a partir de um máximo 4 vezes desde 2011.')).toEqual([]);
  });

  it('finds every form of "disparar" and passes "disparidade"', () => {
    expect(rules('Os preços dispararam.')).toEqual(['advice: dispararam']);
    expect(rules('Dispararam em 2024.')).toEqual(['advice: Dispararam']);
    expect(rules('Os preços dispararão, disparado, disparada, disparados, disparadas, disparando.')).toEqual([
      'advice: dispararão',
      'advice: disparado',
      'advice: disparada',
      'advice: disparados',
      'advice: disparadas',
      'advice: disparando',
    ]);
    expect(rules('A disparidade entre os preços.')).toEqual([]);
  });

  it('finds a registration claimed with any named regulator, the singular "regulador" too', () => {
    expect(rules('Registado junto do regulador.')).toEqual(['advice: Registado junto do regulador']);
    expect(rules('Registada na Comissão do Mercado de Valores Mobiliários.')).toEqual([
      'advice: Registada na Comissão do Mercado de Valores Mobiliários',
    ]);
    expect(rules('Registada na Autoridade Bancária Europeia.')).toEqual([
      'advice: Registada na Autoridade Bancária Europeia',
    ]);
    expect(rules('Registada na Autoridade Europeia dos Valores Mobiliários e dos Mercados.')).toEqual([
      'advice: Registada na Autoridade Europeia dos Valores Mobiliários e dos Mercados',
    ]);
    expect(rules('Registada junto da Autoridade de Supervisão de Seguros e Fundos de Pensões.')).toEqual([
      'advice: Registada junto da Autoridade de Supervisão de Seguros e Fundos de Pensões',
    ]);
    expect(rules('Compra registada no Registo.')).toEqual([]);
  });

  it('lifts no status ban with "não", and passes the rewordings without "autorizado"', () => {
    expect(rules('Uma app não autorizada pela CMVM.')).toEqual(['advice: autorizada']);
    expect(rules('Não autorizado por nenhum regulador.')).toEqual(['advice: autorizado']);
    expect(rules('Prestadores não autorizados junto da CMVM.')).toEqual(['advice: autorizados']);
    expect(rules('Acesso não autorizado: nunca partilhe a chave privada.')).toEqual(['advice: autorizado']);
    expect(rules('Uma transferência de bitcoins que não autorizou não pode ser anulada.')).toEqual([]);
    expect(rules('O acesso de terceiros sem a sua autorização à carteira.')).toEqual([]);
  });

  it('finds the necessity and preference rows before every buying or holding verb', () => {
    for (const [copy, match] of [
      ['Precisa de guardar as moedas.', 'Precisa de guardar'],
      ['Precisam de acumular.', 'Precisam de acumular'],
      ['Vale a pena vender.', 'Vale a pena vender'],
      ['Vale a pena acumular.', 'Vale a pena acumular'],
      ['Tem de acumular.', 'Tem de acumular'],
      ['Têm que guardar.', 'Têm que guardar'],
      ['Convém comprar todos os meses.', 'Convém comprar'],
      ['É melhor manter.', 'É melhor manter'],
      ['É preferível vender.', 'É preferível vender'],
    ] as const) {
      expect(rules(copy), copy).toEqual([`advice: ${match}`]);
    }
    expect(rules('Convém investir; é melhor guardar; é preferível acumular.')).toEqual([
      'advice: Convém investir',
      'advice: é melhor guardar',
      'advice: é preferível acumular',
    ]);
    expect(rules('É melhor confirmar a data antes de guardar.')).toEqual([]);
  });

  it('passes a gain word after "sobre" without an article, as tax prose', () => {
    expect(rules('Imposto sobre mais-valias de 28%.')).toEqual([]);
    expect(rules('Taxa sobre mais-valias de 28%.')).toEqual([]);
    expect(rules('O rendimento é de 8 % ao ano.')).toEqual(['return-percentage: rendimento é de 8 %']);
  });

  it('refuses a buying, selling or holding form anywhere in a sentence that names an asset', () => {
    for (const copy of [
      'É importante que compre BTC agora.',
      'Convém que compre BTC todos os meses.',
      'É melhor que não venda as suas bitcoins numa queda.',
      'É preferível que mantenha as suas bitcoins.',
      'Sugiro que venda ETH.',
      'Comprar 100 € de BTC todos os meses.',
      'Investir em bitcoin todos os meses, sem olhar para o preço.',
      'Comprar BTC: 100 € por mês.',
      'Manter BTC até 2029.',
      'Vender BTC antes de 2 de março de 2027 torna a mais-valia tributável.',
      'Caso venda BTC antes de 2 de março de 2027, a mais-valia é tributada.',
      'Desde que não venda as bitcoins antes de 365 dias, a mais-valia não é tributada.',
      'Se comprasse BTC hoje, teria mais.',
      'Troque o seu ETH por BTC.',
      'Converta as suas bitcoins em euros.',
      'Liquide a posição em ETH.',
      'Diversifique para criptoativos.',
      'Agora compra BTC.',
      'Não vendas as tuas bitcoins.',
      'Faça já a sua compra de BTC.',
      'Proceda à venda das suas bitcoins.',
      'Aproveita e compra bitcoin.',
      'Comprá-las agora, as bitcoins.',
    ]) {
      expect(
        findBanned(copy).map((finding) => finding.rule),
        copy,
      ).toContain('imperative');
    }
    expect(rules('Comprar BTC')).toEqual(['imperative: Comprar BTC']);
    expect(rules('Acumular sats')).toEqual(['advice: Acumular sats']);
    expect(rules('Guarde o ficheiro. Comprei BTC em março.')).toEqual([]);
  });

  it('keeps a dot inside a figure in the sentence, so "0.5" and "1.000" hide no imperative', () => {
    expect(rules('Buy 0.5 BTC now.')).toEqual(['imperative: Buy 0.5 BTC now']);
    expect(rules('Venda 0.1 BTC.')).toEqual(['imperative: Venda 0.1 BTC']);
    expect(rules('Compre 1.000 € de BTC.')).toEqual(['imperative: Compre 1.000 € de BTC']);
  });

  it('reads an asset in its plural or Portuguese name, and a decomposed accent as the composed one', () => {
    for (const copy of [
      'Mantenha as suas bitcoins.',
      'Mantenha os seus ethers.',
      'Compre cripto.',
      'Compre criptomoedas.',
      'Compre cripto-ativos.',
      'Compre criptoactivos.',
    ]) {
      expect(
        findBanned(copy).map((finding) => finding.rule),
        copy,
      ).toEqual(['imperative']);
    }
    expect(rules('Não vendas as tuas bitcoins.'.normalize('NFD'))).toEqual(['imperative: Não vendas as tuas bitcoins']);
  });

  it('reads "venda" as the noun after a determiner, a preposition or an "a" that opens a clause', () => {
    for (const copy of [
      'A venda de BTC antes de 365 dias é tributada.',
      'Registada uma venda de 0,1 BTC.',
      'Após a venda de ETH, a mais-valia é calculada.',
      'Cada venda de ETH conta.',
      'A janela de venda abre em 2029 para os seus BTC.',
      'Compras e venda de BTC: 3.',
      '- a venda de BTC',
    ]) {
      expect(rules(copy), copy).toEqual([]);
    }
    for (const copy of ['Venda BTC agora.', 'Se tem ETH, é melhor que, numa queda, a venda.', 'Venda 0,1 BTC']) {
      expect(
        findBanned(copy).map((finding) => finding.rule),
        copy,
      ).toEqual(['imperative']);
    }
  });

  // The Risk page's only statement on status (docs/LEGAL.md §5) in Portuguese carries no status word the lint
  // reads as a claim, so it passes with no allow-list entry, as the Impressum's line does.
  it('passes the Risk page’s status sentence in Portuguese without an allow-list entry', () => {
    const status =
      'não está registada junto de nenhum supervisor financeiro nem sujeita à sua supervisão, e nenhum sistema de indemnização dos investidores ou de proteção de depósitos cobre os criptoativos';
    expect(rules(status)).toEqual([]);
    expect(rules(`A Proof of Calm ${status}.`)).toEqual([]);
    const phrases = banned.allow.map((entry) => entry.phrase.toLowerCase());
    expect(phrases.some((phrase) => status.includes(phrase))).toBe(false);
  });
});

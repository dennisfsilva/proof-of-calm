import { describe, expect, it } from 'vitest';
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

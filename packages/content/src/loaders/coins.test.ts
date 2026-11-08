import { CoinSchema } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { COINS } from './coins.ts';

describe('COINS (ADR-0036)', () => {
  it('are the 26 coins the price route quoted from apps/web, ticker and CoinGecko id unchanged', () => {
    expect(COINS.map((coin) => `${coin.id}:${coin.geckoId}`)).toEqual([
      'AAVE:aave',
      'ADA:cardano',
      'ARB:arbitrum',
      'ATOM:cosmos',
      'AVAX:avalanche-2',
      'BNB:binancecoin',
      'BTC:bitcoin',
      'DOGE:dogecoin',
      'DOT:polkadot',
      'ETH:ethereum',
      'HYPE:hyperliquid',
      'LINK:chainlink',
      'LTC:litecoin',
      'NEAR:near',
      'OP:optimism',
      'PEPE:pepe',
      'POL:polygon-ecosystem-token',
      'RENDER:render-token',
      'SOL:solana',
      'SUI:sui',
      'TAO:bittensor',
      'TON:the-open-network',
      'TRX:tron',
      'UNI:uniswap',
      'XLM:stellar',
      'XRP:ripple',
    ]);
  });

  it('are valid coins for a plan, with the decimals of docs/DESIGN.md §5 for the four of the templates', () => {
    for (const coin of COINS) expect(CoinSchema.parse(coin)).toEqual(coin);
    const decimals = Object.fromEntries(COINS.map((coin) => [coin.id, coin.decimals]));
    expect([decimals.BTC, decimals.ETH, decimals.SOL, decimals.LINK]).toEqual([8, 6, 4, 4]);
  });
});

import { describe, expect, it } from 'vitest';
import { runPrototype } from './harness.ts';

// A stand-in for the prototype: the functions the harness calls, reading the clock and the storage the
// harness controls.
const page = (script: string) => `<!doctype html><html><body><script>
(function () {
const ymd = (d) => d.toISOString().slice(0, 10);
const state = JSON.parse(localStorage.getItem('dcaplan.v1'));
const cache = JSON.parse(localStorage.getItem('dcaplan.cache.v4'));
function slotStatus() { return [{ key: '2026-10', due: new Date(), done: false, late: false }]; }
function nowActions() { return [{ type: 'lump', due: new Date(2026, 0, 1), eur: 500, late: true }]; }
function phase() { return { key: state.phase }; }
function planTotals() { return { now: Date.now(), offset: new Date().getTimezoneOffset() }; }
function portfolio() { return { per: [{ id: 'BTC', price: cache.prices.BTC.eur }], invested: 0, priced: cache.manual }; }
function eligibility() { return { share: null, allBy: null, any: false }; }
function transactions() { return []; }
function sellTranches() { return [{ k: 'sell1', when: null }]; }
fetch('https://api.example/').catch(() => {});
new ResizeObserver(() => {}).observe(document.body);
matchMedia('(prefers-color-scheme: dark)');
${script}
})();
</script></body></html>`;

describe('runPrototype', () => {
  it('fixes the clock at noon UTC, seeds the state and the prices, and reads the views back', () => {
    const result = runPrototype(page(''), { state: { phase: 'buy' }, today: '2026-10-16', prices: { BTC: 60_000 } });
    expect(result).toEqual(
      expect.objectContaining({
        slots: [{ key: '2026-10', due: '2026-10-16', done: false, late: false }],
        actions: [{ type: 'lump', slot: null, due: '2026-01-01', eur: 500, late: true, done: false }],
        phase: 'buy',
        totals: { now: Date.parse('2026-10-16T12:00:00Z'), offset: 0 },
        portfolio: expect.objectContaining({ priced: true }),
        tranches: [{ k: 'sell1', when: null }],
      }),
    );
  });

  it('refuses a page whose script no longer ends the way the prototype’s does', () => {
    expect(() => runPrototype('<script>var x = 1;</script>', { state: {}, today: '2026-10-16', prices: {} })).toThrow(
      'no longer ends',
    );
  });

  it('fails loudly when the page throws while loading', () => {
    expect(() =>
      runPrototype(page('throw new Error("broken")'), { state: {}, today: '2026-10-16', prices: {} }),
    ).toThrow('The prototype failed to load');
  });
});

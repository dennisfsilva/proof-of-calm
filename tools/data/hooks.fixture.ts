// The entry hooks.test.ts runs under `node --import ./tools/data/hooks.ts`: it imports the store
// without an extension, as packages/core does, and prints one count line; `missing` imports a file
// that does not exist, which must still fail.
import { parseStore } from './store';

const absent: string = './absent';
if (process.argv[2] === 'missing') await import(absent);
console.log(`rows ${parseStore('date,close\n2026-01-01,1.5\n2026-01-02,2\n', 'kraken', 'BTC-EUR').length}`);

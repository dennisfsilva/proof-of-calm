import { anEntry } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT, memoryPlanStore } from '../adapters/memory-store';
import { createDomainStore, selectNewer } from './domain';

// The rows a newer build wrote (ADR-0019 readings, "Row shape"): the adapter counts them, and the store
// hands the count to the shell's newer-version screen.

describe('selectNewer', () => {
  it('gives the counts of rows from a newer version, none before hydration, and keeps them through a write', async () => {
    const newer = { plans: 1, entries: 2 };
    const domain = createDomainStore(memoryPlanStore({ ...EMPTY_SNAPSHOT, entries: [anEntry()], newer }));
    expect(selectNewer(domain.store.getState())).toStrictEqual({ plans: 0, entries: 0 });
    await domain.hydrate();
    expect(selectNewer(domain.store.getState())).toStrictEqual(newer);
    await domain.write({ entries: [anEntry()] });
    expect(selectNewer(domain.store.getState())).toStrictEqual(newer);
  });
});

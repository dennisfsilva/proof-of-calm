// Convergence of the sync rules (ADR-0021), model-based: several devices with skewed clocks write,
// delete and restore rows and push and pull in a random order against a model of the server (the
// push upsert with its 5-minute clamp and a sequence cursor). After every device has pushed and
// pulled, all of them hold exactly the server's rows, and those are the last-writer-wins fold of
// every write the server received.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Instant } from '../dates/calendar';
import type { EntityId } from '../schema/ids';
import { mergeRows, type SyncRow, supersedes } from './rows';

type Row = SyncRow<number>;
type Stored = Row & { readonly seq: number };

const ENTITIES = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-00000000000${n}` as EntityId);
const DEVICES = ['a', 'b', 'c'].map((n) => `00000000-0000-4000-9000-00000000000${n}` as EntityId);
const CLAMP_MS = 5 * 60_000;
const START_MS = Date.UTC(2026, 9, 17, 9, 0, 0);

/** An instant at `ms` written in a zone `offsetMinutes` east of UTC, milliseconds included. */
function instantAt(ms: number, offsetMinutes: number): Instant {
  const local = new Date(ms + offsetMinutes * 60_000).toISOString().slice(0, 23);
  if (offsetMinutes === 0) return `${local}Z` as Instant;
  const size = Math.abs(offsetMinutes);
  const zone = `${String(Math.floor(size / 60)).padStart(2, '0')}:${String(size % 60).padStart(2, '0')}`;
  return `${local}${offsetMinutes < 0 ? '-' : '+'}${zone}` as Instant;
}

type Device = {
  readonly id: EntityId;
  readonly skewMs: number;
  readonly offsetMinutes: number;
  readonly rows: Map<EntityId, Row>;
  readonly pending: Set<EntityId>;
  cursor: number;
};

type Operation =
  | {
      readonly kind: 'write';
      readonly device: number;
      readonly entity: number;
      readonly remove: boolean;
      readonly payload: number;
    }
  | { readonly kind: 'push' | 'pull'; readonly device: number };

class World {
  now = START_MS;
  seq = 0;
  readonly server = new Map<EntityId, Stored>();
  readonly received: Row[] = [];
  readonly devices: Device[];

  constructor(clocks: readonly { skewMs: number; offsetMinutes: number }[]) {
    this.devices = clocks.map((clock, index) => ({
      id: DEVICES[index] as EntityId,
      ...clock,
      rows: new Map(),
      pending: new Set(),
      cursor: 0,
    }));
  }

  apply(operation: Operation, elapsedMs: number): void {
    this.now += elapsedMs;
    const device = this.devices[operation.device] as Device;
    if (operation.kind === 'write') {
      this.write(device, ENTITIES[operation.entity] as EntityId, operation.remove, operation.payload);
    } else if (operation.kind === 'push') this.push(device);
    else this.pull(device);
  }

  /** A create, an edit or a restore; a delete of a live row writes its tombstone. */
  write(device: Device, id: EntityId, remove: boolean, payload: number): void {
    const stamp = instantAt(this.now + device.skewMs, device.offsetMinutes);
    const current = device.rows.get(id);
    const deleting = remove && current !== undefined && current.deletedAt === null;
    device.rows.set(id, {
      id,
      updatedAt: stamp,
      deviceId: device.id,
      deletedAt: deleting ? stamp : null,
      payload: deleting ? current.payload : payload,
    });
    device.pending.add(id);
  }

  /** POST /api/sync/push: the server clamps the stamp and upserts; the device keeps the server's row. */
  push(device: Device): void {
    for (const id of device.pending) {
      const row = device.rows.get(id) as Row;
      const clamped =
        Date.parse(row.updatedAt) > this.now + CLAMP_MS
          ? { ...row, updatedAt: instantAt(this.now + CLAMP_MS, 0) }
          : row;
      this.received.push(clamped);
      const stored = this.server.get(id) ?? null;
      if (supersedes(clamped, stored)) {
        this.seq += 1;
        this.server.set(id, { ...clamped, seq: this.seq });
      }
      const { seq: _seq, ...winner } = this.server.get(id) as Stored;
      device.rows.set(id, winner);
    }
    device.pending.clear();
  }

  /** GET /api/sync/pull?since=cursor: newer rows replace local ones by the same comparator. */
  pull(device: Device): void {
    const rows = [...this.server.values()].filter((row) => row.seq > device.cursor).sort((a, b) => a.seq - b.seq);
    for (const { seq: _seq, ...row } of rows) {
      const local = device.rows.get(row.id) ?? null;
      if (supersedes(row, local)) {
        device.rows.set(row.id, row);
        device.pending.delete(row.id);
      }
    }
    device.cursor = this.seq;
  }

  serverRows(): Row[] {
    return [...this.server.values()].map(({ seq: _seq, ...row }) => row).sort((a, b) => (a.id < b.id ? -1 : 1));
  }
}

const sortedRows = (rows: Iterable<Row>) => [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));

const clockArb = fc.record({
  skewMs: fc.integer({ min: -CLAMP_MS, max: CLAMP_MS }),
  offsetMinutes: fc.constantFrom(0, 60, -180, 330, -600),
});
const operationArb = (devices: number): fc.Arbitrary<Operation> =>
  fc.oneof(
    fc.record({
      kind: fc.constant('write' as const),
      device: fc.nat(devices - 1),
      entity: fc.nat(ENTITIES.length - 1),
      remove: fc.boolean(),
      payload: fc.nat(1000),
    }),
    fc.record({ kind: fc.constantFrom('push' as const, 'pull' as const), device: fc.nat(devices - 1) }),
  );
const scenarioArb = fc.array(clockArb, { minLength: 2, maxLength: DEVICES.length }).chain((clocks) =>
  fc.record({
    clocks: fc.constant(clocks),
    steps: fc.array(fc.tuple(operationArb(clocks.length), fc.integer({ min: 1, max: 600_000 })), { maxLength: 60 }),
  }),
);

describe('sync convergence (ADR-0021)', () => {
  it('leaves every device with the server rows, the last-writer-wins fold of every write received', () => {
    fc.assert(
      fc.property(scenarioArb, ({ clocks, steps }) => {
        const world = new World(clocks);
        for (const [operation, elapsed] of steps) world.apply(operation, elapsed);
        // Quiescence: everyone pushes, then everyone pulls.
        for (const device of world.devices) world.apply({ kind: 'push', device: world.devices.indexOf(device) }, 1);
        for (const device of world.devices) world.apply({ kind: 'pull', device: world.devices.indexOf(device) }, 1);

        const server = world.serverRows();
        for (const device of world.devices) expect(sortedRows(device.rows.values())).toEqual(server);
        expect(world.received.reduce<Row[]>((state, row) => mergeRows(state, [row]), [])).toEqual(server);
        // An independent oracle: per row, the write with the latest moment (Date.parse), then device id.
        const latest = new Map<EntityId, Row>();
        for (const row of world.received) {
          const best = latest.get(row.id);
          const [mine, theirs] = [Date.parse(row.updatedAt), best === undefined ? -1 : Date.parse(best.updatedAt)];
          if (best === undefined || mine > theirs || (mine === theirs && row.deviceId > best.deviceId)) {
            latest.set(row.id, row);
          }
        }
        expect(sortedRows(latest.values())).toEqual(server);
      }),
      { numRuns: 300 },
    );
  });
});

describe('mergeRows properties', () => {
  const rowArb: fc.Arbitrary<Row> = fc.record({
    id: fc.constantFrom(...ENTITIES),
    // Few distinct moments, written in different zones, so ties of moments are common.
    updatedAt: fc
      .tuple(fc.integer({ min: 0, max: 3 }), fc.constantFrom(0, 60, -180))
      .map(([minute, offset]) => instantAt(START_MS + minute * 60_000, offset)),
    deviceId: fc.constantFrom(...DEVICES),
    deletedAt: fc.option(fc.constant(instantAt(START_MS, 0)), { nil: null }),
    payload: fc.nat(3),
  });
  const setArb = fc.uniqueArray(rowArb, { selector: (row) => row.id });

  it('is idempotent', () => {
    fc.assert(
      fc.property(setArb, setArb, (a, b) => {
        expect(mergeRows(a, a)).toEqual(sortedRows(a));
        expect(mergeRows(mergeRows(a, b), b)).toEqual(mergeRows(a, b));
      }),
    );
  });

  it('is commutative and associative', () => {
    fc.assert(
      fc.property(setArb, setArb, setArb, (a, b, c) => {
        expect(mergeRows(a, b)).toEqual(mergeRows(b, a));
        expect(mergeRows(mergeRows(a, b), c)).toEqual(mergeRows(a, mergeRows(b, c)));
      }),
    );
  });
});

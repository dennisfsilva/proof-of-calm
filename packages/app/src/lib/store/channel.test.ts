// @vitest-environment node
// The cross-tab channel over Node's BroadcastChannel, which delivers between objects in one process as
// browsers do between tabs: every object but the one that posted hears a message.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DATABASE_NAME } from '../adapters/idb/database';
import { type CrossTabChannel, crossTabChannel, localOnly } from './channel';

const opened: { close(): void }[] = [];
function channel(name: string, tabId: string): CrossTabChannel {
  const created = crossTabChannel({ name, tabId });
  opened.push(created);
  return created;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

afterEach(() => {
  for (const item of opened.splice(0)) item.close();
  vi.unstubAllGlobals();
});

describe('cross-tab channel (ADR-0019)', () => {
  it('tells the other tabs, never its own, even through a second object in the same tab', async () => {
    const heard = { a: 0, again: 0, b: 0 };
    const a = channel('test-tabs', 'tab-a');
    a.subscribe(() => heard.a++);
    channel('test-tabs', 'tab-a').subscribe(() => heard.again++);
    channel('test-tabs', 'tab-b').subscribe(() => heard.b++);
    a.post();
    await vi.waitFor(() => expect(heard.b).toBe(1));
    await settle();
    expect(heard).toEqual({ a: 0, again: 0, b: 1 });
  });

  it('names a wipe, then a change, so a tab that reads only changes still reloads', async () => {
    const heard: string[] = [];
    const raw: unknown[] = [];
    channel('test-wipe', 'tab-b').subscribe((event) => heard.push(event));
    const older = new BroadcastChannel('test-wipe');
    older.onmessage = (event: MessageEvent<unknown>) => raw.push(event.data);
    channel('test-wipe', 'tab-a').post('wiped');
    await vi.waitFor(() => expect(heard).toEqual(['wiped', 'changed']));
    older.close();
    expect(raw).toEqual([
      { kind: 'wiped', from: 'tab-a' },
      { kind: 'changed', from: 'tab-a' },
    ]);
  });

  it('ignores messages it cannot read', async () => {
    const listener = vi.fn();
    channel('test-unknown', 'tab-a').subscribe(listener);
    const other = new BroadcastChannel('test-unknown');
    other.postMessage('garbage');
    other.postMessage({ kind: 'reloaded', from: 'tab-b' });
    other.postMessage({ kind: 'changed', from: 'tab-b', extra: true });
    other.postMessage({ kind: 'changed', from: 'tab-b' });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    await settle();
    expect(listener).toHaveBeenCalledTimes(1);
    other.close();
  });

  it('stops after unsubscribe and close; a closed channel posts nothing', async () => {
    const listener = vi.fn();
    const later = vi.fn();
    const a = channel('test-close', 'tab-a');
    const b = channel('test-close', 'tab-b');
    const unsubscribe = b.subscribe(listener);
    b.subscribe(later);
    unsubscribe();
    a.post();
    await vi.waitFor(() => expect(later).toHaveBeenCalledTimes(1));
    b.close();
    a.post();
    a.close();
    a.post();
    await settle();
    expect(listener).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('is named after the database and makes its own tab id', async () => {
    const received: unknown[] = [];
    const database = new BroadcastChannel(DATABASE_NAME);
    database.addEventListener('message', (event) => received.push(event.data));
    const created = crossTabChannel();
    opened.push(created);
    created.post();
    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual({ kind: 'changed', from: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    database.close();
  });

  it('stays local where there is no BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const created = crossTabChannel();
    expect(created).toBe(localOnly);
    const unsubscribe = created.subscribe(() => undefined);
    created.post();
    unsubscribe();
    created.close();
  });
});

// ADR-0045 §5: the hand-written registration keeps ADR-0033's update flow step for step, driven here
// through the fake platform objects of fake-service-worker.testing.ts: a worker, a registration, the container.
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { FakeContainer, FakeWorker, updateWaitingContainer } from './fake-service-worker.testing';
import { registerServiceWorker, type UpdatePrompt } from './register';

async function registered(container: FakeContainer, url?: string) {
  const reload = vi.fn();
  const prompts: UpdatePrompt[] = [];
  const cleanup = vi.fn();
  const options = {
    container: container as unknown as ServiceWorkerContainer,
    reload,
    onUpdateReady: (update: UpdatePrompt) => {
      prompts.push(update);
      return cleanup;
    },
  };
  await registerServiceWorker(url === undefined ? options : { ...options, url });
  return { reload, prompts, cleanup };
}

/** A page already controlled by the current worker, with a new one installed and waiting (an update). */
async function updateWaiting() {
  const { container, next } = updateWaitingContainer();
  const { reload, prompts, cleanup } = await registered(container);
  expect(prompts).toHaveLength(1);
  return { container, next, reload, prompts, cleanup, prompt: prompts[0] as UpdatePrompt };
}

describe('registerServiceWorker (ADR-0045 §5, ADR-0033)', () => {
  it('registers /sw.js at the root scope, or the URL it is given (step 1)', async () => {
    const container = new FakeContainer();
    await registered(container);
    expect(container.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    const other = new FakeContainer();
    await registered(other, '/worker.js');
    expect(other.register).toHaveBeenCalledWith('/worker.js', { scope: '/' });
  });

  it('swallows a rejected register(): no throw, no log, no prompt', async () => {
    const container = new FakeContainer();
    container.register.mockRejectedValueOnce(new TypeError('blocked'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { prompts } = await registered(container);
    expect(prompts).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  // Playwright's `serviceWorkers: 'block'` answers register() with no registration at all; the page stays a
  // plain web page, as with a refused one, and no "reading 'waiting'" error reaches the console.
  it('treats a register() that yields no registration as a plain web page: no throw, no prompt', async () => {
    const container = new FakeContainer();
    container.register.mockResolvedValueOnce(undefined as never);
    const { prompts, reload } = await registered(container);
    expect(prompts).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });

  it('never reloads on the controllerchange of a first install (step 5)', async () => {
    const container = new FakeContainer();
    const first = new FakeWorker('installing');
    container.registration.installing = first;
    const { reload, prompts } = await registered(container);
    first.becomes('installed');
    first.becomes('activating');
    first.becomes('activated');
    container.controlledBy(first);
    expect(reload).not.toHaveBeenCalled();
    expect(prompts).toEqual([]);
  });

  it('prompts when a worker is already waiting at registration (step 2)', async () => {
    const { prompt } = await updateWaiting();
    expect(typeof prompt.accept).toBe('function');
    expect(typeof prompt.dismiss).toBe('function');
  });

  it('prompts when the worker installing at resolve reaches installed under a controller (step 2)', async () => {
    const container = new FakeContainer();
    container.controller = new FakeWorker('activated');
    const next = new FakeWorker('installing');
    container.registration.installing = next;
    const { prompts } = await registered(container);
    expect(prompts).toEqual([]);
    container.registration.parks(next);
    expect(prompts).toHaveLength(1);
  });

  it('prompts when a later updatefound worker reaches installed under a controller (step 2)', async () => {
    const container = new FakeContainer();
    container.controller = new FakeWorker('activated');
    const { prompts } = await registered(container);
    const next = new FakeWorker('installing');
    container.registration.found(next);
    expect(prompts).toEqual([]);
    container.registration.parks(next);
    expect(prompts).toHaveLength(1);
  });

  it('accept() listens for controllerchange once, then posts SKIP_WAITING, and reloads once (steps 4, 5)', async () => {
    const { container, next, reload, prompt } = await updateWaiting();
    const order: string[] = [];
    const listen = container.addEventListener.bind(container);
    vi.spyOn(container, 'addEventListener').mockImplementation((type, listener, options) => {
      order.push(`listen:${type}`);
      listen(type, listener, options);
    });
    next.postMessage.mockImplementation(() => order.push('post'));
    prompt.accept();
    expect(next.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(order).toEqual(['listen:controllerchange', 'post']);
    expect(reload).not.toHaveBeenCalled();
    container.controlledBy(next);
    expect(reload).toHaveBeenCalledTimes(1);
    container.controlledBy(next);
    prompt.accept();
    expect(reload).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('an unrequested controllerchange while the prompt is up does not reload; the next navigation does (step 4)', async () => {
    const { container, next, reload } = await updateWaiting();
    container.activatedElsewhere(next);
    expect(reload).not.toHaveBeenCalled();
    expect(next.postMessage).not.toHaveBeenCalled();
  });

  it('accept() after another tab accepted first reloads directly, once, and posts nothing (step 4)', async () => {
    const { container, next, reload, prompt } = await updateWaiting();
    container.activatedElsewhere(next);
    prompt.accept();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(next.postMessage).not.toHaveBeenCalled();
    prompt.accept();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("accept() reloads directly when waiting is already null before this tab's controllerchange (step 4)", async () => {
    // The other tab's worker is activating: `waiting` empties first; its claim reaches this tab a moment later.
    const { container, next, reload, prompt } = await updateWaiting();
    container.registration.waiting = null;
    next.becomes('activating');
    prompt.accept();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(next.postMessage).not.toHaveBeenCalled();
    container.controlledBy(next);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("calls the handler's cleanup once when another tab overtakes the prompt, not on accept() or dismiss()", async () => {
    const overtaken = await updateWaiting();
    expect(overtaken.cleanup).not.toHaveBeenCalled();
    overtaken.container.activatedElsewhere(overtaken.next);
    expect(overtaken.cleanup).toHaveBeenCalledTimes(1);
    overtaken.container.controlledBy(overtaken.next);
    overtaken.prompt.dismiss();
    expect(overtaken.cleanup).toHaveBeenCalledTimes(1);
    const accepted = await updateWaiting();
    accepted.prompt.accept();
    accepted.container.controlledBy(accepted.next);
    expect(accepted.cleanup).not.toHaveBeenCalled();
    const dismissed = await updateWaiting();
    dismissed.prompt.dismiss();
    dismissed.container.activatedElsewhere(dismissed.next);
    expect(dismissed.cleanup).not.toHaveBeenCalled();
  });

  it('a prompt another tab overtook does not block the prompt for a later update', async () => {
    const { container, next, prompts } = await updateWaiting();
    container.activatedElsewhere(next);
    const later = new FakeWorker('installing');
    container.registration.found(later);
    container.registration.parks(later);
    expect(prompts).toHaveLength(2);
  });

  it('dismiss() leaves the worker waiting; the next visit asks again, and a stale accept() is inert (step 3)', async () => {
    const { container, next, reload, prompt } = await updateWaiting();
    prompt.dismiss();
    expect(next.state).toBe('installed');
    expect(next.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    prompt.accept();
    expect(next.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    // Another tab accepts after the dismissal: nothing is on screen here, so a stale accept() still does nothing.
    container.activatedElsewhere(next);
    prompt.accept();
    expect(reload).not.toHaveBeenCalled();
  });

  it('prompts once while a prompt is up, whatever else the waiting worker reports', async () => {
    const { container, next, prompts } = await updateWaiting();
    container.registration.found(next);
    container.registration.parks(next);
    expect(prompts).toHaveLength(1);
  });

  it('lib/pwa/index.ts loads under plain node (the switch imports lib surfaces without a bundler)', () => {
    const index = new URL('./index.ts', import.meta.url).href;
    const script = `import(${JSON.stringify(index)}).then((m) => console.log(Object.keys(m).join(',')))`;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    expect(output.trim().split(',').sort()).toEqual(['registerServiceWorker', 'updateToast', 'whenIdle']);
  });
});

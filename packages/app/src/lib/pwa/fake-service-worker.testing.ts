// Test support, imported only by tests: fake platform objects that drive `registerServiceWorker` the way
// a browser would (EventTarget is Node's own): a worker, a registration, the container (ADR-0045 §5).
import { vi } from 'vitest';

class FakeWorker extends EventTarget {
  state: ServiceWorkerState;
  postMessage = vi.fn();
  constructor(state: ServiceWorkerState) {
    super();
    this.state = state;
  }
  /** The browser moves a worker through its states and fires `statechange` after each move. */
  becomes(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  /** An update check found a new worker: it starts installing and `updatefound` fires. */
  found(worker: FakeWorker) {
    this.installing = worker;
    this.dispatchEvent(new Event('updatefound'));
  }
  /** The browser's own bookkeeping once a worker is installed and waits for the old one to go. */
  parks(worker: FakeWorker) {
    this.installing = null;
    this.waiting = worker;
    worker.becomes('installed');
  }
}

class FakeContainer extends EventTarget {
  controller: FakeWorker | null = null;
  registration = new FakeRegistration();
  register = vi.fn(async (_url: string, _options?: RegistrationOptions) => this.registration);
  /** The new worker took control of the page (clientsClaim on a first install, or after SKIP_WAITING). */
  controlledBy(worker: FakeWorker) {
    this.controller = worker;
    this.dispatchEvent(new Event('controllerchange'));
  }
  /** Another tab accepted: the browser activates the waiting worker (`waiting` empties) and it claims this page too. */
  activatedElsewhere(worker: FakeWorker) {
    this.registration.waiting = null;
    worker.becomes('activating');
    worker.becomes('activated');
    this.controlledBy(worker);
  }
}

/** A page already controlled by the current worker, with a new one installed and waiting (an update). */
function updateWaitingContainer() {
  const container = new FakeContainer();
  container.controller = new FakeWorker('activated');
  const next = new FakeWorker('installed');
  container.registration.waiting = next;
  return { container, next };
}

export { FakeContainer, FakeWorker, updateWaitingContainer };

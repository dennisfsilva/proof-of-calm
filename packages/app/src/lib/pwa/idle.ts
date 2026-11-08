// The first idle period, for the worker's registration (ADR-0045 §5, the deviation of 2026-10-26): its
// install and precache run on the device's few cores, so they wait until the screen has settled. Where the
// platform has no idle callback (Safari), the timeout alone decides.

/** The idle callback's deadline, and the whole wait where there is none. */
export const IDLE_TIMEOUT_MS = 3000;

type IdleTarget = {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  setTimeout: (callback: () => void, ms: number) => unknown;
};

/** Runs `run` once, in the target's first idle period or at the timeout, whichever comes first. */
export function whenIdle(target: IdleTarget, run: () => void, timeoutMs = IDLE_TIMEOUT_MS): void {
  if (typeof target.requestIdleCallback === 'function') target.requestIdleCallback(() => run(), { timeout: timeoutMs });
  else target.setTimeout(run, timeoutMs);
}

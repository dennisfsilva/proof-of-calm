// Row versions of earlier builds, for the tests that prove a rollback (docs/RELEASE.md).

/**
 * The row versions the previous build read and wrote, the build before the entries' v4 rise, moves (rows.ts). A store
 * opened with them writes what that build wrote: no entry row above its own `entries` (`entryRow`).
 */
export const PREVIOUS_BUILD = { plans: 3, entries: 3 } as const;

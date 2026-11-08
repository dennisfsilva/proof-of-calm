# ADR-0020: UI state management

Status: Accepted · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-frontend.md` §2 and §6)

## Context

Two kinds of state exist: the persisted domain snapshot (plan, entries, skips, pauses, preferences, prices) and ephemeral UI state (open rows, the chart range, drafts in forms, dismissed banners, the toast queue, the pending undo). The core is pure; the shell needs a small, testable way to hold both.

## Options considered

Zustand 5.0.15 (0.7 kB gzip), Jotai 3.0.1 (3.1 kB), TanStack Store 0.11.2 (2.9 kB), React context plus reducers, or none beyond component state.

## Decision

- **Zustand 5** with two stores: `domainStore` (the immutable snapshot hydrated by the `PlanStore` adapter, ADR-0019) and `uiStore` (ephemeral state; nothing in it survives a reload except what is explicitly persisted to `prefs`). Selectors with `useShallow`; no derived data cached in the stores: derived views are the core's pure functions called in render with memoisation keyed on the snapshot and `today`.
- **Writes only through `actions`** per feature (`packages/app/features/<feature>/actions.ts`): they call the core for validation and derivation, update the domain store immutably, persist, enqueue the outbox and emit the cross-tab message. Components never mutate stores directly.
- **React 19 primitives** where they remove code: `useActionState` for form submit, pending and error states; `useOptimistic` for the one-tap log (the done block appears immediately; the write confirms); `use(browser())` for components that must not render on the server because they read IndexedDB; `<Activity>` to keep tab state alive; `<ViewTransition>` only when `prefers-reduced-motion` is not set (CSS-controlled). React Compiler on (`reactCompiler: true`), so manual memoisation is the exception.
- **Drafts** (a form abandoned mid-way) live in `sessionStorage` through a tiny adapter, keyed by form, so every form can be abandoned without losing what was typed.
- No TanStack Query for local data; the one remote resource (prices) is fetched by an adapter that writes into the domain store's `prices` slice with a timestamp.

## Consequences

- Component tests mount components with a seeded store; feature tests exercise `actions` with a fake `PlanStore`; nothing is mocked at the network layer except the price client.
- Undo on delete is an action that restores the soft-deleted row inside the 8-second window; after the window the tombstone stays for sync.
- The stores are host-agnostic and work unchanged in the web host, the mobile host and Storybook.

## Readings recorded by the build session

- **Write order.** "Update the domain store immutably, persist" is read as persist, then update the
  store: a failed write changes nothing, and `useOptimistic` gives the immediate feedback. Recorded
  with the storage readings in ADR-0019 ("Write order").
- **The toast and the UI store** (2026-10-20). The toast and its timer live in `packages/ui`'s toast
  manager, which the services hand to the screens; the UI store holds `today` (from the Clock port,
  ADR-0042), the loaded rules of the plan's country and the last price failure as ephemeral shell
  state, beside the open rows. Nothing in it survives a reload, as the Decision says. The price
  refresh never rejects (the host calls it unawaited from a timer and on focus): a price source that
  throws or a store that refuses the prices is held there too, as the `local` kind of the failure.
- **The first-boot gate** (2026-10-20). The shell's busy screen area waits once: until the first ready
  snapshot has the rules of its plan's country, or has no plan; the services then set `booted` in the
  UI store and the screens stay mounted from then on, with their state and focus, whatever a later
  write changes (only a failed store shows the failure screen). After a change of country the previous
  country's rules stay loaded until the new ones arrive; `useRules` returns none meanwhile, so a holding
  date is never computed with another country's rule, and the formatters keep the previous locale.
- **The number locale of an open form** (2026-10-20). An open form keeps the number locale it opened
  with: a form fixes its `NumberInput` locale when it mounts (the entry form does, from
  2026-10-20), so a change of country while it is open never reparses what was typed. The entry form's
  session draft (from 2026-10-20) stores its locale and is dropped when it differs from the locale the
  form opens with.
- **The plan tab's number locale** (2026-10-22). Settings' Plan tab releases its held number locale when the plan's country changes and takes the new country's once its rules load; the entry form keeps the one it opened with.
- **The entry form's draft** (2026-10-20). Keyed by `new:<kind>:<month>` for a new transaction and by
  the sorted ids of the entries an edit opens. It keeps the whole form as typed, the form as it opened,
  its number locale and its base: each edited entry's id with its `updatedAt` (nothing for a new
  transaction). It is written on each change and cleared whenever the form reads as it opened in every
  field the person can change (a blur that only tidies is no change); a save clears it. On opening it
  replays only what the person changed over the form as it opens now: the date, fee, venue and note
  that differ from the form as it opened, and per row the amount, units and price typed into (a derived
  field is not typed), then the three-way fill derives that row again. The replay runs the fill from
  the fields the person typed, so units typed before the live price loaded fill the amount once it
  shows (2026-11-05). The replayed form then follows its date, so a new purchase restored on a date
  before its opening day shows no filled price (`docs/DOMAIN.md` §6, 2026-11-06). A field left alone takes its
  value now, so the defaults (the date, the plan's amounts, the live price) are never frozen: a plan
  amount raised from 100 to 200 opens BTC paid at 140.00 beside a typed note. It is dropped on opening
  when it has no form as opened (a draft from before 2026-10-20's fix), when it reads as it opened,
  when its locale differs, when an edited entry was written since (its base differs; a field the
  person left alone never brings back a value written over in another tab, so the typed change is
  lost instead) or when its rows' coins differ from the rows the form opens with (a coin the plan
  dropped would be refused at every save). A refused save keeps it. The form compares a restored draft
  with the form as it opens now, so a restored change counts as a change.
- **The onboarding's draft** (2026-10-22). Form `onboarding`, entity `new`: the setup draft with the plan's id and the step it was left on, written on every change once the restore resolves, and cleared by Start or a stored plan. A restored draft reopens on the step it was left on, or on the earliest whose choice no longer resolves (a country without a profile, a template that is gone, a step of the other path); the early window's acceptance is never restored, so a draft left past the numbers with it ticked reopens on the numbers; a restored sentence, reminder or summary step reopens there only when `checkPlan`'s dry run passes, otherwise on the numbers or the dates (2026-10-22). The way back from a step in use: `docs/DOMAIN.md` §5.
- **The chart range** (2026-10-27). The Context lists the chart range among the ephemeral UI state; it is read as one of the things the Decision lets be "explicitly persisted to `prefs`". The Portfolio value chart (`value-chart.tsx`) reads the range from the domain snapshot's `prefs.chartRange` and writes the chosen one there through the domain store, as the Log writes `logShowAll`, so it survives a reload; a failed write keeps the range and says so in a toast. The preference and its values: `docs/DOMAIN.md` §2.3.

## Disagreement

None.

## Corrections recorded on 2026-10-29

- **Decision, "React 19 primitives", and the Write order reading above: `useOptimistic`.** No
  component uses `useOptimistic`, `use(browser())`, `<Activity>` or `<ViewTransition>`. The one tap
  waits for the write and then shows the Recorded toast (`useOneTap` in
  `packages/app/src/features/today/components/primary-action.tsx`). The React Compiler runs through
  `reactCompilerPreset()` in `packages/config/vite/host-config.ts` (ADR-0045), not
  `reactCompiler: true`.

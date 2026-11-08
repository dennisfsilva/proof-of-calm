# ADR-0002: Web first as an installable PWA; store apps via Capacitor in M3; no React Native or Expo

Status: Accepted · Date: 2026-10-16 · Deciders: owner (before the session); recorded by the planning session · Amended by ADR-0041 (the store apps may ship before accounts and sync)

## Context

A solo builder, a monthly-use tool, a crypto subject that attracts extra app-store review, an audience
on phones. Push notifications and store discoverability are valuable, but only once there are
accounts and reminders to push (M3). In-app subscriptions cost 15 to 30 percent and complicate a
future paid tier that a merchant of record would otherwise handle.

## Options considered

1. **Native or React Native/Expo first.** Best notifications and store presence from day one; a
   second design system, slower iteration, store review on every release, and the UI has no
   native-only needs.
2. **Web only, forever.** Fastest; but iOS Safari gives installed web apps push only since 16.4 and
   evicts non-installed sites' storage after seven days without a visit, and discoverability is weak.
3. **Web first as an installable PWA, then wrap the same codebase with Capacitor** when accounts and
   reminders exist, structured so the wrapper is packaging, not a rewrite.

## Decision

Option 3. Rules that keep the wrapper a packaging step are part of the architecture
(`docs/ARCHITECTURE.md`, "The API and the store wrapper") and are checked in CI from M0 by building the
static export: no server-only rendering on app screens, API calls through one client module, no
reliance on third-party cookies, no dependence on image optimisation for app screens.

## Consequences

- iOS users get the best experience only after adding to the home screen; onboarding and the "keep
  your data" line explain this plainly.
- Push notifications arrive with installation (web push) or the wrapper; until then the reminder is a
  calendar file (M1) or an email (M3).
- The store apps inherit the web app's test suite; device testing is added for install, push and deep
  links.
- Payments stay outside the stores as long as the paid features are usable on the web (ADR-0010 and
  ADR-0038 record the store-policy constraints to check before M5).

## Disagreement

None. The session notes one risk for the record: Apple's review of crypto-adjacent apps is
unpredictable even for non-custodial tools; the honest description ("planner and educator, no
trading, no custody") is the mitigation, and the web app does not depend on store approval.

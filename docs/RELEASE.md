# Release checklist

Nothing ships with a known defect. A release is a tagged commit on `main` that has passed the full
gate and this checklist; every merge to `main` goes to production, tagged or not
(`docs/OWNER-SETUP.md` §3). Preview deployments are not releases.

## Before every release

- [ ] The full gate is green on `main` (`.github/workflows/ci.yml`).
- [ ] No open issue labelled `bug` targets this release. Every bug fixed since the last release has a
      test that failed before the fix (link the PR).
- [ ] Visual snapshot changes were reviewed by a human on the PRs that changed them.
- [ ] `docs/` are current: new decisions have ADRs; `CLAUDE.md` commands still work from a clean clone
      (`pnpm install && pnpm turbo test`).
- [ ] Copy review: the banned-words lint passes on UI strings and content; new copy read once aloud.
- [ ] Content dates: any jurisdiction or module touched has `lastReviewed` updated; nothing shows
      "under review" unintentionally.
- [ ] Performance: Today first-load JS under budget; Lighthouse mobile ≥ 95 on Today, Portfolio, Log,
      Plan on the preview.
- [ ] Accessibility: axe clean; one manual keyboard pass through the monthly loop; before launch and
      yearly a screen-reader pass (VoiceOver iOS, TalkBack Android).
- [ ] Offline: install the preview on one phone, go offline, open Today, log an entry, come back online.
- [ ] Storage migration: if the IndexedDB schema version changed, the migration ran on a fixture
      database from the previous release (automated test) and on a real device.
- [ ] Export/import round trip on the preview with the owner's data.
- [ ] Security headers and CSP verified on the preview (`curl -I`, browser console clean of CSP reports);
      `security.txt` expiry at least 6 months away.
- [ ] Dependencies: no known high or critical advisories (`pnpm audit`, CI scanner); lockfile committed.
- [ ] Changelog current: each session's docs sync adds the user-visible changes merged to `main`
      under `Unreleased` in `CHANGELOG.md`, in plain words (`docs/CONTENT-STYLE.md` §1 and §2), and
      the release PR gives that section its version and date (decided 2026-11-15).

## Additional before the public launch (after M2)

- [ ] Legal pages live and linked from the site's footer, onboarding and Settings → About: Terms,
      Privacy, Risk disclosure, Cookie-free statement, Contact/Impressum (`docs/LEGAL.md` §5).
- [ ] The four legal texts (Terms, Privacy, Contact/Impressum, the Cookie-free statement's launch
      text) signed by the owner through the needs-owner PR that fills in the owner's identity, which
      only the owner merges; their visual baselines rendered after that merge.
- [ ] The name cleared: the TMview search and, if it is clean, the EUTM filed (`docs/LEGAL.md` §1).
- [ ] Vercel Pro in place, since the free tier forbids commercial use (ADR-0005).
- [ ] Portuguese (pt-PT) and German (de) read by native readers before the language picker shows
      them (`docs/CONTENT-STYLE.md` §8).
- [ ] The owner's first `/review-content` run made, the review pipeline's one manual run
      (`docs/CONTENT-OPS.md` §3).
- [ ] If the simulator ships: its attribution text under every price and chart (ADR-0036).
- [ ] Before the public pages under `/en/` are indexed: a daily production rebuild in place, since they
      render at the build's UTC date (ADR-0045, Deviations of 2026-11-15).
- [ ] The `PUBLIC_INDEXABLE` switch (ADR-0045, Deviations of 2026-11-15), the owner-approved PR that
      opens `/en/` to search, merged after brand's search polish of those pages (`docs/GROWTH.md` §4.1).
- [ ] UK handling implemented as decided in ADR-0029 and tested; the two checks below run once
      from a UK vantage point against the production domain, because the e2e suite only injects
      Vercel's geolocation header (ADR-0045 Risks).
- [ ] The explanatory page proven live: a request from a UK vantage point gets it with 451
      for `/`, `/today` and `/manifest.webmanifest`, and 200 for the legal pages and `security.txt`.
- [ ] An installed PWA opened once from a UK vantage point, so the installed-shell leakage that
      ADR-0029's Reading of 2026-11-05 accepts is measured, not assumed: note what the shell shows
      and what `/api/prices` answers.
- [ ] The service-worker kill switch `apps/web/public/serwist/sw.js` (ADR-0045 §5) removed: the
      Next-era registrations it unregisters are gone once every pre-launch install has opened the
      app again; the launch is that line.
- [ ] Error monitoring receiving events from the preview with PII scrubbing verified (send a test event
      containing an email and an amount; confirm they are redacted).
- [ ] Rate limits on `/api/prices` and `/api/history/:coin` tested with a load script (429 at the edge).
- [ ] Domain: HTTPS with HSTS, `www` redirect, apex serving the app, DNS CAA record.
- [ ] Status and contact: a support email that is read; a way to report a security issue.
- [ ] Analytics decision implemented exactly as in ADR-0028; the cookie-free statement is true.
- [ ] A rollback plan: the previous production deployment can be promoted in Vercel within minutes;
      IndexedDB schema changes are backward compatible for one release: rows of a later
      `schemaVersion` or `encVersion` are left in place, unread, by the previous build, which shows
      the newer-version screen over a newer plan and one line on Today over newer entries (ADR-0019
      readings; `docs/CONTENT-STYLE.md` §3, "Newer version"). The device-local preferences and prices carry no version: the previous build
      reads them ignoring fields it does not know, and a preferences write keeps the fields it
      ignored on the row (`idb-store.test.ts`, the rollback write test). A field narrowed there, or
      removed from the price record, is not backward compatible (the previous build resets the
      preferences and deletes a price record it cannot read) and is shipped like a version bump. A
      field removed from the preferences stays on the row, since the merged write keeps every key
      the build does not know, so the previous build reads its kept value; removing it needs an
      explicit delete (a numbered migration or a write that drops the key). A database version bump (a new
      migration) cannot be: the previous build gets a
      `VersionError` and shows its failure screen. Such a release says so in its PR, ships the
      reader of the new shape one release before the writer where it can, and is rolled forward,
      not back, once deployed.
- [x] Repository visibility decided (`docs/LEGAL.md` §9): public since 2026-11-08, from a fresh
      history with no personal email address (ADR-0051). A licence is still the owner's choice.

## Additional before M3 (accounts)

The first two moved here from the launch list on 2026-11-15, following `docs/ROADMAP.md`'s cuts
from M2 of 2026-10-30: there is no server data before M3, and M3 picks the mail provider (ADR-0026).

- [ ] Backups configured; a restore drill performed and logged in `docs/SECURITY.md`.
- [ ] Email domain authenticated (SPF, DKIM, DMARC) as soon as the provider is picked, so the domain
      ages before the first reminder is sent.
- [ ] RLS tests pass; a manual attempt to read another user's rows fails.
- [ ] Account deletion verified end to end; data export from the server verified.
- [ ] Reminder job idempotency verified (run twice, one email).
- [ ] Store listings reviewed against the copy checklist; screenshots from the real app.

## Release steps

1. Merge the release PR (version bump, changelog); Vercel deploys the merge to production.
2. Tag `vX.Y.Z` on that commit; the tag marks the release and deploys nothing.
3. Smoke test production: open Today, log and delete an entry, export, offline check.
4. Watch error monitoring for one hour.
5. Note anything learned in the document that owns it or a new ADR; `CHANGELOG.md` holds only
   what users see.

## Versioning

Semantic versions for the app. The IndexedDB database has its own integer version, the number of
migrations, raised only with a migration and a test. Each entity's payload has another,
`schemaVersion`, which the stored rows and the export file carry; `docs/DOMAIN.md` §2 owns the
numbers. A payload version rises only with an upgrade path, either an upgrade on read
(`docs/ADR/0019-persistence.md` Readings, "Row shape") or a database migration, and with forward and
rollback read tests. A new payload version is read by one release before any release writes it: rows
and files are written at the lowest version that holds their data (`docs/DOMAIN.md` §2.1). Plans v4,
which record an acknowledgement's language, are read from the release that adds them and first
written by a later release that ships a translation that counsel approved. Every English acknowledgement
stays the v3 plan. The
newer-version screen (`packages/app/src/features/shell/newer-version.tsx`) ships in a release
before any release writes a higher row version, so the build a rollback returns to shows it. Until
the first `vX.Y.Z` tag, a release in this section is a production deployment of a `main` commit,
since every merge to `main` goes to production: a reader is in production before its writer merges.

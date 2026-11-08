# ADR-0037: Scheduled jobs

Status: Accepted · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-backend-security.md` §10–11)

## Context

Three scheduled jobs: reminder emails on each user's buy day in their timezone (M3), the daily append to the price history (M2), and the quarterly jurisdiction review (M2). Facts: Vercel Cron on Hobby runs once a day with ±59 minutes of precision and more frequent expressions fail deployment; on Pro it runs per minute; GitHub Actions schedules are free but imprecise and disabled after 60 days of inactivity on public repositories; Supabase pg_cron with pg_net runs inside the database at any cadence.

## Decision

| Job | Scheduler | Mechanics |
|---|---|---|
| Reminders (M3) | **Vercel Cron on Pro**, hourly, `GET /api/cron/reminders` protected by the `CRON_SECRET` bearer; **pg_cron + pg_net** calling the same route as the free, minute-precise fallback | select `reminder_prefs` with `next_due_at <= now()` (limit 200), insert into `reminder_sends (user_id, period)` and skip when the row existed, send through the `Mailer` port with idempotency key `reminder/<user_id>/<YYYY-MM>`, compute the next due instant in the user's IANA timezone (buy day clamped to the month's last day, local hour 09:00), `maxDuration = 60`. Idempotency lives in the table, so a double run sends nothing twice |
| Price-history append (M2) | **GitHub Actions**, daily at 01:17 UTC plus `workflow_dispatch` | fetch yesterday's close per coin from Kraken public OHLC, cross-check Bitstamp and Coinbase, compute the reference close, validate with zod (monotonic dates, positive prices, no gaps), append to `packages/data/prices/<coin>.json`, commit to `main` when the diff is append-only and valid, otherwise open a PR; `concurrency: price-history`; `permissions: contents: write`; a weekly job re-downloads 365 days and diffs |
| Jurisdiction and module review (M2) | **GitHub Actions**, quarterly (1 January, April, July, October at 06:23 UTC) plus 15 January, plus `workflow_dispatch` with a country filter | `anthropics/claude-code-action@v1` in automation mode with tools confined to `packages/content/**`, opens a PR; details in `docs/CONTENT-OPS.md` |
| Housekeeping | pg_cron nightly | purge tombstones older than 90 days; delete old `net._http_response` rows; recompute `next_due_at` for re-enabled reminders |
| Backups | GitHub Actions nightly at 03:00 UTC | `supabase db dump` → `age` → Cloudflare R2 bucket with EU jurisdiction (`docs/SECURITY.md` §10) |

## Consequences

- Vercel Pro ($20/month) is the launch tier anyway (Hobby forbids commercial use), so hourly cron costs nothing extra.
- Every job is idempotent and safe to run twice; every job has a manual trigger; every job's last run is visible (Actions logs, `cron.job_run_details`, Vercel cron logs).
- Secrets per job are minimal: `CRON_SECRET`, the mail provider key, the Anthropic API key, the R2 write-only token, the database URL for dumps.
- Pinned action versions by commit SHA, kept current by Renovate.

## Disagreement

None.

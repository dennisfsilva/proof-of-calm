# ADR-0026: Email provider

Status: Accepted; its reason restated by ADR-0044 (no promise that data stays in the EU; email stored in the EU stays the better default) · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-backend-security.md` §7, `docs/research/legal-regime.md` §3.2)

## Context

Email carries the two things the product cannot do without in M3: the sign-in code and the monthly reminder that starts the loop. The brief named Resend as the candidate. The research found that Resend's EU region (`eu-west-1`) only changes where mail is sent from; "all account data, including email metadata, logs, and API records, is stored in the United States" (Resend docs, regions page, accessed 2026-10-16), lawful under the EU-US Data Privacy Framework and SCCs but not EU-resident. Supabase, Vercel functions, Upstash and Sentry are all pinned to Frankfurt; email would be the one component whose stored content leaves the EU. Alternatives with EU storage: Scaleway Transactional Email (EU company, Paris; 300 free emails/month then €0.25 per 1,000; API, SMTP, webhooks; younger sending reputation), Amazon SES `eu-west-1` ($0.10 per 1,000; weaker template and webhook ergonomics). Resend: free 3,000/month with a 100/day cap, Pro $20/month for 50,000; idempotency keys; React Email; Supabase documents the SMTP settings.

## Options considered

1. **Resend**, EU sending region, content kept minimal, named as a US sub-processor in the privacy notice.
2. **Scaleway Transactional Email**, EU storage, same features through SMTP and API, a deliverability spike needed.
3. **Amazon SES `eu-west-1`**, EU storage, more plumbing (SNS for bounces, sandbox exit).

## Decision

- A `Mailer` port in the shell (`sendMail({ template, to, idempotencyKey, headers })`) with one adapter per provider, so the provider is a one-file choice.
- **Default provider: Scaleway Transactional Email**, because stored email content staying in the EU matches the product's stated position and avoids a privacy-notice caveat. **Condition:** a two-week deliverability spike at the start of M3 (test inboxes at Gmail, Outlook, iCloud, GMX, Sapo and Proton; DKIM, SPF, DMARC aligned; one-click unsubscribe headers on reminders) must show inbox placement for sign-in codes and reminders. If it fails, the Resend adapter ships instead with the three conditions below.
- **Regardless of provider**, message content is minimal by design: the sign-in email carries the 6-digit code and a click-to-confirm link; the reminder says "It is your plan day" with a link to Today, never amounts, coin names or portfolio figures. This keeps the loop working and the data exposure small.
- Resend conditions if used: named in the privacy notice as a US sub-processor; Pro ($20) as soon as reminders can exceed 100 on one day; idempotency keys `reminder/<user_id>/<YYYY-MM>`.
- Sending domain `mail.<domain>` with separate From addresses for sign-in and reminders; DMARC `p=none` first, `p=quarantine` after a clean month; `List-Unsubscribe` and `List-Unsubscribe-Post` (RFC 8058) on reminders; bounces and complaints disable reminders and show an in-app line.
- Supabase Auth sends through custom SMTP of the chosen provider (the built-in SMTP is limited to team addresses).

## Consequences

- M3 starts with a one-week-per-provider spike; the port keeps the cost of being wrong at a day.
- Idempotency does not depend on the provider: `reminder_sends (user_id, period)` is the source of truth (ADR-0037).
- The privacy notice lists the chosen provider, its entity and location, and the transfer mechanism if any.
- Mail records (SPF, DKIM, DMARC) are set up at launch, before M3, so the domain ages before the first reminder.

## Disagreement

The brief listed Resend; the session prefers an EU-resident provider for the reason above and keeps Resend as the fallback. This is a decision the brief asked the session to make, not a reversal of a fixed one.

## Corrections recorded on 2026-10-18

The decision stands; the text above stays as accepted (`docs/ADR/README.md`). These statements in it
were wrong on 2026-10-18, each with the fact and where it can be checked.

- **Context, "email would be the one component whose stored content leaves the EU".** Vercel's
  primary processing is in the US, Supabase's contracting entity is in Singapore with metadata and
  support outside the region, and Sentry keeps account metadata in the US (`docs/LEGAL.md` §8,
  ADR-0044's context).
- **Decision, "matches the product's stated position".** ADR-0044 decided against that position: no
  promise that data stays in the EU, in copy or in the privacy notice. It keeps this provider because
  email content stored in the EU remains the better default for an EU-first product (ADR-0008),
  without a promise to back.

## Corrections recorded on 2026-10-27

- **Decision, the reminder says "It is your plan day".** The reminder's words now say buy day, as
  every screen and the calendar event do; `docs/CONTENT-STYLE.md` §3 and §7 own them.

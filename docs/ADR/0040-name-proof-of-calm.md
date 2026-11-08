# ADR-0040: The name is Proof of Calm

Status: Accepted · Date: 2026-10-17 · Deciders: owner

## Decision

- In copy: "Proof of Calm". The wordmark: "proof of calm" in lowercase on one line (`docs/DESIGN.md`
  §1). The paid tier: "Plus", or "Proof of Calm Plus" where the full name is needed.
- Domains: proofofcalm.com is the one address and proofofcalm.app redirects to it (`docs/GROWTH.md`
  §2.6).
- Repository and folder: `proof-of-calm`. Workspace packages: the `@proofofcalm/*` scope; the root
  package `proof-of-calm`.
- Files and formats: `proof-of-calm-backup-YYYY-MM-DD.json` with `format: 'proof-of-calm'`, and
  `proof-of-calm-log-YYYY-MM-DD.csv` (`docs/DOMAIN.md`).
- The WebAuthn Relying Party ID is proofofcalm.com (ADR-0030, item 7); product mail is sent from
  mail.proofofcalm.com (ADR-0026).

## Consequences

- Before anything public ships: the TMview search and, if it is clean, the EUTM filing
  (`docs/LEGAL.md` §1). A conflict supersedes this ADR before launch.

# ADR-0011: Honesty is a feature

Status: Accepted · Date: 2026-10-16 · Deciders: owner (before the session); recorded by the planning session · Superseded in part by ADR-0047 (the placement list)

## Context

Crypto products habitually bury risk in a footer and sell certainty in the headline. The owner's
words: "something that does not get anyone hurt". Regulators (ESMA, FCA, CMVM, BaFin) require risk
warnings for promotions; Proof of Calm is not a promotion, but the same plain sentences are the right
design anyway.

## Options considered

1. **Legal footer only.** Compliant-looking, unread.
2. **Risk warnings as part of the design**: in onboarding, beside the numbers they concern, in every
   education module, in the jurisdiction card, in the export.

## Decision

Option 2. Education says plainly: you can lose everything; past cycles do not predict future ones;
holding rules change yearly; the sell window is a discipline device, not a forecast; emergency fund
first; no leverage; scams and self-custody basics. The Red day page (ADR-0013) is this decision made
tangible. Copy rules live in `docs/CONTENT-STYLE.md`; legal placement in `docs/LEGAL.md`.

## Consequences

- A copy-review checklist bans advice-shaped and hype language and is enforced by a lint on message
  files and content.
- Every statistic in Learn has a source, a date and a "last reviewed" field; stale statistics are
  flagged by the review job (ADR-0015).
- The simulator shows the path and the drawdowns, never only the end value.
- Expectations ("if it fails ×0.7, base ×2.3, bull ×3.5") remain the user's own numbers, labelled
  "your own assumptions, not a forecast", as in the prototype.
- Where a country gives no tax benefit, the app says so instead of hiding the hold phase's purpose.

## Disagreement

None.

## Corrections recorded on 2026-10-30

The decision stands; this statement of the text above is not true of the repository, and is
corrected here instead of rewritten (`docs/ADR/README.md`).

- "labelled 'your own assumptions, not a forecast'": no screen shows expectations and no message
  holds that label. A plan started from a template writes none, and a prototype file keeps its own
  numbers unread (`docs/DOMAIN.md` §2.1 and §5).

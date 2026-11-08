# ADR-0013: No news, no sentiment, no alerts; the Red day page instead

Status: Accepted · Date: 2026-10-16 · Deciders: owner (before the session); recorded by the planning session

## Context

The product promise is "no noise". Every tracker in the category adds a news feed, a Fear & Greed
gauge and price alerts because they drive engagement; they also drive the behaviour DCA exists to
remove. The emotional moment that matters, a sharp drop, still needs an answer, otherwise the user
finds it on social media.

## Options considered

1. **Optional panels** (news, sentiment, alerts) off by default. The toggle itself is the invitation.
2. **None of it, decided, not reopened**: no news feed, no world-events panel, no sentiment index on
   any screen, no toggle, no price alerts. The emotional moment is handled by a "Red day" page,
   triggered only by price data the app already has, never by headlines.

## Decision

Option 2. The Red day page shows one calm screen: the plan's current drawdown next to past cycle
drawdowns (content with sources) and the one sentence the user wrote at setup about why they are doing
this. Trigger: a sharp drawdown over the last seven days, or distance from the 90-day high, computed in
the core with tested thresholds (`docs/DOMAIN.md` §3.11). Sentiment indexes get exactly one Learn
module: what they are, why traders watch them, why this app does not show one.

## Consequences

- Today shows at most one banner at a time, prioritised: Red day, then a rule change, then backup
  needed. Never stacked.
- The Red day banner appears once per episode and is dismissible; the page stays reachable from Learn
  ("When the market drops") in its resting state.
- Price-change chips (24 h, 7 d, 30 d, from ATH) on the holdings rows remain: they are data about the
  user's own holdings, not a feed. They are small, tabular and never red-flashing.
- The thresholds are constants with boundary tests; the education track calibrated them against how
  often they fired historically (`docs/research/brand-content-education.md`).
- Feature requests for alerts get a documented "no" with a link to this ADR and the Learn module.

## Disagreement

None.

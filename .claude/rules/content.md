---
paths:
  - "**/packages/content/**"
tier: 2
security: false
proof: golden fixtures for the holding rules and a dated source on every fact
docs:
  - path: docs/JURISDICTIONS.md
    sections: §1 (the honesty rule); §2 (the data model); §6 (rule changes and reviews); §7 for the country touched
  - path: docs/CONTENT-STYLE.md
    sections: §1 (the ten rules); §2 (the ban list); §5 to §7 for modules, templates and emails
  - path: docs/LEGAL.md
    sections: §3 to §6 (the information side, disclaimer placement, the pages, the legal half of the copy review)
  - path: docs/DOMAIN.md
    sections: §4 (country profile); §5 (templates)
  - path: docs/ADR/0009-templates-not-recommendations.md
  - path: docs/ADR/0031-jurisdiction-content-model.md
  - path: docs/ADR/0048-learn-modules-mdx.md
---

# packages/content

Jurisdictions, templates, facts, the coin catalogue, the banned words, their schemas and loaders.
Content is data: nothing here decides behaviour. Tier 2 because the jurisdiction and template files
carry money and dates a person acts on.

Rules and the tool that checks each:

- Every file validates against its schema, with `z.strictObject` so an unknown key fails
  (`pnpm validate:content`; the tests in `src/`).
- Every rule and every cited number has a source with `publisher`, `url`, `accessed` and
  `lastReviewed`; a card more than twelve months past `nextReviewDue` becomes "under review"
  (`docs/JURISDICTIONS.md` §1 and §6; the schema enforces the fields).
- Copy follows the ten rules and the ban list; the banned-words lint runs over every file in EN, DE
  and PT with the allow-list in `style/banned.json`, one reason per phrase (`pnpm validate:content`).
- Templates are starting points with the risk label first, never a recommendation; no ranking, no
  provider named or linked (ADR-0009; `docs/LEGAL.md` §3). Cards stay under 60 words (the validator).
- A holding rule is one of `none`, `days`, `years` with its effect; the core computes the dates, the
  content never states a computed date (`docs/JURISDICTIONS.md` §2 and §5).

Roles: the `counsel` and `brand` agents in `.claude/agents/` review every change here
(`roles.copy` in `.claude/crew.json`); counsel's perimeter breach blocks the merge.

Empirical gate (named in the PR's Proof section): the core's golden fixtures for the holding rules
of the country touched, and the validator's output showing every source dated.

Escape hatch: a word on the ban list that a proper name needs goes on the allow-list with its reason,
in the same PR.

Review: tier 2 (reviewer, then a refuter over every finding, plus counsel and brand).

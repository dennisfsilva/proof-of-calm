---
paths:
  - "**/packages/app/src/lib/adapters/idb*"
  - "**/packages/app/src/lib/store/**"
tier: 2
security: false
proof: forward and rollback read tests
docs:
  - path: docs/DOMAIN.md
    sections: §2 (stored entities); §3.13 (export and import); §7 (migration from the prototype)
  - path: docs/ARCHITECTURE.md
    sections: Functional core, imperative shell; the data flow at the end
  - path: docs/ADR/0019-persistence.md
  - path: docs/ADR/0020-ui-state.md
  - path: docs/ADR/0054-move-between-venues.md
---

# Storage and the store (packages/app)

The idb adapter (rows, migrations, quarantine, outbox, history cache) and the Zustand stores.
A defect here loses a person's plan; this is the tier-2 part of `packages/app`.

Rules and the tool that checks each:

- Rows hold decimal strings and `YYYY-MM-DD` dates, validated with `zod/mini` on every read; a
  record that fails validation is quarantined, never dropped and never repaired silently
  (ADR-0019; `idb-store.test.ts` and the property test beside it).
- A schema change is a numbered migration with a test that reads the previous version's rows forward
  and a test that a build of the previous version still reads rows written by the new one, or the
  change is additive and says so (`docs/DOMAIN.md` §2 names the schema version). A record written
  whole (the preferences) adds a third test: a build of the previous version that rewrites it keeps
  the fields it does not read (reads forward, reads back and rewrites; `idb-store.test.ts`). Removing
  a field from such a record needs an explicit delete (a numbered migration or a write that drops
  the key), because the merged write keeps every key it does not know.
- One transaction per write: the rows and their outbox copies together, then the snapshot, then the
  cross-tab channel (`docs/ARCHITECTURE.md`, data flow). The domain store writes whole entities.
- Export and import stay round-trip exact (`docs/DOMAIN.md` §3.13); the prototype import follows §7.
- The UI store holds nothing that must survive a reload (ADR-0020); drafts go to session storage.

Empirical gate (named in the PR's Proof section): the forward read test and the rollback read test
for the schema version touched, green in `pnpm test`, with their file names.

Escape hatch: none. A migration that cannot be rolled back is a decision: a new ADR in the same PR.

Review: tier 2 (reviewer, then a refuter over every finding; data-safety findings are refuted by
the integrator on multi-branch waves as well).

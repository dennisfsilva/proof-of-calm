---
paths:
  - "**/.claude/skills/**"
tier: 2
security: true
proof: a dry rehearsal of the changed skill by an agent following its text in dry mode, its evidence recorded in the session issue (for review-content, the dry finish's verdict line and render-check's verdict)
docs:
  - path: docs/CONTENT-OPS.md
    sections: §3 (the pipeline around the skill and its security model); §8 (the owner's review, step by step)
  - path: .claude/skills/review-content/SKILL.md
    sections: the frontmatter and every step the change touches (for another skill, its own SKILL.md)
---

# Skills

The skills under `.claude/skills/`: text that steers an agent, and an `allowed-tools` list that
pre-approves tools to run under the owner's identity without asking. The owner starts each by hand,
such as `/review-content` (`docs/CONTENT-OPS.md` §3); no CI job runs one. Tier 2 because a gap in the text
or a broad rule in the list acts in the owner's name (`docs/BUILD-PROMPT.md`, Brief lessons).

Rules and the tool that checks each:

- `allowed-tools` holds the narrowest rule each step needs and no git, gh, WebFetch or WebSearch
  rule: git and GitHub go through a reviewed script (`tools/content-review/propose.ts`), and a fetch
  asks the owner. For review-content, `tools/content-review/propose.test.ts` pins the list exactly,
  so a change to the list changes that test in the same PR (`pnpm test`).
- Every path and command the text names resolves (`pnpm lint:docs` reads every Markdown file under
  `.claude`).
- The text forbids nothing its `allowed-tools` approves, promises no refusal that a tool does not
  make, and points only to examples in a shape the code accepts (the reviewer and the rehearsal).
- A skill that acts for the owner sets `disable-model-invocation: true`, so only the owner's typed
  command starts it (the reviewer).

Security checklist: the reviewer applies it to `allowed-tools` (which files each Edit rule opens,
which commands each Bash rule admits) and to what fetched text could steer (`docs/CONTENT-OPS.md` §3).

Empirical gate (named in the PR's Proof section): a dry rehearsal on the branch, by an agent that
follows the changed skill's text in dry mode, with its evidence recorded in the session issue. For
review-content: the verdict line of `node tools/content-review/propose.ts finish --dry`, and the
verdict of `node tools/content-review/render-check.ts <draft.json>` on the draft the rehearsal wrote.
In a rehearsal clone whose origin is a local folder, run `propose.ts` with `GH_REPO` set to the GitHub
repository (`<owner>/<repo>`), so start's read-only pull-request record call reaches GitHub.

Escape hatch: none for a change to `allowed-tools` without its rehearsal.

Review: tier 2 (reviewer with the security checklist, then a refuter over every finding).

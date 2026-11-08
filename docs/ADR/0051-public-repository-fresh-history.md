# ADR-0051: The repository is public, from fresh history

Status: Accepted · Date: 2026-11-08 · Deciders: the owner

## Context

The repository was private on GitHub Pro (`docs/OWNER-SETUP.md` §1), its visibility open until launch
(`docs/LEGAL.md` §9, `docs/RELEASE.md`). At the pace of 2026-10-27 to 2026-11-05, CI's minutes cost
about $200 a month above the plan's included usage, after ADR-0024's deviation of 2026-11-05 had
removed the preview measurements. GitHub's standard runners are free and unlimited on a public
repository, with 4 CPUs and 16 GB of memory instead of 2 and 8.

The old history could not be published as it was. Its first commits carry a personal address of the
owner's; every pull request keeps its commits reachable, so a rewrite would not remove them, and it
would change every commit hash the documents quote. Making a repository private again does not take
back what it published: clones, forks and archives keep it.

## Options considered

1. **Stay private** and pay for the minutes, or run the jobs on a self-hosted runner: a machine to buy
   or rent, set up and keep running for one project.
2. **Make the existing repository public.** The address, every issue, pull request and CI log become
   public for good.
3. **Publish from fresh history.** A new repository whose history starts with one commit of `main`'s
   tree under the owner's noreply address; the old one stays private as the archive.

## Decision

Option 3, on 2026-11-08. dennisfsilva/proof-of-calm is public and starts at 5db135fd, the tree of the
archive's `main` at ca78c01a. The old repository, renamed dennisfsilva/proof-of-calm-archive, stays
private and read-only with the history, the issues and the pull requests up to #391. The 31 open
issues, the session issue of the open pull request and that pull request moved with new numbers, #1 to
#33; each says where it came from. No licence file: the code can be read, not reused, until the owner
chooses one (`docs/RELEASE.md`).

## Consequences

- An issue or pull request number, a commit hash or a run id in text written before 2026-11-08 refers
  to the archive. Most entries carry their date.
- Never push a commit of the archive's history here: it carries the address, and GitHub's check of a
  push reads only the newest commit.
- Issues, pull requests and CI logs are public: no billing details, personal data or real
  transactions in them. The owner's exchange export becomes a fixture only once anonymised.
- Standard runners cost nothing. Playwright's default of half the CPUs gives each e2e shard two
  workers instead of one.
- The ruleset `main` no longer needs GitHub Pro. CodeQL, secret scanning and the OSV scan's SARIF
  upload (ADR-0025) become possible, each a change of its own.
- Vercel's Git connection and the bypass secret move to the new repository by the owner's hand
  (`docs/OWNER-SETUP.md` §3).

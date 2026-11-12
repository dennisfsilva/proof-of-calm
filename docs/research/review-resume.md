# The content review's branch names and resume: the design check

Research date: **2026-11-12**. Scope: what `node tools/content-review/propose.ts start` and `finish`
do when HEAD is on a review branch, and how a review names its branch. The decision is the resume
policy of issue #144 (below); CONTENT-OPS §3 (`docs/CONTENT-OPS.md`) owns the behaviour, and this
file holds its evidence. The code is `decide` and `reviewNames` in `tools/content-review/resume.ts`,
wired by `tools/content-review/propose.ts`.

## 1. Why a decision was needed

Six review rounds of an earlier resume branch each found a new state in which finish pushed,
re-created or advised the wrong thing. The root cause: every review of one day shared one branch
name, `agent/content-review-<date>`, so finish guessed which pull request belonged to which review
(shared commits, `createdAt`, author dates) and printed advice for each guess. Two findings were open
when the check ran: an open PR's branch could be advised for deletion (deleting the head branch of
an open PR closes it), and a reset to the remote branch was documented without a rule for what
finish then does.

## 2. Method

Two blind designers who had not seen the issue each wrote a policy: designer A from finish's states
in the code, designer B from the owner's journeys. Each built every state in a scratch repository (a
bare origin and a clone, a rebase merge simulated by cherry-pick and the branch then deleted), ran
each candidate criterion and the tool of the day in each state, and used read-only gh calls where
GitHub was needed. Both reached the same core independently: the PR record, read with
`--state all` and fresh after a pruned fetch, decides before any git-only signal. The decided policy
replaced both of their criteria with a narrower one (§4), because a free name per review removes
the guessing their criteria still needed.

Settled in the build (2026-11-12, one read-only call): `gh pr list --head docs/sync-18d --state all`
lists PR #142 as MERGED although GitHub deleted that branch on merge, so a merged review's record
survives its branch.

## 3. The designers' tables

The actions: a = the review landed, go back to origin/main; b = resume; c = it cannot land (the
owner rejected it, or main no longer takes it), go back to origin/main.

### Designer A (from the code's states)

| State | Correct | A's criterion | Evidence |
|---|---|---|---|
| PR open, unchanged | b: print the URL, push nothing | b | record [OPEN]; fresh origin/R = HEAD |
| PR open; main changed k12, one line from the edit | b | b | merge-tree applies (a change at k11, adjacent, conflicts) |
| Rebase-merged, plain, or branch restored | a | a | `gh pr view 142`: MERGED, commits [a3c8eab0]; main holds b9a6de8b, same parent 438eee80 |
| Rebase-merged after main changed nearby, with or without the flip | a | a | the tool of the day: `git cherry` gives `+ 75012892`, and finish re-created the deleted branch; merged PR #114 gives `+ e0015286` |
| Merged with the owner's flip (the normal case) | a | a | merge-tree conflicts; the diff of the review's paths differs |
| Merged; finish run without start (stale origin/main) | a | a | the tool of the day re-created the branch |
| Owner's flip committed locally, then merged | a | a | the tool of the day: "holds 2 commits … save its edits" |
| Merged, later reverted | a | a | merge-tree applies |
| Main changed the same line after the review; PR open, or never pushed | c (owner closes the PR) | c | merge-tree exits 1; the tool of the day resumes and pushes the conflicting branch |
| PR closed; branch kept or deleted | c | c | archive #345: CLOSED, mergedAt null, commits listed; the tool of the day pushes, then creates a PR, because the open list is empty |
| Change landed through another PR (by hand or cherry-pick) | c | c | merge-tree conflicts, or its tree equals origin/main's |
| Pushed, no PR | b: create the PR | b | `gh pr list --head <R> --state all` gives [] |
| Nothing pushed | b: push and create | b | fresh origin/R absent |
| Owner committed on the PR branch on GitHub | b: print the URL, push nothing | b | the tool of the day: push "[rejected] (fetch first)", then "run finish again to resume", the same on every rerun |
| Closed, then a second PR open | b (the open one) | b | record [CLOSED OPEN] |
| Same-day branch name reused after a merged review | b | b | match by commit id gives [] |
| Commit amended after its push | refuse, name the way out | refuse | fresh origin/R and HEAD diverged |
| Pushed, no PR, owner deleted the branch | b (no recorded decision; a judgment call) | b | record [] |
| Offline, or gh logged out | refuse, change nothing | refuse | fetch: "does not appear to be a git repository" (start of the day crashed with a stack trace); gh exit 4 "please run: gh auth login"; gh exit 1 "proxyconnect" |

A's criterion matched the PR record to the review by commit id, then used `git merge-tree
--write-tree origin/main HEAD` for conflicts and already-landed changes. Its rejected candidates and
why:

- `git cherry` (the criterion of the day): wrong on a merge after a nearby change, closed PRs
  (re-proposed), conflicts and changes that landed elsewhere (resumed), the owner's GitHub commit (a
  push loop), and a stale main.
- `merge-base --is-ancestor HEAD origin/main`: misses every rebase merge; GitHub rewrites even an
  up-to-date head (#142).
- The review's paths equal on main: the owner's flip, which every merge has, makes them differ.
- merge-tree alone: resumes a closed PR and re-proposes a reverted review.
- Same author, author date and subject on main: survives the rebase (all 7 of #114's commits
  found) but resumes closed, conflicting and landed-by-hand reviews.
- The best git-only combination: gets the closed PR with its branch kept wrong, which is the normal
  close (GitHub deletes branches only on merge).
- The PR record matched by branch name: same-day name reuse.
- GitHub's `mergeable` field: UNKNOWN on merged #142, MERGEABLE on closed archive #345, absent
  before a PR exists.

### Designer B (from the owner's journeys)

| # State | Correct | B's criterion | Evidence |
|---|---|---|---|
| 1 PR open, main moved elsewhere | b: print URL | b | OPEN; merge-tree of origin/main and origin/B exits 0, tree differs from main |
| 2 Merged by rebase (+flip), branch deleted | a | a | `gh pr list --head docs/sync-18d --state all` gives 142 MERGED, commits [a3c8eab0] |
| 3 Same, main changed a line 2 above the edit before the merge | a | a | MERGED; `git cherry` gives `+`; the tool of the day re-created the deleted branch and reached the gh step |
| 4 Main later changed the review's line, PR open | c, owner closes PR | c | merge-tree exits 1 |
| 5 Same, nothing pushed | c | c | no PR; merge-tree exits 1 |
| 6 PR closed unmerged | c | c | archive #345: CLOSED with commits, branch gone; the tool of the day resumed to the gh step |
| 7 Pushed, no PR | b: create the PR | b | no PR; merge-tree exits 0; ls-remote equals HEAD |
| 8 Nothing pushed | b: push, create | b | no PR; ls-remote empty |
| 9 Owner's commit added on GitHub, PR open | b: no push, print URL | b | `merge-base --is-ancestor HEAD origin/B` exits 0; the tool of the day: push "! [rejected] (fetch first)", loops; after a fetch its force-with-lease advice dry-runs "+ forced update" over the owner's commit |
| 10 Owner's flip committed locally, merged | a | a | MERGED, HEAD in its commits |
| 11 Merged, then reverted | a | a | MERGED; merge-tree exits 0, tree differs from main |
| 12 Whole change landed via another PR | a, owner closes PR | go back (prints "conflict" as the reason) | merge-tree exits 1, from that PR's flip |
| 13 Offline or gh logged out | refuse, touch nothing | refuse | gh exit 1 "dial tcp" (dead proxy), exit 4 "gh auth login"; start of the day: an uncaught "Command failed: git fetch" stack |
| 14 Commit failed after the switch | commit, then decide | b | after the commit: no PR, merge-tree exits 0 |
| 15 Commit amended after its push, PR open | refuse, name the way out | refuse | createdAt matches the OPEN PR; diverged |
| 16 Amended, PR closed, branch deleted | c | c | createdAt matches the CLOSED PR |
| 17 Branch name reused after the first review merged | b | b | #1 is older than HEAD and does not hold it, so no PR; the tool of the day refuses it as "rewritten", and its lease advice gives "! [rejected] (stale info)" |

B's criterion picked the newest PR that holds HEAD or was created after HEAD's author date, then
used merge-tree and the live remote branch. Its rejected candidates and why:

- `git cherry` (the branch of the day): wrong on rows 3 to 6, 9, 12, 13, 16 and 17.
- `git diff --quiet origin/main HEAD -- <paths>`: every real merged review resumes, because the
  flip makes main differ.
- merge-tree alone: closed (6) and reverted (11) both resume.
- Author, author date and subject on main: the closed, conflict and another-PR states all resume.
- The PR record alone: conflicts (4, 5, 12) resume into a PR that cannot merge.
- GitHub's commits-to-pulls endpoint: never lists a closed PR; archive #345 (branch deleted) and
  archive #391 (branch kept) both return `[]`, so a closed review gets a new PR.
- `merge-base --is-ancestor HEAD origin/main`: a rebase merge makes new hashes.

Both designers required the same things the tool lacked: gh in start (only on a review branch) and
in finish before any push; a pruned fetch of the agent/ branches, because the stale tracking ref
caused the push loop and the re-created branches; no stored PR number (GitHub's record survives a
deleted branch, a gitignored file does not survive a clean checkout); and a fake gh for the tests.
On a missing gh, a failed fetch or a logged-out gh both refuse before any switch, commit, push or
PR, with no git-only fallback, since git cannot see that a PR was closed.

## 4. The decided policy (issue #144, 2026-11-12)

- Names: a new review (HEAD at origin/main) takes the first free name of
  `agent/content-review-<date>`, `-2` to `-9` (at most 33 characters). A name is free with no local
  branch, no origin branch after the pruned fetch and no PR in `gh pr list --head <name> --state
  all` (forks dropped). Every PR on a name is then that review's own, so no matching by commit,
  `createdAt` or author date is needed, and the merge-tree checks of both designs go with it.
- On a review branch R, the PR record decides first (the table in §5).
- Invariants: finish pushes only to create origin/R, never to update or delete a remote branch. It
  opens a PR only when R has none. Besides facts it prints only `git switch --detach origin/main`
  (HEAD on R, clean tree) and "run finish again" (after a failed fetch, gh, commit, push or PR
  step). Nothing printed is a reset, a deletion, a force push or "close #N".
- Both open findings become impossible: an open PR yields only its URL and facts, and no earlier
  review shares R; an owner who resets to origin/R anyway meets the open-PR rule at origin/R, clean:
  the URL, exit 0.
- Chosen over the narrower option that kept one name per day: under it, a second review of the same
  day, with the first PR open, still had no way on but deleting that PR's branch.
- Left out on purpose: merge-tree, author-date and commit matching, the earlier-branch block, the
  push-time refusals and any force push. States the designers sent to "c" (a conflict with main, a
  change that landed elsewhere) reach the owner as an open PR whose checks or diff show it; the
  owner closes it, and the closed PR is then done.

## 5. What `decide` does on a review branch

The rules apply in this order; `withinR` means HEAD is origin/R or its ancestor after the pruned
fetch.

| State on R | Steps | Exit | Lines |
|---|---|---|---|
| An open PR, clean tree, `withinR` | none; `needs-owner` added when missing | 0 | the record, the detach line |
| An open PR, dirty tree or HEAD past origin/R | none | 1 | the record, the dirty line or where HEAD stands |
| A merged or closed PR (and none open) | none | 1 | the record, "finish never pushes this branch again", the detach line on a clean tree |
| No PR; edits, no commit, no origin/R | commit, push, PR | 0 | "no pull request yet; finish goes on" |
| No PR; one commit, clean tree, no origin/R | push, PR | 0 | the same |
| No PR; one commit, origin/R equal to HEAD | PR | 0 | the same |
| Anything else | none | 1 | the commits HEAD holds, origin/R, the dirty line |

A failed step prints `<step>: <git's or gh's first line>: run finish again` and exits 1; the next
finish reads the record again and goes on from there. gh adds labels in a second call after it
creates a PR, so a create that fails after the PR exists leaves it without `needs-owner`; the next
finish meets the open-PR rule and adds the label. Start on R prints the same lines and refuses.

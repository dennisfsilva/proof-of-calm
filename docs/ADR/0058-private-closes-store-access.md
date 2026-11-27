# ADR-0058: The job that writes the private closes store runs in a private repository

Status: Accepted · Date: 2026-11-27 · Deciders: the build session of 2026-11-27, from the design of the data-pipeline checkpoint (#13); the private repository was created on the owner's yes of the same day (#23, Needs the owner) · Reads ADR-0036 (its Reading of 2026-11-27: the private store) and ADR-0037 (the daily append)

## Context

ADR-0036's Reading of 2026-11-27 keeps the per-exchange daily closes in a private store that is
private in fact: never the public repository, its Actions logs, artifacts or caches, nor the
deployed site. ADR-0037 runs the daily append on GitHub Actions. This repository is public
(ADR-0051): anyone reads its Actions logs, and anyone can fork it and open a pull request. The job
that writes the store needs a credential that writes where nobody else reads, and nothing a fork, a
branch or a public run does may reach that credential or print a value the store holds.

The store is the private repository dennisfsilva/proof-of-calm-closes, created empty on 2026-11-27
on the owner's yes, which the tracker #23 records under Needs the owner.

## Options considered

1. **(a) A write deploy key whose private half is an environment secret of the public repository,
   the environment limited to `main`.** The job lives beside the code it runs, and one workflow
   file is enough. The secret sits in a repository whose logs are public: one stray print of a
   fetched candle, a diff or an error body publishes values, and the store's contents pass through
   a public run every day. The owner creates the key, the environment and the secret.
2. **(b) The job lives in the private repository.** It checks out the public repository's `main`,
   runs the pipeline and commits with the private repository's own `GITHUB_TOKEN`. Its logs are
   private, the public repository holds no credential, and no fork, branch or public run reaches
   the store. It costs private-repository Actions usage and a second copy of the workflow kept in
   step.

## Decision

Option (b), in four parts.

1. **Where it runs.** The job lives in the private repository dennisfsilva/proof-of-calm-closes. Its
   logs are private, its own `GITHUB_TOKEN` writes the store, and the public repository holds no
   credential for it, so no fork, branch or public run can reach the store. Option (a) is rejected:
   its secret would sit in a repository whose logs are public, so one stray print would publish
   values.

   The cost is about 60 minutes a month of private-repository Actions usage on Linux runners.
   GitHub's billing page for Actions
   (https://docs.github.com/en/billing/concepts/product-billing/github-actions, read on 2026-11-27,
   the page carries no date) lists "$12 USD" of included compute usage a month for GitHub Free,
   "Linux 2-core (x64)" at "$0.006" a minute, and "The use of standard GitHub-hosted runners is
   free" "In public repositories". 60 minutes at that rate is USD 0.36 a month, inside the USD 12.
   The page also says: "If your account does not have a valid payment method on file, usage is
   blocked once you consume the included compute usage."

2. **One workflow, two copies.** The private workflow is a byte-for-byte copy of
   `tools/data/closes-store.yml` (planned: M2), the public file being the template. A step right
   after the checkout compares the two with `cmp` and fails when they differ, so the copy that runs
   is the one reviewed in this repository's pull requests. The private copy changes only by copying
   the public file (the template-copy rule). The job checks out the public repository's `main`
   only, with `persist-credentials: false`, and takes no ref input, so no dispatch runs a branch's
   code with the store's token.

   The session puts the workflow into the private repository with git from a clone under
   `P:\dev\sandbox`: Git Credential Manager's credential can write workflow files, and the gh token
   has no `workflow` scope. When a merged pull request changes the public file,
   `tools/data/closes-store.yml` (planned: M2), the session copies it there the same day, since the
   job fails while the two differ.

3. **Nothing for the owner to create.** No deploy key, environment, secret, fine-grained token or
   GitHub App. One optional owner item, since it touches money: an Actions budget of USD 0 with Stop
   usage on. The job runs within the included usage without it.

4. **Branch evidence from a public dry run.** `.github/workflows/data-dry.yml` (planned: M2) runs
   with `contents: read` and no secrets. It runs the pipeline into `$RUNNER_TEMP` and prints counts
   only; it writes no store, no artifact and no cache. It runs on `workflow_dispatch` and on a push
   to a branch other than `main` that changes `tools/data/**`. Every output line of the pipeline,
   on both streams and on every error path, comes from a closed set of lines holding names, dates,
   statuses and whole-number counts, never a value: no price, close, volume, response body or diff.

## Consequences

- The store's contents never reach a public run. The dry run fetches the public endpoints into a
  temporary folder that ends with its run and prints only the closed set's lines; a test of the
  pipeline holds that set (planned: M2).
- A pull request that changes the pipeline proves itself by the dry run on its branch; the private
  job runs only what `main` holds, so a merged change reaches the store on the next daily run.
- Between a merge that changes the workflow and the copy, the private job fails at the `cmp` step
  and writes nothing; the missed day is a gap that ADR-0037's rules handle.
- ADR-0037's Context names the 60-day disabling of schedules for public repositories; it does not
  reach a job in a private repository.
- The private repository's Actions usage counts against the owner's account. At USD 0.36 a month of
  USD 12 it needs no payment method; if usage ever passes the included amount without one, GitHub
  blocks the job and the store stops growing, which the job's last run date shows.
- The owner's list gains no item beyond the optional budget.

## Disagreement

None.

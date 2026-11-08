// The product's name in one place (docs/BUILD-PROMPT.md, ADR-0040): copy takes it as the {product} value,
// file names take the slug, the holding page takes the wordmark (lowercase, on one line: docs/DESIGN.md
// §1) and absolute URLs take the origin. The backup format marker stays "proof-of-calm" whatever the
// name becomes.
export const BRAND = {
  name: 'Proof of Calm',
  wordmark: 'proof of calm',
  slug: 'proof-of-calm',
  origin: 'https://proofofcalm.com',
} as const;

// The plan-creation disclosure (docs/LEGAL.md §4): the one acknowledged text, `onboarding.disclosure.text`.
// A plan records the version it was started under (docs/DOMAIN.md §2.1), so a new wording is a new version
// and asks again; `features/onboarding/model/disclosure.test.ts` holds each version's words. Here, not in
// onboarding, so the route table reads it without pulling in the onboarding chunk.

/** The version of the acknowledged text that onboarding shows today. */
export const RISK_WORDING_VERSION = 1;

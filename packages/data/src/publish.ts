// The publish switch: one flag per question the owner's reply put to Kraken (ADR-0036, Reading of
// 2026-11-27, questions 1 to 4), all off. A flag changes only by a pull request that cites the yes it
// rests on; until then nothing writes a value into this package and nothing shows one (README.md).
export const PUBLISH = Object.freeze({
  /** 1: the reference closes shown to anyone (charts, simulator, holdings' value, history pages). */
  display: false,
  /** 2: a person's CSV of their own holdings valued at the reference closes on a few dates. */
  csv: false,
  /** 3: the reference closes as a downloadable file in the public repository. */
  repository: false,
  /** 4: days or coins where Kraken's is the only close, so the reference close is Kraken's own. */
  krakenOnly: false,
} as const);

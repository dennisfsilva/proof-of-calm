// The content gate (docs/CONTENT-OPS.md §1, docs/JURISDICTIONS.md §2): every file against its schema,
// the 60-word card, owner review, review dates, https and allow-listed sources, unique source keys that every
// rule's source names, no holding-rule override the core would not apply, split sums, template coins
// that match the coin catalogue, template drawdowns from dated, allow-listed sources, the cycles file's completed
// falls in catalogue order, unique fact keys, the Learn modules (modules-validate.ts), a profile's locale tags and
// percent joiner (percent-validate.ts), the banned-words lint and the no-break hyphen between a number and its unit
// (hyphen-validate.ts) on what users read. Pure: the
// CLI in scripts/validate.ts reads the files. Relative imports name their .ts files, so that Node runs the
// CLI without a build step, as tools/ does.
import { hyphenProblems } from './hyphen-validate.ts';
import { moduleProblems } from './modules-validate.ts';
import { monthsBefore } from './months.ts';
import { localeProblems } from './percent-validate.ts';
import { bannedProblems, type Problem, schemaProblems } from './problem.ts';
import { CoinCatalogueSchema, type ContentCoin } from './schema/coin.ts';
import { CycleDrawdownsSchema } from './schema/cycles.ts';
import type { ContentDrawdown } from './schema/drawdown.ts';
import { FactSchema } from './schema/fact.ts';
import { type CountryProfile, CountryProfileSchema } from './schema/jurisdiction.ts';
import { TemplateSchema } from './schema/template.ts';

export { percentJoiner } from './percent-validate.ts';
export type { Problem } from './problem.ts';
export type ContentFile = { readonly path: string; readonly json: unknown };
export type ValidationOptions = {
  /** YYYY-MM-DD, the build's day. */
  readonly today: string;
  /** sources.allow.json: domains by country, plus `EU` for every country and `facts` for facts. */
  readonly allow: Readonly<Record<string, readonly string[]>>;
  /** The Learn modules as text: MDX, not JSON, so a ContentFile cannot carry one. */
  readonly modules?: readonly { readonly path: string; readonly source: string }[];
};

type Source = { readonly url: string; readonly kind?: string };
type Catalogue = ReadonlyMap<string, ContentCoin>;

const SUMMARY_WORDS = 60;
const PARAGRAPH_SENTENCES = 5;
const STALE_MONTHS = 12;
const COIN_CATALOGUE = /(^|\/)packages\/content\/coins\.json$/;
const CYCLES_FILE = /(^|\/)packages\/content\/cycles\/[^/]+\.json$/;
const FACTS_FILE = /(^|\/)packages\/content\/facts\/[^/]+\.json$/;
const MESSAGES_FILE = /(^|\/)messages\/[^/]+\.json$/;
// The tax-year file's lines, which only a downloaded file carries, keep U+002D (docs/CONTENT-STYLE.md §4).
const SETTINGS_MESSAGES = /(^|\/)features\/settings\/messages\/[^/]+\.json$/;
const TAX_YEAR_FILE = 'data.taxYear.file.';
// The one profile text only the tax-year file copies (docs/CONTENT-STYLE.md §4).
const FILE_ONLY_PROFILE_TEXT = 'lotRuleNote';
const UNAPPLIED = 'holdingRuleOverrides: the early-window check does not apply them yet (docs/JURISDICTIONS.md §2)';

function hostAllowed(url: string, domains: readonly string[]): boolean {
  const host = new URL(url).hostname;
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function sourceProblems(path: string, sources: readonly Source[], domains: readonly string[]): Problem[] {
  const problems: Problem[] = [];
  for (const source of sources) {
    if (!source.url.startsWith('https://')) problems.push({ path, code: 'insecure-source', detail: source.url });
    else if (source.kind !== 'secondary' && !hostAllowed(source.url, domains)) {
      problems.push({ path, code: 'source-not-allowed', detail: source.url });
    }
  }
  return problems;
}

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '');

function jurisdiction(file: ContentFile, options: ValidationOptions): Problem[] {
  const parsed = CountryProfileSchema.safeParse(file.json);
  if (!parsed.success) return schemaProblems(file.path, parsed.error.issues);
  const profile = parsed.data;
  const { path } = file;
  const problems: Problem[] = [];
  if (fileName(path) !== profile.code.toLowerCase()) {
    problems.push({ path, code: 'file-name', detail: `expected ${profile.code.toLowerCase()}.json` });
  }
  if (profile.status.reviewedBy !== 'owner') {
    problems.push({ path, code: 'agent-draft', detail: 'the owner sets reviewedBy to owner after the review' });
  }
  if (profile.status.nextReviewDue < monthsBefore(options.today, STALE_MONTHS)) {
    problems.push({ path, code: 'review-overdue', detail: `nextReviewDue ${profile.status.nextReviewDue}` });
  }
  const words = profile.card.summary60.trim().split(/\s+/).length;
  if (words > SUMMARY_WORDS) problems.push({ path, code: 'summary-too-long', detail: `${words} words` });
  const domains = [...(options.allow[profile.code] ?? []), ...(options.allow.EU ?? [])];
  const sources = [...profile.sources, ...profile.pendingChanges.map((change) => change.source)];
  problems.push(...sourceProblems(path, sources, domains));
  if (!profile.sources.some((source) => source.kind !== 'secondary')) {
    problems.push({ path, code: 'no-primary-source', detail: 'a secondary source is never the only evidence' });
  }
  problems.push(...sourceKeyProblems(path, profile));
  if (profile.holdingRuleOverrides.length > 0) {
    // A tripwire until the early-window check applies overrides (docs/JURISDICTIONS.md §2, docs/ROADMAP.md M2).
    problems.push({ path, code: 'overrides-unapplied', detail: UNAPPLIED });
  }
  for (const [field, text] of profileTexts(profile)) {
    problems.push(...bannedProblems(path, field, text));
    if (field !== FILE_ONLY_PROFILE_TEXT) problems.push(...hyphenProblems(path, field, text));
  }
  problems.push(...localeProblems(path, profile, profileTexts(profile)));
  return problems;
}

/** Each source's key once, and each rule's source key among them. */
function sourceKeyProblems(path: string, profile: CountryProfile): Problem[] {
  const keys = profile.sources.map((source) => source.key);
  const repeated = keys.filter((key, index) => keys.indexOf(key) !== index);
  return [
    ...[...new Set(repeated)].map((key) => ({ path, code: 'source-key-duplicate', detail: key })),
    ...Object.entries(profile.ruleSources)
      .filter(([, key]) => !keys.includes(key))
      .map(([rule, key]) => ({ path, code: 'source-key-unknown', detail: `ruleSources.${rule}: ${key}` })),
  ];
}

/** Every string of a profile that the app shows; source titles are quoted names and stay as published. */
function profileTexts(profile: CountryProfile): [string, string][] {
  const card = profile.card;
  const list = (prefix: string, texts: readonly string[]) =>
    texts.map((text, index): [string, string] => [`${prefix}.${index}`, text]);
  return [
    ['name', profile.name],
    ['card.classification', card.classification],
    ['card.holdingRuleText', card.holdingRuleText],
    ['card.lotRuleText', card.lotRuleText],
    ['card.losses', card.losses],
    ['card.summary60', card.summary60],
    ['filingNote', profile.filingNote],
    ['lotRuleNote', profile.lotRuleNote],
    ...list('card.allowances', card.allowances),
    ...list('card.reporting', card.reporting),
    ...list('card.caveats', card.caveats),
    ...list('holdingRuleConditions', profile.holdingRuleConditions),
    ...card.taxableEvents.map((event, index): [string, string] => [`card.taxableEvents.${index}.note`, event.note]),
    ...card.rates.flatMap((rate, index): [string, string][] => [
      [`card.rates.${index}.label`, rate.label],
      [`card.rates.${index}.value`, rate.value],
      ...(rate.note === undefined ? [] : [[`card.rates.${index}.note`, rate.note] as [string, string]]),
    ]),
    ...profile.holdingRuleOverrides.map((override, index): [string, string] => [
      `holdingRuleOverrides.${index}.note`,
      override.note,
    ]),
    ...profile.pendingChanges.flatMap((change, index): [string, string][] => [
      [`pendingChanges.${index}.title`, change.title],
      [`pendingChanges.${index}.summary`, change.summary],
    ]),
    ...(profile.status.changeNotice === null
      ? []
      : [['status.changeNotice', profile.status.changeNotice] as [string, string]]),
  ];
}

/** Paragraphs are separated by a blank line; a sentence ends at ., ? or ! followed by a space or the end. */
function paragraphProblems(path: string, field: string, text: string): Problem[] {
  return text.split(/\n\s*\n/).flatMap((paragraph, index): Problem[] => {
    const sentences = paragraph
      .trim()
      .split(/(?<=[.?!])\s+/)
      .filter(Boolean).length;
    return sentences > PARAGRAPH_SENTENCES
      ? [{ path, code: 'paragraph-too-long', detail: `${field}, paragraph ${index + 1}: ${sentences} sentences` }]
      : [];
  });
}

/** Shares are plain decimals with up to four places; summed as integers of 0.0001. */
const tenThousandths = (share: string) => {
  const [whole = '0', fraction = ''] = share.split('.');
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0').slice(0, 4) || '0');
};

/** A template's coins as the catalogue lists them, so a plan started from it is priced and shown alike. */
function catalogueProblems(path: string, coins: readonly ContentCoin[], catalogue: Catalogue): Problem[] {
  return coins.flatMap((coin): Problem[] => {
    const listed = catalogue.get(coin.id);
    if (listed === undefined) return [{ path, code: 'coin-not-in-catalogue', detail: coin.id }];
    const same = listed.name === coin.name && listed.geckoId === coin.geckoId && listed.decimals === coin.decimals;
    return same ? [] : [{ path, code: 'coin-differs-from-catalogue', detail: coin.id }];
  });
}

/** More than 0 and at most 100, compared as the decimal string it is. */
const fallInRange = (fall: string) => {
  const [whole = '0', fraction = ''] = fall.split('.');
  const hundred = BigInt(whole) === 100n && !/[1-9]/.test(fraction);
  return /[1-9]/.test(fall) && (BigInt(whole) < 100n || hundred);
};

/**
 * Each fall from allow-listed fact sources (the low's own when it has one), read no later than the review, of a
 * coin among `coins` (a template's own, or the catalogue's tickers; null skips the check), with its low on or after
 * its high and a fall of more than 0 and at most 100 percent. Shared by the templates and the cycles file.
 */
function drawdownProblems(
  path: string,
  rows: readonly ContentDrawdown[],
  coins: ReadonlySet<string> | null,
  facts: readonly string[],
  lastReviewed: string,
): Problem[] {
  const urls = rows.flatMap(({ source, lowSource }) => [source, ...(lowSource === undefined ? [] : [lowSource])]);
  const problems = sourceProblems(
    path,
    urls.map((url) => ({ url })),
    facts,
  );
  rows.forEach(({ accessed, coin, high, low, fall }, index) => {
    const at = `drawdowns.${index}`;
    if (accessed > lastReviewed) {
      const detail = `${at} accessed ${accessed}, last reviewed ${lastReviewed}`;
      problems.push({ path, code: 'accessed-after-review', detail });
    }
    if (low < high) problems.push({ path, code: 'drawdown-low-before-high', detail: `${at} high ${high}, low ${low}` });
    if (coins !== null && !coins.has(coin)) {
      problems.push({ path, code: 'drawdown-unknown-coin', detail: `${at} ${coin}` });
    }
    if (!fallInRange(fall)) problems.push({ path, code: 'drawdown-fall-out-of-range', detail: `${at} fall ${fall}` });
  });
  return problems;
}

/** A whole percent, as the bars label it; the range is the shared check's. */
const wholePercent = (fall: string) => /^\d+$/.test(fall);

/**
 * The completed cycles' falls (docs/EDUCATION.md §2 and §6): the shared drawdown checks against the catalogue's
 * tickers, whole percents, rows in catalogue order (the catalogue is in ticker order) then by high, each coin's
 * high once, the owner's sign-off and the one file name. The reviewer still recomputes every fall from its source.
 */
function cycles(file: ContentFile, catalogue: Catalogue | null, options: ValidationOptions): Problem[] {
  const parsed = CycleDrawdownsSchema.safeParse(file.json);
  if (!parsed.success) return schemaProblems(file.path, parsed.error.issues);
  const { drawdowns, lastReviewed, reviewedBy } = parsed.data;
  const { path } = file;
  const problems: Problem[] = [];
  if (fileName(path) !== 'drawdowns') problems.push({ path, code: 'file-name', detail: 'expected drawdowns.json' });
  if (reviewedBy !== 'owner') {
    problems.push({ path, code: 'agent-draft', detail: 'the owner sets reviewedBy to owner after the review' });
  }
  const tickers = catalogue === null ? null : new Set(catalogue.keys());
  problems.push(...drawdownProblems(path, drawdowns, tickers, options.allow.facts ?? [], lastReviewed));
  drawdowns.forEach(({ coin, high, fall }, index) => {
    const at = `drawdowns.${index}`;
    if (!wholePercent(fall)) problems.push({ path, code: 'drawdown-fall-not-whole', detail: `${at} fall ${fall}` });
    const previous = drawdowns[index - 1];
    if (previous !== undefined && (previous.coin > coin || (previous.coin === coin && previous.high > high))) {
      const detail = `${at} ${coin} ${high} after ${previous.coin} ${previous.high}`;
      problems.push({ path, code: 'cycles-out-of-order', detail });
    }
    if (drawdowns.slice(0, index).some((row) => row.coin === coin && row.high === high)) {
      problems.push({ path, code: 'cycles-duplicate', detail: `${at} ${coin} ${high}` });
    }
  });
  return problems;
}

function template(file: ContentFile, catalogue: Catalogue | null, options: ValidationOptions): Problem[] {
  const parsed = TemplateSchema.safeParse(file.json);
  if (!parsed.success) return schemaProblems(file.path, parsed.error.issues);
  const value = parsed.data;
  const { path } = file;
  const problems: Problem[] = [];
  if (fileName(path) !== value.id) problems.push({ path, code: 'file-name', detail: `expected ${value.id}.json` });
  if (value.reviewedBy !== 'owner') {
    problems.push({ path, code: 'agent-draft', detail: 'template names and copy need the owner’s sign-off' });
  }
  const coins = new Set(value.coins.map((coin) => coin.id));
  const shares = Object.entries(value.split);
  for (const [coin] of shares) {
    if (!coins.has(coin)) problems.push({ path, code: 'split-unknown-coin', detail: coin });
  }
  const total = shares.reduce((sum, [, share]) => sum + tenThousandths(share), 0n);
  if (total !== 1_000_000n) problems.push({ path, code: 'split-sum', detail: 'the shares must sum to exactly 100' });
  if (catalogue !== null) problems.push(...catalogueProblems(path, value.coins, catalogue));
  problems.push(...drawdownProblems(path, value.drawdowns, coins, options.allow.facts ?? [], value.lastReviewed));
  problems.push(...paragraphProblems(path, 'explanation', value.explanation));
  for (const field of ['name', 'oneLine', 'riskLabel', 'explanation'] as const) {
    problems.push(...bannedProblems(path, field, value[field]));
  }
  return problems;
}

/** Unique tickers and CoinGecko ids, in ticker order: a neutral order that ranks no coin, and stable diffs. */
function coinCatalogue(file: ContentFile): Problem[] {
  const parsed = CoinCatalogueSchema.safeParse(file.json);
  if (!parsed.success) return schemaProblems(file.path, parsed.error.issues);
  const { path } = file;
  const problems: Problem[] = [];
  const ids = new Set<string>();
  const geckoIds = new Set<string>();
  parsed.data.forEach((coin, index) => {
    const previous = parsed.data[index - 1];
    if (previous !== undefined && previous.id > coin.id) {
      problems.push({ path, code: 'coin-order', detail: `${coin.id} after ${previous.id}` });
    }
    if (ids.has(coin.id)) problems.push({ path, code: 'duplicate-coin', detail: coin.id });
    if (geckoIds.has(coin.geckoId)) problems.push({ path, code: 'duplicate-gecko-id', detail: coin.geckoId });
    ids.add(coin.id);
    geckoIds.add(coin.geckoId);
    problems.push(...bannedProblems(path, `${index}.name`, coin.name));
  });
  return problems;
}

/** The catalogue among the files, when it parses; templates are checked against it. */
function catalogueIn(files: readonly ContentFile[]): Catalogue | null {
  const file = files.find((candidate) => COIN_CATALOGUE.test(candidate.path));
  const parsed = file === undefined ? null : CoinCatalogueSchema.safeParse(file.json);
  return parsed?.success === true ? new Map(parsed.data.map((coin) => [coin.id, coin])) : null;
}

function facts(file: ContentFile, options: ValidationOptions, seen: Set<string>): Problem[] {
  const { path } = file;
  if (!Array.isArray(file.json)) return [{ path, code: 'schema', detail: 'expected a list of facts' }];
  const problems: Problem[] = [];
  file.json.forEach((item, index) => {
    const parsed = FactSchema.safeParse(item);
    if (!parsed.success) {
      problems.push(...schemaProblems(`${path}#${index}`, parsed.error.issues));
      return;
    }
    const fact = parsed.data;
    if (seen.has(fact.key)) problems.push({ path, code: 'duplicate-key', detail: fact.key });
    seen.add(fact.key);
    if (fact.reviewedBy !== 'owner') {
      problems.push({ path, code: 'agent-draft', detail: 'the owner sets reviewedBy to owner after the review' });
    }
    problems.push(...sourceProblems(path, [{ url: fact.source }], options.allow.facts ?? []));
  });
  return problems;
}

function strings(value: unknown, prefix: string): [string, string][] {
  if (typeof value === 'string') return [[prefix, value]];
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => strings(child, prefix === '' ? key : `${prefix}.${key}`));
}

function messages(file: ContentFile): Problem[] {
  const fileOnly = (field: string) => SETTINGS_MESSAGES.test(file.path) && field.startsWith(TAX_YEAR_FILE);
  return strings(file.json, '').flatMap(([field, text]) => [
    ...bannedProblems(file.path, field, text),
    ...(fileOnly(field) ? [] : hyphenProblems(file.path, field, text)),
  ]);
}

/** Each fact's `lastReviewed` by key, from all the files first, so that file order does not matter. */
function factDates(files: readonly ContentFile[]): ReadonlyMap<string, string> {
  const items = files.flatMap((file) => (FACTS_FILE.test(file.path) && Array.isArray(file.json) ? file.json : []));
  const parsed = items.flatMap((item) => {
    const fact = FactSchema.safeParse(item);
    return fact.success ? [fact.data] : [];
  });
  return new Map(parsed.map((fact) => [fact.key, fact.lastReviewed]));
}

/** Every problem in the given files and modules; the empty list is a pass. */
export function validateContent(files: readonly ContentFile[], options: ValidationOptions): Problem[] {
  const seen = new Set<string>();
  const catalogue = catalogueIn(files);
  const context = { facts: factDates(files), today: options.today };
  const problems = files.flatMap((file): Problem[] => {
    if (/(^|\/)packages\/content\/jurisdictions\/[^/]+\.json$/.test(file.path)) return jurisdiction(file, options);
    if (/(^|\/)packages\/content\/templates\/[^/]+\.json$/.test(file.path)) return template(file, catalogue, options);
    if (COIN_CATALOGUE.test(file.path)) return coinCatalogue(file);
    if (CYCLES_FILE.test(file.path)) return cycles(file, catalogue, options);
    if (FACTS_FILE.test(file.path)) return facts(file, options, seen);
    if (MESSAGES_FILE.test(file.path)) return messages(file);
    return [{ path: file.path, code: 'unknown-file', detail: 'not a content or message file' }];
  });
  return [...problems, ...(options.modules ?? []).flatMap((module) => moduleProblems(module, context))];
}

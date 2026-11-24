import { createDateFormatter } from '@proofofcalm/app/lib/format';
import { localesFor } from '@proofofcalm/app/lib/i18n';
import learnMessages from '@proofofcalm/app/messages/en/learn.json';
import type { CalendarDate } from '@proofofcalm/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import messages from '../../messages/en.json';
import { ProviderFields } from './contact';
import { emptyOwnerValue, legalValues, OPTIONAL_OWNER_FIELDS } from './legal';
import { loadSiteData, renderSitePage } from './render';
import { RISK_LINKS } from './risk-links';

const ASSETS = ['<link rel="stylesheet" crossorigin href="/assets/app-1.css">'];
const data = await loadSiteData('2026-11-15' as CalendarDate);

type LegalName = 'terms' | 'privacy' | 'risk' | 'cookies' | 'contact';
const LEGAL = ['terms', 'privacy', 'risk', 'cookies', 'contact'] as const;

/** React's escapes undone, so a test reads the copy as a person does. */
const unescaped = (html: string) =>
  html.replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&lt;', '<');

/** The page's main element. */
function main(name: LegalName): string {
  const html = renderSitePage(name, ASSETS, data);
  return unescaped(html.slice(html.indexOf('<main'), html.indexOf('</main>')));
}

/** Markup as the text a person reads: tags dropped, spaces joined. */
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

/** One section of a legal page by its id. */
const pageSection = (name: LegalName, page: string, id: string) =>
  page.match(new RegExp(`<section[^>]*aria-labelledby="${name}-${id}-title"[^>]*>(.*?)</section>`))?.[1] ?? '';

/** One section of the Risk page by its id. */
const section = (page: string, id: string) => pageSection('risk', page, id);

type Owner = typeof messages.legal.owner;
type OwnerState =
  | { state: 'draft' }
  | { state: 'filled' }
  | { state: 'half'; placeholders: string[]; missing: string[] };

/** A value that holds this anywhere still holds a placeholder, whole or as a fragment left inside a filled value. */
const PLACEHOLDER = '[Owner:';
const optional = (field: string) => (OPTIONAL_OWNER_FIELDS as readonly string[]).includes(field);

/**
 * Where the owner file stands: every field a placeholder (the draft), every field filled but the optional ones, which
 * may be empty (signed), or anything between, with the fields still holding a placeholder and the required ones left
 * empty.
 */
function ownerState(owner: Owner): OwnerState {
  const entries = Object.entries(owner);
  const placeholders = entries.filter(([, value]) => value.includes(PLACEHOLDER)).map(([field]) => field);
  if (placeholders.length === entries.length) return { state: 'draft' };
  const missing = entries
    .filter(([field, value]) => emptyOwnerValue(value) && !optional(field))
    .map(([field]) => field);
  return placeholders.length === 0 && missing.length === 0
    ? { state: 'filled' }
    : { state: 'half', placeholders, missing };
}

/** A signed owner file of fictional values, with the three optional fields empty. */
const FILLED: Owner = {
  name: 'Filled name',
  legalForm: 'Filled legal form',
  address: 'Rua Exemplo 1, 0000-000 Exemplo',
  email: 'hello@example.test',
  nif: 'Filled NIF',
  privacyEmail: 'privacy@example.test',
  dsaEmail: 'dsa@example.test',
  mailHost: 'Filled mail host',
  date: 'Filled date',
  vat: '',
  register: '',
  manager: '',
};

/** Identity data that only the owner's values may put on a page. */
const IDENTITY: readonly (readonly [string, RegExp])[] = [
  ['e-mail', /[\w.+-]+@[\w-]+\.[a-z]{2,}/i],
  ['street address', /\b(Rua|Avenida|Travessa|Largo|Stra(ss|ß)e|Street)\b/],
  ['postal code', /\b\d{4}-\d{3}\b/],
  ['9-digit number', /\b(PT ?)?\d{9}\b/],
];

/**
 * The legal pages' text with `owner` as the owner file and `stray` appended to Contact's DSA paragraph, the messages
 * restored after.
 */
function legalTexts(owner: Owner, stray = ''): (readonly [LegalName, string])[] {
  const saved = { ...messages.legal.owner };
  const dsa = messages.legal.contact.dsa.p1;
  Object.assign(messages.legal.owner, owner);
  messages.legal.contact.dsa.p1 = dsa + stray;
  try {
    return LEGAL.map((name) => [name, text(main(name))] as const);
  } finally {
    Object.assign(messages.legal.owner, saved);
    messages.legal.contact.dsa.p1 = dsa;
  }
}

/**
 * Each page and kind of identity data it shows outside the owner's values, as `page: kind`. The pages render with one
 * neutral token in place of every value the owner filled (an empty one stays empty, so Contact drops its line as it
 * would), so what the values hold can neither add to the text read nor hide anything in it.
 */
function strayIdentity(owner: Owner, stray = ''): string[] {
  const neutral = Object.fromEntries(
    Object.entries(owner).map(([field, value]) => [field, emptyOwnerValue(value) ? value : 'Owner value']),
  ) as Owner;
  return legalTexts(neutral, stray).flatMap(([name, page]) =>
    IDENTITY.filter(([, pattern]) => pattern.test(page)).map(([kind]) => `${name}: ${kind}`),
  );
}

describe('the Risk disclosure (docs/LEGAL.md §5)', () => {
  const risk = messages.legal.risk;

  it("ends the Risk lead with LEGAL §4's sentence", () => {
    expect(risk.lead.endsWith('Use only money you will not need for years.')).toBe(true);
    expect(risk.lead).not.toContain('afford to lose');
    expect(text(main('risk'))).toContain('you could lose all the money you put in. Use only money you will not need');
  });

  it('no page keeps the pre-launch placeholder', () => {
    expect(messages.legal).not.toHaveProperty('placeholder');
    for (const name of LEGAL) {
      expect(text(main(name)), name).not.toMatch(/published in full before|not available and collects nothing/);
    }
  });

  it("has §5's sections in order under one h1", () => {
    const page = main('risk');
    expect(page.match(/<h1/g) ?? []).toHaveLength(1);
    const ids = [...page.matchAll(/<section[^>]*aria-labelledby="risk-([a-z]+)-title"/g)].map((match) => match[1]);
    expect(ids).toEqual(['dca', 'falls', 'custody', 'status', 'tax', 'scams', 'register', 'adviser', 'warnings']);
    const titles = [...page.matchAll(/<h2 id="risk-([a-z]+)-title"[^>]*>(.*?)<\/h2>/g)].map((match) => match[2]);
    const sections = risk as unknown as Record<string, { title: string } | undefined>;
    expect(titles).toEqual(ids.map((id) => sections[id ?? '']?.title));
  });

  it('lists every row of the cycles file with coin, fall, high and low', () => {
    const falls = section(main('risk'), 'falls');
    const rows = [...falls.matchAll(/<tbody>(.*?)<\/tbody>/g)].flatMap((match) =>
      [...(match[1] ?? '').matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map((row) => text(row[1] ?? '')),
    );
    expect(data.learn.falls.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(data.learn.falls.length);
    // The cycles file (packages/content/cycles/drawdowns.json): Bitcoin's first fall, Solana's, and Chainlink's last.
    for (const row of [
      /^BTC[-−]94 ?%8 Jun 201122 Nov 2011$/,
      /^ETH[-−]94 ?%13 Jan 201814 Dec 2018$/,
      /^SOL[-−]97 ?%6 Nov 202129 Dec 2022$/,
      /^LINK[-−]91 ?%10 May 202110 Jun 2023$/,
    ]) {
      expect(
        rows.some((candidate) => row.test(candidate)),
        String(row),
      ).toBe(true);
    }
  });

  it('sets the source line and past-performance line right after the falls', () => {
    const falls = section(main('risk'), 'falls');
    const after = text(falls.slice(falls.indexOf('</table>')));
    expect(after).toMatch(/^ ?.*intraday highs and lows in US dollars, 8 Jun 2011 to 10 Jun 2023; the falls are/);
    expect(after.trim().endsWith(learnMessages.module.pastPerformance)).toBe(true);
  });

  it('carries the register sentence as §5 words it', () => {
    const register = section(main('risk'), 'register');
    expect(text(register)).toContain(
      "ESMA keeps a public register of the providers authorised under MiCA: ESMA's register of crypto-asset service providers. Check any provider there before sending money. Proof of Calm is not a provider and is not listed.",
    );
    const esma = RISK_LINKS.find((link) => link.id === 'esma-register');
    expect(register).toContain(`href="${esma?.url}"`);
    expect(risk.links['esma-register']).not.toMatch(/authoris|authoriz|regulat|licens|approved/i);
  });

  it('links each official warning over https with its accessed date', () => {
    const page = main('risk');
    expect(RISK_LINKS.map((link) => link.id)).toEqual([
      'esma-register',
      'cmvm',
      'bafin',
      'fca',
      'esas-pt',
      'esas-de',
      'esas-en',
    ]);
    for (const link of RISK_LINKS) {
      expect(link.url, link.id).toMatch(/^https:\/\/[^/]+\.[^/]+\//);
      expect(link.accessed, link.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // CMVM's page on crypto-assets itself, not the portal's front page; the menu's other address shows no content.
    expect(RISK_LINKS.find((link) => link.id === 'cmvm')?.url).toBe(
      'https://investidor.cmvm.pt/PInvestidor/Content?Input=67395E0A73EB6228177F6CF6F359650D89FBDF569843E496EFE3D18D38B626E7',
    );
    const date = createDateFormatter(localesFor('en', null).ui);
    const warnings = section(page, 'warnings');
    const items = [...warnings.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((match) => match[1] ?? '');
    expect(items).toHaveLength(RISK_LINKS.length - 1);
    for (const [index, link] of RISK_LINKS.slice(1).entries()) {
      const item = items[index] ?? '';
      expect(item, link.id).toContain(`href="${link.url}"`);
      expect(item, link.id).toContain('target="_blank"');
      expect(item, link.id).toContain('rel="noopener noreferrer"');
      expect(text(item), link.id).toContain(risk.links[link.id]);
      expect(text(item), link.id).toContain(text(date(link.accessed)));
    }
    expect(text(section(page, 'register'))).toContain('15 Nov 2026');
  });

  it("states ADR-0039's promise in the scams section and never says the app buys", () => {
    const scams = text(section(main('risk'), 'scams'));
    expect(scams).toContain(
      "Proof of Calm never offers you an investment and never asks for your seed phrase, a private key, an exchange's API key or login, or for coins or money to buy them.",
    );
    expect(scams).toContain("any request for your seed phrase, a private key, or an exchange's API key or login.");
    expect(text(section(main('risk'), 'dca'))).toContain('With a plan, you buy a set amount on a set schedule');
    expect(risk.dca.p1).not.toMatch(/A plan buys/);
  });

  // A card under review shows neither its rule's words nor its sources (docs/JURISDICTIONS.md §1).
  it('states what the app shows on tax, except while a rule is under review', () => {
    const tax = text(section(main('risk'), 'tax'));
    expect(tax).toContain(
      'Proof of Calm shows the holding rules of the countries it covers, with their sources and the date each was last reviewed, except while a rule is under review.',
    );
    expect(tax).toContain('Where your plan has a holding rule, Proof of Calm shows the date each purchase passes it.');
    expect(tax).toContain('This is information, not tax advice.');
  });

  it('throws for risk without site data', () => {
    expect(() => renderSitePage('risk', ASSETS)).toThrow('risk renders from the loaded site data');
  });

  // falls.p1 points at the table ("Each row below…"), so the page is never built without rows.
  it('throws for risk when the site data has no falls', () => {
    const empty = { ...data, learn: { ...data.learn, falls: [] } };
    expect(() => renderSitePage('risk', ASSETS, empty)).toThrow('risk needs the falls of the cycles file');
  });
});

describe('the Cookie-free statement (docs/LEGAL.md §5)', () => {
  it('has one h1 and names the display settings the browser keeps and the drafts', () => {
    const page = main('cookies');
    expect(page.match(/<h1/g) ?? []).toHaveLength(1);
    const stored = page.split(/(?<=\.) /).find((sentence) => sentence.includes('display settings'));
    expect(stored).toBeDefined();
    for (const setting of ['theme', 'reduced motion', 'chart range', "the Log's view", 'the language']) {
      expect(stored).toContain(setting);
    }
    // Production offers one language and stores none, so the statement names it only where there is a choice.
    expect(stored).toContain('the language, where the app offers a choice');
    expect(page).toContain('until the tab closes');
    expect(page).toContain('Delete everything in Settings clears these too.');
    expect(text(page)).toContain(
      'There is no cookie banner, because the browser keeps nothing for tracking, advertising, or analytics.',
    );
  });

  it('says there is no banner after the lead, then lists what the browser keeps, how visits are counted and the references', () => {
    const page = main('cookies');
    const paragraphs = page.match(/<p>[^<]*<\/p>/g) ?? [];
    const starts = [
      'Proof of Calm sets no advertising or analytics cookies',
      'There is no cookie banner',
      'Your browser keeps your plan',
      'Your browser also keeps your display settings',
      'Your browser keeps a record of the entries you deleted',
      'It keeps a random identifier for this device',
      'Your browser keeps form drafts until the tab closes',
      'Proof of Calm does not count visits itself',
      'The rules on storing information in your browser',
    ];
    const first = paragraphs.findIndex((p) => p.includes(starts[0] ?? ''));
    expect(paragraphs.slice(first, first + starts.length).map((p) => p.slice(3, 3 + 60))).toEqual(
      starts.map((start) => expect.stringContaining(start)),
    );
    // The Privacy notice is linked right after how visits are counted.
    const visits = page.indexOf('does not count visits itself');
    expect(page.indexOf(href('/privacy'))).toBeGreaterThan(visits);
    expect(page.indexOf(href('/privacy'))).toBeLessThan(page.indexOf('The rules on storing information'));
  });

  // Everything M1 keeps in the browser, each in a sentence that also says why (§5's outline).
  it.each([
    ['your plan, your entries, and the prices fetched for your coins', 'so the app works offline'],
    ["the app's files", 'so the app opens offline'],
    ['the pages you opened for up to 7 days and the latest price data for 24 hours', 'so they show offline'],
    ['the date each copy was saved', 'so copies past their limit are cleared'],
    ['your display settings', 'so they stay as you chose them'],
    ['the dates of your last JSON backup and your last change', 'so the app can remind you to export a copy'],
    ['the banners you dismissed or that showed once', 'so they stay hidden'],
    ['the date of your last annual review', 'so the next review shows when it is due'],
    ['the entries you deleted on this device', 'so an import with Add missing entries only cannot bring them back'],
    [
      'the plan and entries that Replace everything removed, in full and marked as deleted',
      'so that import cannot bring the entries back either',
    ],
    ['These records stay', "until you choose Delete everything in Settings or clear this site's data in your browser"],
    ['a random identifier for this device', 'so your changes apply in the order you made them'],
    ['It does not leave this browser', 'no request and no backup carries it'],
    ['a copy of each change to your plan and entries', 'for syncing between devices, which the app does not offer'],
    [
      'any stored data that failed its check when read',
      'set aside instead of deleted, so a failed check erases nothing',
    ],
    ['form drafts until the tab closes', 'so what you typed comes back when you return to the form'],
    ['the tab keeps a short note until it closes', 'so it reloads only once'],
    ['does not count visits itself', 'the request totals of its host, Vercel, with no script and no identifier'],
    ['There is no cookie banner', 'nothing for tracking, advertising, or analytics'],
    [
      'Article 5(3) of the ePrivacy Directive',
      "Article 5 of Portugal's Lei 41/2004, Germany's § 25 TDDDG, and the UK's PECR",
    ],
  ])('names %s and why', (item, why) => {
    const sentence = main('cookies')
      .split(/(?<=\.) |<\/?p>/)
      .find((s) => s.includes(item));
    expect(sentence).toBeDefined();
    expect(sentence).toContain(why);
  });
});

/** The ids of a page's sections, in order. */
const sectionIds = (name: LegalName) =>
  [...main(name).matchAll(new RegExp(`<section[^>]*aria-labelledby="${name}-([a-z]+)-title"`, 'g'))].map(
    (match) => match[1],
  );

const href = (path: string) => `href="${path}"`;

describe('the launch drafts of Terms, Privacy and Contact (docs/LEGAL.md §5)', () => {
  it("Terms has §5's launch sections in order and none of the account or Plus sections", () => {
    const page = main('terms');
    expect(page.match(/<h1/g) ?? []).toHaveLength(1);
    expect(sectionIds('terms')).toEqual([
      'who',
      'what',
      'age',
      'countries',
      'data',
      'use',
      'prices',
      'risk',
      'changes',
      'liability',
      'law',
    ]);
    expect(text(page)).not.toMatch(/\bPlus\b|passkey|sign-in code|subscription|withdrawal form|refund|\btips?\b/i);
    expect(text(page)).toContain(
      'Proof of Calm is not registered with or supervised by any financial supervisor, and no investor-compensation or deposit-protection scheme covers crypto-assets.',
    );
    expect(text(page)).toContain(
      "Proof of Calm never offers you an investment and never asks for your seed phrase, a private key, an exchange's API key or login, or for coins or money to buy them.",
    );
    expect(text(page)).toMatch(/CoinGecko/);
    expect(page).toContain(href('/risk'));
  });

  it('Terms links Contact after who provides it and after the law, and states liability without a cap', () => {
    const page = main('terms');
    expect(pageSection('terms', page, 'who')).toContain(href('/contact'));
    const law = pageSection('terms', page, 'law');
    expect(law).toContain(href('/contact'));
    expect(text(law)).toContain(
      'Proof of Calm charges for nothing yet. Before it charges for anything, the Contact page will name the alternative dispute resolution entities a consumer can use.',
    );
    expect(text(pageSection('terms', page, 'liability'))).toContain(
      'Proof of Calm is liable under the law that applies to these terms. Nothing in these terms limits your rights as a consumer.',
    );
    expect(text(page)).not.toMatch(/no further|stays that way/);
    expect(text(pageSection('terms', page, 'changes'))).toContain(
      'Proof of Calm costs nothing to use, and no part of it that costs nothing today will later carry a charge.',
    );
  });

  it('Terms says who provides it in two sentences and what the app keeps and shows', () => {
    const page = main('terms');
    const owner = messages.legal.owner;
    expect(text(pageSection('terms', page, 'who'))).toContain(
      `${owner.name}, ${owner.legalForm}, ${owner.address}, provides Proof of Calm. The Contact page lists every way to reach them.`,
    );
    const what = text(pageSection('terms', page, 'what'));
    expect(what).toContain('keeps each purchase you log with its date, amount, and units');
    expect(what).toContain('it shows what their holding rules mean for each purchase, with their sources.');
  });

  it('Privacy links Contact after the controller and names what the requests and the mail host keep', () => {
    const page = main('privacy');
    expect(pageSection('privacy', page, 'controller')).toContain(href('/contact'));
    expect(text(pageSection('privacy', page, 'device'))).toContain(
      "Your plan, your entries, and your settings stay in your browser on this device. Proof of Calm's server sees only the coin and currency each price request names.",
    );
    expect(text(pageSection('privacy', page, 'requests'))).toContain(
      'These requests name at most a coin and a currency. They carry no identifier that Proof of Calm sets, and none of your entries, amounts, or dates.',
    );
    expect(text(pageSection('privacy', page, 'requests'))).toContain(
      'with no page, internet address, or browser name.',
    );
    const hosting = pageSection('privacy', page, 'hosting');
    expect(text(hosting)).toContain(
      "It receives each request your browser sends, with its internet address and browser name. Vercel keeps the host's runtime logs for up to 1 day. Anything else Vercel keeps follows its own privacy notice.",
    );
    expect(text(hosting)).toContain(
      "The legal basis is Proof of Calm's legitimate interest in serving the site and protecting it from abuse",
    );
    const notice = hosting.match(/<a [^>]*href="https:\/\/vercel\.com\/legal\/privacy-policy"[^>]*>(.*?)<\/a>/);
    expect(notice?.[1]).toBe("Vercel's privacy notice");
    expect(notice?.[0]).toContain('target="_blank"');
    expect(notice?.[0]).toContain('rel="noopener noreferrer"');
    const mail = text(pageSection('privacy', page, 'mail'));
    expect(mail).toContain(
      `its mail host, ${messages.legal.owner.mailHost}, keeps your e-mail address and your messages for 24 months after the last one, to answer follow-up questions (GDPR art. 6(1)(b) and (f)).`,
    );
    expect(mail).not.toContain('30 days');
    expect(text(pageSection('privacy', page, 'rights'))).toContain('You can also object to its use.');
    expect(text(pageSection('privacy', page, 'rights'))).toContain(
      'Proof of Calm makes no automated decision about you and builds no profile of you.',
    );
  });

  it('Privacy names Vercel and CoinGecko and links the Cookie-free statement', () => {
    const page = main('privacy');
    expect(page.match(/<h1/g) ?? []).toHaveLength(1);
    expect(text(page)).toContain('Vercel');
    expect(text(page)).toContain('CoinGecko');
    expect(text(page)).not.toMatch(/Supabase|Sentry|Resend/);
    expect(page).toContain(href('/cookies'));
    expect(text(page)).toContain(
      "Proof of Calm never offers you an investment and never asks for your seed phrase, a private key, an exchange's API key or login, or for coins or money to buy them.",
    );
  });

  it('the owner file is either every field a placeholder or every required field filled', () => {
    const owner = messages.legal.owner;
    expect(Object.keys(owner)).toEqual([
      'name',
      'legalForm',
      'address',
      'email',
      'nif',
      'privacyEmail',
      'dsaEmail',
      'mailHost',
      'date',
      'vat',
      'register',
      'manager',
    ]);
    expect(OPTIONAL_OWNER_FIELDS).toEqual(['vat', 'register', 'manager']);
    expect(['draft', 'filled']).toContain(ownerState(owner).state);
    const pages = LEGAL.map((name) => text(main(name))).join(' ');
    for (const [field, value] of Object.entries(owner)) if (value !== '') expect(pages, field).toContain(value);
  });

  it('refuses a half-filled owner file and a filled one missing a required field', () => {
    const draft = Object.fromEntries(Object.keys(FILLED).map((field) => [field, `[Owner: ${field}]`])) as Owner;
    expect(ownerState(draft)).toEqual({ state: 'draft' });
    expect(ownerState(FILLED)).toEqual({ state: 'filled' });
    expect(
      ownerState({ ...FILLED, vat: 'Filled VAT', register: 'Filled register', manager: 'Filled manager' }),
    ).toEqual({
      state: 'filled',
    });
    expect(ownerState({ ...draft, name: 'Filled name' })).toEqual({
      state: 'half',
      placeholders: Object.keys(draft).filter((field) => field !== 'name'),
      missing: [],
    });
    expect(ownerState({ ...FILLED, vat: draft.vat })).toEqual({ state: 'half', placeholders: ['vat'], missing: [] });
    expect(ownerState({ ...FILLED, email: '', date: ' ' })).toEqual({
      state: 'half',
      placeholders: [],
      missing: ['email', 'date'],
    });
  });

  it('refuses a filled owner file with a placeholder left inside a value', () => {
    expect(ownerState({ ...FILLED, address: 'Rua Exemplo 1, [Owner: postal code] Exemplo' })).toEqual({
      state: 'half',
      placeholders: ['address'],
      missing: [],
    });
    expect(ownerState({ ...FILLED, name: 'Filled name [Owner:' })).toEqual({
      state: 'half',
      placeholders: ['name'],
      missing: [],
    });
  });

  it('Contact drops the line of an empty optional field', () => {
    const fields = messages.legal.contact.fields;
    const markup = (owner: Owner) =>
      unescaped(renderToStaticMarkup(createElement(ProviderFields, { values: legalValues(owner) })));
    const full = markup({ ...FILLED, vat: 'Filled VAT', register: 'Filled register', manager: 'Filled manager' });
    expect(full.match(/<dt/g) ?? []).toHaveLength(8);
    expect(full).toContain(`<dt class="text-ink-2">${fields.vat}</dt><dd>Filled VAT</dd>`);
    const noVat = markup({ ...FILLED, vat: '', register: 'Filled register', manager: 'Filled manager' });
    expect(noVat.match(/<dt/g) ?? []).toHaveLength(7);
    expect(noVat.match(/<dd/g) ?? []).toHaveLength(7);
    expect(noVat).not.toContain(fields.vat);
    expect(noVat).toContain(`<dt class="text-ink-2">${fields.register}</dt><dd>Filled register</dd>`);
    const signed = markup(FILLED);
    expect(signed.match(/<dt/g) ?? []).toHaveLength(5);
    for (const field of OPTIONAL_OWNER_FIELDS) expect(signed).not.toContain(fields[field]);
    // A required field keeps its line whatever it holds; the owner-file test refuses it empty.
    expect(markup({ ...FILLED, email: '' }).match(/<dt/g) ?? []).toHaveLength(5);
  });

  it('Contact drops the line of an optional field that holds only spaces', () => {
    const fields = messages.legal.contact.fields;
    const spaces: Owner = { ...FILLED, vat: ' ', register: '  ', manager: 'Filled manager' };
    expect(ownerState(spaces)).toEqual({ state: 'filled' });
    const markup = unescaped(renderToStaticMarkup(createElement(ProviderFields, { values: legalValues(spaces) })));
    expect(markup.match(/<dt/g) ?? []).toHaveLength(6);
    expect(markup).not.toContain(fields.vat);
    expect(markup).not.toContain(fields.register);
    expect(markup).toContain(`<dt class="text-ink-2">${fields.manager}</dt><dd>Filled manager</dd>`);
  });

  it("no page shows an e-mail, street address, postal code or 9-digit number outside the owner's values", () => {
    expect(strayIdentity(messages.legal.owner)).toEqual([]);
    expect(strayIdentity(FILLED)).toEqual([]);
  });

  it("a short owner value cannot hide an e-mail, street address, postal code or 9-digit number outside the owner's values", () => {
    const short: Owner = { ...FILLED, vat: 'a', register: '-', manager: '1' };
    const stray = ' Write to help@calm-mail.pt at Rua Nova 2, 1000-001 Lisboa, NIF 123456789.';
    expect(strayIdentity(short, stray)).toEqual([
      'contact: e-mail',
      'contact: street address',
      'contact: postal code',
      'contact: 9-digit number',
    ]);
  });

  it('Contact keeps #security and the security.txt link', () => {
    const page = main('contact');
    expect(page).toMatch(/<section id="security"[^>]*>/);
    expect(page).toContain(href('/.well-known/security.txt'));
    expect(text(page)).toContain('No authorisation scheme applies; no supervisory authority.');
    expect(sectionIds('contact')).toEqual(['provider', 'dsa', 'privacy']);
    expect(page.indexOf('id="security"')).toBeGreaterThan(page.indexOf('contact-privacy-title'));
  });
});

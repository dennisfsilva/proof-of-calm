# ADR-0029: UK visitors

Status: Accepted; the proxy as the mechanism superseded by a static Vercel route (ADR-0045) · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/legal-regime.md` §1)

## Context

Since 8 October 2023 the UK financial-promotions regime (FSMA 2000 s21, SI 2023/612, FCA PS23/6) treats any invitation or inducement to engage in investment activity in qualifying cryptoassets as a financial promotion when it is "capable of having an effect in the UK", whoever communicates it and from wherever. Breach is a criminal offence. FG24/1 (March 2024) says disclaimers that a service is "not for UK persons" are worthless without real controls and endorses geo-location tools; the HTX case (proceedings issued 21 October 2025, announced 10 February 2026) shows the FCA asking Apple and Google to pull apps from UK stores and treating "new UK users blocked" as insufficient while existing users could still see promotions. Under PERG 8.4 the free planner, the education and the Red day page (historic data is "never" an inducement on its own) are defensible, but named templates such as "Bitcoin only, never sell" sit close to a recommendation, and the product's own marketing copy is the real exposure. Serving UK users would also require a UK GDPR Article 27 representative (still in force as of 30 September 2026) and UK consumer-law work. The new UK regulated-activities regime (SI 2026/102; PS26/11–13 of 30 June 2026) starts on 25 October 2027 and removes the MLR-registered promotions route; it creates no "advising on qualifying cryptoassets" regulated activity, and a planner with no exchange links, order routing or API trading does not "arrange".

## Options considered

| Option | Consequences |
|---|---|
| (i) **Block UK visitors** and show a plain explanatory page | Removes the s21 exposure (geo-location is the control the FCA itself names), the UK representative duty and UK consumer-law work; loses the UK audience; VPN leakage is acceptable because the service is demonstrably not directed at the UK |
| (ii) Allow UK users with templates and any promotional framing hidden, neutral tools plus education plus an FCA-style risk summary | Defensible on PERG 8.4, but one persuasive sentence in a module, email or changelog becomes a strict-liability offence; requires a UK representative, a copy-lint gate on every release and a UK legal opinion |
| (iii) Allow everything | Not advisable: named asset templates plus marketing copy is where the inducement argument is strongest |

## Decision

Option (i) at launch. Implementation:

- The proxy reads Vercel's request geolocation (`x-vercel-ip-country`); for `GB` every route except the explanatory page, the legal pages and `security.txt` renders "Proof of Calm is not available in the United Kingdom yet" with no persuasive content, no sign-up and no app shell (the local-only mode is withheld too, because the app itself is the communication).
- No UK storefront listing for the store apps (M3); no UK-specific marketing; no "not for UK persons" disclaimer anywhere, because the control is the block, not the sentence.
- The UK jurisdiction profile stays in `packages/content` and in the country library (information for non-UK readers and for the day option (ii) is adopted).
- Re-evaluation triggers, any of: 500 blocked UK visits in a month; FCA guidance on educational or planning tools under the 2027 regime; a decision to add UK-specific content. Moving to option (ii) requires, first: the copy-lint gate (`docs/CONTENT-STYLE.md`) in CI, a UK GDPR representative, neutral template names for UK users (the research suggests "single-asset plan", "fixed-interval plan", "cycle-aware plan" with the asset chosen by the user), and a short UK legal opinion on the template copy. Re-check in Q3 2027 regardless.

## Consequences

- The Playwright suite includes a `GB` geolocation scenario (header injected) asserting the explanatory page and the absence of the app shell and templates.
- Copy everywhere is written as if the UK rules applied anyway (no inducements), which also serves the MiCA information-versus-advice line (`docs/LEGAL.md`).
- The jurisdiction research for the UK is not wasted: it is the content for the library and the basis for option (ii).

## Readings recorded by the build session

The decision stands; these are the choices its text left open, made while implementing it on
2026-10-17.

- **451, not 200.** The explanatory page answers with status 451 (unavailable for legal reasons,
  RFC 7725), `Cache-Control: no-store`, the CSP and the security headers.
- **Built in the proxy.** The page is a few lines of HTML the proxy returns, not a rendered route,
  so no script, app shell or template reaches the visitor (the Playwright GB scenario counts the
  scripts: none). One style element under the request's CSP nonce gives it the brand's paper and
  ink in each theme, and the viewport matrix checks it like every other page.
- **Pages and the manifest.** The block covers every page request and the web app manifest
  (`/manifest.webmanifest`, which `app/manifest.ts` serves and the proxy matcher also matches). It
  leaves out the legal pages, `security.txt`, the files outside the matcher (API routes, build
  assets, the service worker, icons) and prefetch requests, which the matcher skips
  (`next-router-prefetch`, `purpose: prefetch`; curl on 2026-10-19 shows no proxy CSP on them). The
  API carries nothing persuasive, and the app that calls it is never served to a UK visitor; keeping
  it outside the proxy also keeps the CDN serving `/api/prices` without a function or proxy
  invocation.
- **2026-10-20, the two bullets above describe the proxy, which ADR-0045 replaced.** The 451 page,
  its status and headers stand; it is now built at build time as `dist/not-available.html`, and a
  static route in `apps/web/vercel.json` on Vercel's geolocation header answers it for every document
  request but the legal pages, `security.txt` and the static files, with no proxy, no nonce and no
  function invocation (ADR-0045 §4 and its Deviations). Its one style element carries a hash in the
  static CSP instead of a nonce (ADR-0045 §3). The manifest is now a built file,
  `manifest.webmanifest`, and stays blocked; the API and the static files stay outside the route.
  The request tests, the manifest and every app route among them: `apps/web/e2e/uk-block.spec.ts`.
- **2026-11-05, the installed worker** (#270). The M1 stage audit found on 2026-10-27 that an
  installed shell never meets the 451 route: the worker serves it from Cache Storage
  (`apps/web/src/sw.ts`, ADR-0033 Readings 2026-10-20), and its online requests, `/api/prices` and
  `/api/history/:coin`, are exempt by the Reading of 2026-10-17 above. Counsel read ADR-0029,
  ADR-0033, ADR-0045, ADR-0019, `docs/LEGAL.md` §2 to §6, `docs/research/legal-regime.md` §1.4, the
  worker, the route and the function. Counsel's reading: the test the documents apply is direction
  and real controls, not zero reach. The install happened where the service is directed. The shell
  carries no inducement by `docs/LEGAL.md` §3 and §6, and the content shown is the person's own
  plan. Decided: the leakage is accepted as leakage of the kind Option (i) accepts, recorded here so
  that the "blocked" of `docs/LEGAL.md` §2 stays honest. No cache, plan or entry is ever deleted on
  a geolocation signal. "Delete everything" with its Undo is the person's act alone (ADR-0019
  Readings 2026-10-21). A false positive from a VPN, a roaming SIM or the header would delete the
  person's data. The API stays outside the block, as the Reading of 2026-10-17 decided. The app has
  nothing to switch off, because its own `/api` never answers 451: the session issue #270 wrote the
  app showing the UK page on a 451 from `/api` as a default, and no document or code holds it. A
  later Reading that puts the API inside the block shows the Not-available page as a full page,
  never a banner or a modal (the Decision above, "no app shell"; `docs/LEGAL.md` §5). Its words are
  those of `docs/CONTENT-STYLE.md` §3, and the data stays untouched. Weighed and not built: the GB
  route also matching `/api/(.*)`, the worker relaying a 451 to its window clients and the shell
  leaving for the page; set aside because it splits the installed app into bounced online and usable
  offline, revises the CDN Reading of 2026-10-17, and adds a worker version that reaches only the
  shells that take it, for a residual smaller than the VPN leakage already accepted. "An installed
  app opened in the UK" joins the Decision's re-evaluation triggers beside the 500 blocked visits in
  a month; it is recorded here because the text above this heading does not change.
  `docs/RELEASE.md` measures the leakage once from a UK vantage point before launch.

## Disagreement

None; the brief asked the session to decide between geo-aware onboarding without promotional content and blocking UK sign-ups. Blocking is the more conservative choice and the one the regulator's own guidance names as a real control; the planned second step keeps the door open.

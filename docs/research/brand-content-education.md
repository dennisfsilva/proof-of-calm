# Proof of Calm: brand, content and education research

Date: 2026-10-16. Prepared for the planning session. Everything below is research input; items marked **Recommendation** are proposals, not decisions.

Conventions in this document: every external fact carries a source URL, publisher, publication date where shown, the accessed date (all accessed 2026-10-16 unless stated) and a confidence level (high = read on a primary data page or computed from primary data; medium = reputable secondary source; low = unverified). Numbers computed by us carry the method and the data endpoint so they can be reproduced. Prices are USD daily candles in UTC days unless stated; "today" is 2026-10-16 and today's candle is incomplete.

Data bundled for this report (downloaded 2026-10-16 from public, keyless endpoints; scripts in the session scratchpad, to be moved into the repo with the simulator):

| Series | Endpoint | Coverage |
|---|---|---|
| BTC/USD daily OHLC | `https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400` | 2011-08-18 to 2026-10-16 (5,539 rows) |
| BTC/USD, ETH/USD, LINK/USD, SOL/USD daily | `https://api.exchange.coinbase.com/products/<pair>/candles?granularity=86400` | BTC from 2015-07-20, ETH from 2016-05-18, LINK from 2019-06-27, SOL from 2021-06-17 |
| ETH/USD daily | Bitstamp, as above | 2017-08-16 to 2026-10-16 |
| Halving block timestamps | `https://mempool.space/api/block-height/<h>` then `/api/block/<hash>` | blocks 210000, 420000, 630000, 840000; tip 971,733 at access |

---

## 0. Summary of recommendations

- Text family IBM Plex Sans (self-hosted, weights 400/500/600, no italics); monospace IBM Plex Mono 400; no display family. Numbers: `Intl` everywhere, U+2212 minus via `formatToParts`, `×` for multiples, tabular lining figures in every column, slashed or dotted zero only in mono.
- Colour: warm paper #f7f4ef / charcoal #151412 with four surfaces each; inks at 15.7:1, 6.2:1 and 3.6:1 (light) and 16.2:1, 9.6:1 and 5.5:1 (dark) on the background, every pair above the targets on every surface; gold accent kept for "now" and primary actions only, never as light-mode text, no amber "late" state; positive #146720 / #74c878 and negative #b63039 / #f16f78 always with a sign; coin colours validated for CVD in both modes (BTC #cb5a00 / #f4873a, ETH #5635b6 / #886acf, SOL #007c60 / #50d0b4, LINK #287ccf / #59aff4); charts cap at four series.
- 4 px spacing scale; radii 14 / 8 / 4 / full; durations 120 / 180 / 240 ms with Material's standard curves, everything reducible to 1 ms under `prefers-reduced-motion`; flat elevation with one overlay shadow; focus ring 2 px ink with 2 px offset; 44 × 44 px targets.
- Logo: the marked loop (an open ring closed by the accent dot), wordmark lowercase in the text face; full icon set listed in section 4.
- Voice: ten sourced rules; microcopy for every state in the brief; banned-words table.
- Education facts: every number in section 6 carries a source, a date and a confidence level; the DCA statistics are our own computation from bundled exchange data and nothing else is cited for them; the current cycle is described as "the 2025 high", not "the peak".
- Simulator: whole-path presentation with drawdown shading and a start-date sensitivity view; Red day state on a 7-day fall of 10% or more, or 30% or more below the 90-day high.
- Reading time words ÷ 230, rounded up; "Last reviewed" date on every module, "Next review due" on the tax module, build fails on content older than 18 months.

---

## 1. Typography

Method. Every claim below was checked on 2026-10-16 against the font's repository (README, licence, releases), the google/fonts repository (METADATA.pb and the committed TTFs), the Google Fonts CSS2 API (the `latin` woff2's `Content-Length`), Fontsource, and the font binaries themselves opened with fontTools (OS/2 metrics, `fvar` axes, `hmtx` advances, the GSUB feature list with each font's own feature names, zero shapes classified from outline geometry). "Measured" below means read from the binary (high confidence for presence, absence and metrics; medium for zero-shape classification). Popularity ranks are from `https://fonts.google.com/metadata/fonts`.

Three findings that change the picture:

1. **The Google Fonts CSS API strips most OpenType features.** Served `latin` woff2 files keep only `ccmp locl liga calt frac numr dnom pnum tnum rvrn`; `zero`, every `ssXX` and `cvXX`, `case`, `lnum`/`onum`, `smcp` are gone (measured on 16 served files; Vercel documents the same for Geist: "font-feature-settings: Google Fonts — no", https://vercel.com/font). Fontsource's "google" packages ship byte-identical files (medium). Any slashed zero or I/l disambiguation therefore requires self-hosting the foundry's own build.
2. **Three families are tabular by default.** Source Sans 3 (all digits 472/1000, and `$ € £ ¥ + −` also 472), IBM Plex Sans (digits 600, `+ − =` 600, `€` 625, `$` 598; it has neither `tnum` nor `pnum`) and Hanken Grotesk's Google Fonts build (560 for digits and currency). Among `tnum` fonts only Public Sans makes currency symbols tabular; Inter makes space, punctuation and `+ − × = < >` tabular but not currency; Geist, Figtree, Manrope, Archivo and Reddit Sans make digits only.
3. **U+202F NARROW NO-BREAK SPACE, which CLDR uses as the French group separator, has no glyph in 9 of the 12 text families** (Geist, Instrument Sans, Figtree, Manrope, Public Sans, Archivo, Hanken, Schibsted, Reddit Sans); Inter, IBM Plex Sans and Source Sans 3 have it. A missing glyph falls back to another font and breaks the column.

### 1.1 Evaluation

Text families (size = Google Fonts API Latin subset, upright variable woff2; x-height = OS/2 sxHeight ÷ UPM; all licences SIL OFL 1.1 as read in the repositories):

| Family | Version | Axes | Figures and `tnum` | Zero and I/l/1 | Latin woff2 | x-height (px at 13 px) | Distinctiveness |
|---|---|---|---|---|---|---|---|
| Inter 4 (rsms) | v4.1, 2024-11-16; GF serves 4.001 | opsz 14–32, wght 100–900; italics separate | proportional default; `tnum` covers digits, spaces, brackets, `+ − × ÷ = < >`, not `€ $` | `zero` slashed; `ss02` slashed 0 + serifed I + tailed l; `cv05`, `cv08`; default I and l identical bars | 71.2 KiB (opsz+wght), 47.1 (wght) | 0.546 (7.1) | GF rank #4; the default SaaS face; rsms: "Should I use Inter from Google Fonts? No, unless you have no other choice" |
| Geist (Vercel) | v1.8.1, 2026-10-16; GF 1.800 | wght 100–900; italics since 1.5.0 (2025-05-28) | `tnum` digits only | no `zero`; slashed 0 only via `ss09` (also changes 1) or `ss11`; l tailed, I plain | 28.7 KiB | 0.530 (6.9) | #84 but the Next.js/Vercel ecosystem default |
| IBM Plex Sans | GF variable 3.201 since 2025-01-10; upstream `@ibm/plex-sans-variable` 0.2.0, 2025-06-25 | wdth 75–100, wght 100–700; italics separate | digits always tabular and lining, no feature needed | `zero` and `ss03` slashed, `ss04` dotted; default I serifed, l tailed (best default separation of the sans) | 64.0 KiB (wdth+wght), 44.6 (wght) | 0.516 (6.7) | #51; IBM's corporate face, common in developer tools, "engineered" voice |
| Source Sans 3 (Adobe) | 3.052R, 2023-04-04 (repo README still says "Pro") | wght 200–900; italics separate | tabular lining by default (`pnum` opts out), currency and operators tabular too | `zero`/`cv19` slashed, `ss10` dotted, `ss01` serifed I; default l tailed, I plain | 28.2 KiB | 0.478 (6.2), the lowest | #47; Adobe's long-standing UI face |
| Instrument Sans | 1.000, 2023 | wdth 75–100, wght 400–700 | `tnum` digits + operators | no `zero`; I and l near-identical | 56.0 KiB (wdth+wght) | 0.510 (6.6) | #105; agency brand face |
| Figtree | 2.0.3, 2023-04-05 | wght 300–900; italics | `tnum` digits only | no `zero`; `ss02` disambiguation; I/l identical by default | 19.7 KiB, smallest | 0.500 (6.5) | #37; friendly geometric |
| Manrope | 4.505 | wght 200–800; no italics | `tnum` digits only | no `zero`, no alternates; I and l identical thin bars | 24.3 KiB | 0.540 (7.0) | #27 |
| Public Sans (USWDS) | 2.001, 2022-05-11; README: "not currently being actively developed or maintained" | wght 100–900; italics; variable "experimental" | `tnum` digits and `$ € £ ¥ , .` | no `zero` at all; l tailed | 26.2 KiB | 0.517 (6.7) | #76; US government face |
| Archivo (Omnibus-Type) | 2.001 (FONTLOG 2020-12-14) | wdth 62–125, wght 100–900; italics | near-tabular default (575–577), `tnum` 579; currency not | `zero` slashed (upstream file only); I/l identical | 88.0 KiB (wdth+wght), 34.1 (wght) | 0.526 (6.8) | #44; the prototype's face; grotesque character |
| Hanken Grotesk | GF 3.013 (README says 2.001) | wght 100–900; italics | tabular lining by default including currency | no `zero` in the GF build; l tailed | 33.9 KiB | 0.493 (6.4) | #126; rare |
| Schibsted Grotesk | 1.100, 2023-03 | wght 400–900; italics | `tnum` digits + `# % , . : ;` | `zero` present but produces no visible change (medium); default I serifed, l tailed | 45.7 KiB | 0.527 (6.9) | #92; Nordic media face, rare in SaaS |
| Reddit Sans | 1.014 | wght 200–900; italics | `tnum` digits; currency not | `zero` slashed; `cv15` barred I; l tailed | 40.9 KiB | 0.518 (6.7) | #453 on GF but unmistakably Reddit's |

Monospace:

| Family | Version | Axes | Zero and 1/l/I | Latin woff2 | x-height | Notes |
|---|---|---|---|---|---|---|
| Geist Mono | 1.8.1 (GF 1.701) | wght 100–900; italics | slashed zero by default; `ss09` un-slashed; ligatures opt-in (`ss11`) since 1.7.0 | 22.6 KiB | 0.530 | pairs with Geist |
| JetBrains Mono | 2.304, 2023-01-14 (GF 2.211) | wght 100–800; italics | dotted zero by default ("The zero has a dot inside. The letter 'O' does not."), `zero` → slashed; "1, l, and I are all easily distinguishable" | 39.5 KiB | 0.550, highest of all 16 | code ligatures on by default via `calt`; set `"calt" 0` in a finance UI |
| IBM Plex Mono | GF static 2.3; upstream `@ibm/plex-mono-variable` 1.0.0, 2026-07-30 (wght 100–700) | GF static only | dotted zero by default; `zero`/`ss03` slashed; `ss04` plain | 14.4 KiB per static weight | 0.516 | pairs with Plex Sans |
| Commit Mono | 1.143, 2023-12-28; not on Google Fonts | static 400/700 (+ variable from the site) | slashed zero by default; `cv07` dotted; smart kerning/case sets | 47.0 KiB (static 400) | 0.540 | distinctive, niche |

Sources: github.com/rsms/inter and rsms.me/inter; github.com/vercel/geist-font and vercel.com/font; github.com/IBM/plex (releases) and google/fonts commit 8409f03 (IBM Plex Sans 3.201); github.com/adobe-fonts/source-sans and blog.typekit.com/2012/08/02/source-sans-pro; github.com/Instrument/instrument-sans; github.com/erikdkennedy/figtree; github.com/googlefonts/manrope; github.com/uswds/public-sans; github.com/Omnibus-Type/Archivo; github.com/marcologous/hanken-grotesk; github.com/schibsted/schibsted-grotesk; github.com/reddit/redditsans; github.com/JetBrains/JetBrainsMono and jetbrains.com/lp/mono; github.com/eigilnikolajsen/commit-mono and commitmono.com; fonts.googleapis.com/css2 and fonts.gstatic.com for sizes; fonts.google.com/metadata/fonts for ranks. All accessed 2026-10-16, confidence high unless marked.

### 1.2 Recommendation

**Text family: IBM Plex Sans, self-hosted from IBM's own build.** It is the only family in the list that is right at 13–14 px before any CSS: digits and operators are tabular by default, the capital I has serifs and the l has a tail, so `Il1` never collapses in a table or an ID; `zero`, `ss03` and `ss04` add a slashed or dotted zero where wanted; the width axis (wdth 75–100) buys room in phone tables without touching alignment; it is OFL, maintained (variable release 2025-06), and its slightly squared, engineered forms set on warm paper read as a technical document rather than a SaaS dashboard, which is the brief. Costs, stated plainly: moderate distinctiveness (IBM's face, rank #51, common in developer tools), no weights above 700 (not needed), no `opsz` axis (acceptable at our sizes, see below), and 45–64 KiB per upright file. Load weights 400, 500 and 600 only; no italics (emphasis is weight, consistent with the GOV.UK rule against italics and the prototype).

Runner-up: **Source Sans 3**, the purest tabular-money default (even `€` is digit-width) at 28 KiB with the same zero and serifed-I options, if a softer, more anonymous voice is preferred; its 0.478 em x-height needs 15 px in tables on phones, which is the reason it is second. Inter is technically excellent (the best tabular operator set, the only `opsz` axis) and is rejected on the distinctiveness criterion alone; Geist for the same reason plus the missing `zero` feature; Archivo (the prototype) because its I and l are identical and the width file is 88 KiB; Manrope and Instrument Sans because they cannot separate I from l and have no zero; Public Sans because it is unmaintained and has no zero; Hanken and Schibsted are credible rare choices but ship no working zero and, in Schibsted's case, nothing below 400; Reddit Sans is Reddit's.

Why self-host: the Google Fonts API and the Fontsource "google" packages strip `zero`, `ss03/ss04` and `case`; the upstream variable TTF subset to Latin with `pyftsubset --layout-features+=tnum,zero,ss03,ss04,case,lnum` keeps them, and pinning the wdth axis with `fonttools varLib.instancer` when width is not used brings the file back to about 45 KiB. Self-hosting also avoids shipping visitors' IP addresses to a third party on every page view, which matters for an app that promises no tracking.

**Display family: no.** Headings in Plex Sans 600 at 28–40 px with letter-spacing −0.01 em are enough; a second family is decoration. If a display cut is ever wanted, IBM ships Plex Sans Condensed under the same licence, which is the same voice, narrower.

**Monospace: IBM Plex Mono**, one weight (400) self-hosted from IBM's build, for addresses, hashes, CSV previews and code: dotted zero by default (`ss03` for slashed), the same x-height and stroke logic as the sans, 14 KiB. JetBrains Mono is the better mono in isolation (highest x-height, explicit 1/l/I design) and is the alternative if the pairing is dropped; turn off its `calt` ligatures. Geist Mono and Commit Mono are fine fonts tied to other identities.

**Optical size.** Only Inter in the list carries an `opsz` axis (CSS Fonts 4 asks browsers to set `opsz` to the used font size automatically); DM Sans on Google Fonts (opsz 9–40) is the other open option if that ever becomes a requirement. Plex Sans has one design for all sizes and was drawn for UI; at 13–16 px text and headings no larger than 40 px this is not a loss.

### 1.3 Number typography rules

These were checked by running Node 24.20 (ICU 78.3, CLDR 48, Unicode 17) on 2026-10-16; the strings below are the exact `Intl` output, with the code points of spaces and signs.

| Locale | `Intl.NumberFormat(..., {style:"currency", currency:"EUR"})` for 12345.67 | Spaces | Negative (`signDisplay:"exceptZero"`) |
|---|---|---|---|
| pt-PT | `12 345,67 €` | group U+00A0, before € U+00A0 | `-12 345,67 €` |
| de-DE | `12.345,67 €` | before € U+00A0 | `-12.345,67 €` |
| en-IE | `€12,345.67` | none | `-€12,345.67` |
| fr-FR / fr-BE | `12 345,67 €` | group U+202F, before € U+00A0 | `-12 345,67 €` |
| it-IT / es-ES | `12.345,67 €` / `12.345,67 €` | before € U+00A0 | `-12.345,67 €` |
| nl-BE | `€ 12.345,67` | after € U+00A0 | `€ -12.345,67` (sign after the symbol) |
| de-AT | `€ 1.234,56` | after € U+00A0 | `-€ 1.234,56` |

Notes from the same run: pt-PT does not group four-digit numbers (`1234,56 €`, CLDR `minimumGroupingDigits` 2), so the brief's example "1 234,56 €" is what CLDR gives only from five digits. Percent: de-DE and fr-FR put a space before `%` (`-12,3 %`, U+00A0), pt-PT, it-IT and en-IE do not (`12,3%`). Medium dates: pt-PT `16/10/2026`, de-DE `16.10.2026`, en-IE `16 Oct 2026`. In every locale tested, ICU emits the **hyphen-minus U+002D** as the minus sign (confidence high, observed).

Rules (**Recommendation**):

1. Never hand-build a number. Use `Intl.NumberFormat` with the viewer's locale and the plan currency; use `formatToParts` and replace the `minusSign` part with U+2212 MINUS SIGN. ECMA-402 leaves the character to locale data, and CLDR 48 gives U+002D for en, de, pt, fr, it and nl (U+2212 only for sv, fi, nb, lt, et). Unicode 17 §22.5.1: "U+2212 − MINUS SIGN is a mathematical operator, to be distinguished from the ASCII-derived U+002D HYPHEN-MINUS, which may look the same as a minus sign or be shorter in length." Every family in 1.1 has the glyph, and Inter even makes it tabular.
2. Signed values always carry the sign: `signDisplay: "exceptZero"` for P&L money and percentages (`+€1,234.56`, `−12.3%`, `0.00 €`; nl-BE puts the sign after the symbol, `€ −1.234,56`, which is correct there). The sign, not the colour, is the primary cue (see 2.6). Avoid `currencySign: "accounting"`: en-IE and pt-PT produce parentheses, de-DE does not.
3. Multiples use U+00D7 MULTIPLICATION SIGN with no space: `1.89×`, `4,04×` (locale decimal separator). Never the letter x (Butterick, "Math symbols": "12 × 34 − 56 = 352", not "12 x 34 - 56 = 352").
4. Ranges in English prose and tables use U+2013 EN DASH with no spaces when both ends are plain numbers with the same unit: `3–6 months`, `2013–2026` (Unicode §6.2.4: "EN DASH is used to indicate a range of values, such as 1973–1984"; Butterick: "from 1880 to 1912, not from 1880–1912"). When either end carries a sign or the units differ, write the words: `from −10% to −30%`. For localised UI ranges use `Intl.NumberFormat.prototype.formatRange`, which follows each locale's CLDR pattern: en-IE `€10.00 – €20.00`, de-DE `10,00–20,00 €`, pt-PT `10,00 - 20,00 €` (CLDR's pt-PT range pattern is a spaced hyphen-minus; do not "correct" it).
5. Number and unit are separated by a no-break space U+00A0 where the locale puts a space (CLDR writes U+00A0 into the pt-PT, de, fr and it currency patterns and into the de/fr percent pattern; UTS #35 `currencySpacing` inserts U+00A0 between a digit and a currency code); never a breaking space, so a value cannot wrap away from its unit. Group separators are whatever CLDR gives (U+00A0 in pt-PT, U+202F in fr, `.` in de and it, `,` in en-IE). U+202F NARROW NO-BREAK SPACE is missing from 9 of the 12 text families evaluated; IBM Plex Sans, Inter and Source Sans 3 have it, so with the recommended family French grouping renders correctly, and the same must be checked for the mono.
6. Currency symbol placement follows the locale as in the table; do not override to "€ before" for a European house style. Where a code is needed instead of a symbol (`EUR` when several currencies appear, `BTC` always), use `currencyDisplay: "code"` for fiat (`EUR 1,234.56` in en-IE, `1.234,56 EUR` in de-DE, both with U+00A0) and append crypto codes after the number with U+00A0 in every locale: `0.01234567 BTC`.
7. Crypto quantities: fixed decimals per asset in tables (BTC 8, ETH 6, SOL and LINK 4) so columns align; trimmed to significant digits in prose. No satoshi unit by default.
8. Every number that can change in place, every column of numbers and every total uses `font-variant-numeric: tabular-nums lining-nums;` (CSS Fonts 4 maps it to `tnum`; MDN: "numbers are all of the same size, allowing them to be easily aligned like in tables"; Baseline widely available since January 2020). Body prose keeps proportional figures. With IBM Plex Sans the digits are tabular anyway; the declaration is for fallback fonts. Do not set `font-feature-settings: "tnum"` for this: CSS Fonts 4 says authors "should not use font-feature-settings" for features that have a high-level property because the high-level properties "cascade individually". Stylistic sets have no high-level property, so if one is used (`ss03` for a slashed zero in Plex) it goes in a single combined `font-feature-settings` list on that element, because a later `font-feature-settings` declaration replaces the whole list.
9. Slashed or dotted zero (`font-variant-numeric: slashed-zero`, which maps to `zero`, or the mono family's default dotted zero) only in monospace contexts: addresses, transaction hashes, CSV previews, code. In money tables a slashed zero adds noise and a dotted zero is mistaken for 8 at 13 px. This requires the self-hosted font: the Google Fonts API strips `zero`.
10. Right-align numeric columns, including their headers; align on the decimal separator by construction (fixed decimals + tabular figures). Dates in records show the year; exports use ISO 8601 (`2026-10-16`); times show the zone when they matter (`prices from 14:05 WEST`).
11. Percentages: one decimal for changes, none for shares of a whole over 10% (`31% below the 90-day high`); differences between percentages are "percentage points" in words, never `%`.

Sources for 1.3 (accessed 2026-10-16, high): Unicode 17.0 core specification §6.2.3–6.2.4 and §22.5.1, https://www.unicode.org/versions/Unicode17.0.0/ ; UTS #35 Part 3 (Numbers), https://unicode.org/reports/tr35/tr35-numbers.html ; CLDR 48 JSON (cldr-numbers-full), https://github.com/unicode-org/cldr-json ; ECMA-402 PartitionNumberPattern, https://tc39.es/ecma402/ ; MDN `font-variant-numeric`, https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric , and `font-feature-settings`; CSS Fonts Module Level 4, https://www.w3.org/TR/css-fonts-4/ ; Butterick, Practical Typography, "Hyphens and dashes" and "Math symbols", https://practicaltypography.com/ ; Node v24.20.0 (ICU 78.3) output as printed above. Browsers ship other ICU versions, so individual strings may differ slightly (medium).

---

## 2. Colour system in OKLCH

Method. Tokens were specified in OKLCH and converted with Björn Ottosson's OKLab matrices to sRGB (chroma reduced in OKLCH until in gamut, lightness and hue held, as in CSS Color 4 gamut mapping). WCAG 2.2 contrast ratios use the relative-luminance formula of SC 1.4.3; APCA Lc uses the APCA-W3 0.1.9 (4g) constants; colour-vision-deficiency simulation uses the Machado, Oliveira and Fernandes (2009) matrices at severity 1.0 in linear RGB; perceptual distance is Euclidean OKLab distance × 100 (ΔEok). All values were computed with a pure-Python script written for this report and cross-checked for the categorical coin palette with the dataviz skill's `validate_palette.js` (same Machado model, same ΔE definition). Thresholds used: text ink-2 ≥ 4.5:1 and ink-3 ≥ 3:1 on every surface (SC 1.4.3); non-text marks ≥ 3:1 on every surface they sit on (SC 1.4.11); coin colours pairwise ΔEok ≥ 15 under normal vision and ≥ 8 under protanopia and deuteranopia (the dataviz validator's gates), tritanopia reported but not gated (prevalence about 1 in 10,000).

References (all accessed 2026-10-16, confidence high unless noted):

- oklch.com, "OKLCH Color Picker & Converter", Andrey Sitnik and Roman Shamin at Evil Martians, https://oklch.com/ (used to sanity-check gamut edges; sRGB and P3 toggles).
- Andrey Sitnik and Travis Turner, "OKLCH in CSS: why we moved from RGB and HSL", Evil Martians, https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl (page metadata 2025-09-17; first published 2023, medium confidence on the original date). Key claims used: L is perceived lightness, consistent for our eyes unlike HSL's L; predictable lightness gives "better a11y"; chroma in sRGB and P3 stays below about 0.37; as of September 2025 `oklch()` is available in all current browsers.
- Björn Ottosson, "A perceptual color space for image processing", 2020-12-23, https://bottosson.github.io/posts/oklab/ (the OKLab matrices used in the script).
- W3C, CSS Color Module Level 4, Candidate Recommendation Draft 2026-10-09, §"Oklab and Oklch" https://www.w3.org/TR/css-color-4/#ok-lab and §"Specifying Oklab and Oklch" https://www.w3.org/TR/css-color-4/#specifying-oklab-oklch (L 0–1, C percent reference 0.4, practical maximum about 0.5; hue 0° toward purplish red, 90° mustard yellow, 180° greenish cyan, 270° sky blue).
- caniuse, "`oklch()`", https://caniuse.com/mdn-css_types_color_oklch: 95.12% global support (StatCounter, September 2026); Chrome and Edge 111+, Firefox 113+, Safari 15.4+, Samsung Internet 22+.
- W3C, WCAG 2.2, W3C Recommendation 2023-10-05, republished 2024-12-12, https://www.w3.org/TR/WCAG22/: SC 1.4.3 Contrast (Minimum) "at least 4.5:1", large text "at least 3:1" (#contrast-minimum); SC 1.4.6 Contrast (Enhanced) 7:1 / 4.5:1 (#contrast-enhanced); SC 1.4.11 Non-text Contrast "at least 3:1 against adjacent color(s)" for "visual information required to identify user interface components and states" and "parts of graphics required to understand the content" (#non-text-contrast); large text defined as 18 pt, or 14 pt bold, with 1 pt = 1.333 px so 18.5 px and 24 px (Understanding 1.4.3, updated 2026-09-06, https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- Myndex, "APCA in a Nutshell", https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell (© 2022): Lc 90 preferred for fluent body text (14 px/400 or 18 px/300); Lc 75 the minimum for body text at 18 px/400, 16 px/500 or 14 px/700; Lc 60 the minimum for content text that is not body text (24 px/400, 18 px/600, 16 px/700); Lc 45 headlines; Lc 30 the absolute minimum for spot-readable text, placeholders and disabled text and for large semantic non-text; Lc 15 the floor for discernible non-semantic marks. apca-w3 README, https://github.com/Myndex/apca-w3: library 0.1.9 (2022-07-03), algorithm 0.0.98G-4g; "For sub-fluent text (i.e. not primary content) Lc values can be lowered by Lc 15, but in no case less than Lc 30." ARC, "APCA Readability Criterion", public beta draft 2023-03-12, https://readtech.org/ARC/ (Bronze covers primary content text, Silver all text, Gold enhanced).
- G. M. Machado, M. M. Oliveira and L. A. F. Fernandes, "A Physiologically-based Model for Simulation of Color Vision Deficiency", IEEE Transactions on Visualization and Computer Graphics 15(6), 2009, severity-1.0 matrices, https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html (matrices as reproduced in the dataviz validator; medium confidence on the URL, high on the matrices, which match the validator's).

### 2.1 Tokens

Hue 80 (a warm paper yellow) at very low chroma gives the paper its warmth without tinting the inks; the prototype's #f4f4f2 is almost neutral (oklch 0.967 0.003 106). The dark side keeps the same hue at slightly higher lightness than #121212 (oklch 0.182) so that it reads as charcoal rather than black on OLED.

**Light (warm paper)**

| Token | OKLCH | Hex | Use |
|---|---|---|---|
| background | oklch(0.967 0.007 80) | #f7f4ef | page |
| surface | oklch(0.985 0.004 80) | #fbfaf7 | cards, sheets |
| surface-2 | oklch(0.945 0.008 80) | #f0ece7 | insets, table stripes, inputs |
| surface-3 | oklch(0.920 0.009 80) | #e8e4de | selected rows, code blocks, pressed |
| ink | oklch(0.220 0.005 80) | #1c1a18 | text, icons, focus ring |
| ink-2 | oklch(0.470 0.008 80) | #5d5a56 | secondary text |
| ink-3 | oklch(0.600 0.008 80) | #83807b | placeholders, timestamps, disabled |
| line | oklch(0.880 0.008 80) | #dad7d2 | hairline dividers (decorative) |
| line-2 | oklch(0.600 0.008 80) | #83807b | component boundaries that must be perceivable (3:1) |
| accent | oklch(0.600 0.127 75) | #ac7300 | "now": today's marker, primary action fill |
| on-accent | oklch(0.170 0.005 80) | #110f0d | text on accent |
| positive | oklch(0.450 0.130 145) | #146720 | gains, with a + sign |
| negative | oklch(0.520 0.170 22) | #b63039 | losses, with a − sign; destructive actions |
| focus | = ink | #1c1a18 | 2 px ring, 2 px offset |

**Dark (matte charcoal)**

| Token | OKLCH | Hex | Use |
|---|---|---|---|
| background | oklch(0.190 0.004 80) | #151412 | page |
| surface | oklch(0.235 0.005 80) | #1f1e1b | cards, sheets |
| surface-2 | oklch(0.270 0.006 80) | #282623 | insets, inputs |
| surface-3 | oklch(0.310 0.006 80) | #32302d | selected, code, pressed |
| ink | oklch(0.955 0.005 90) | #f1f0ec | text, icons, focus ring |
| ink-2 | oklch(0.790 0.007 85) | #bcbab6 | secondary text |
| ink-3 | oklch(0.640 0.007 85) | #8e8c87 | placeholders, timestamps |
| line | oklch(0.300 0.006 80) | #2f2d2a | hairlines |
| line-2 | oklch(0.640 0.007 85) | #8e8c87 | perceivable boundaries |
| accent | oklch(0.800 0.120 82) | #e4b65c | "now" |
| on-accent | = background | #151412 | text on accent |
| positive | oklch(0.760 0.140 145) | #74c878 | gains |
| negative | oklch(0.700 0.160 18) | #f16f78 | losses |
| focus | = ink | #f1f0ec | ring |

### 2.2 Contrast of every text token on every surface

WCAG 2.2 ratio / APCA Lc (APCA is negative for light text on dark; magnitude is what matters). Targets: ink-2 ≥ 4.5:1 everywhere, ink-3 ≥ 3:1 everywhere. All met.

Light:

| text \ surface | background | surface | surface-2 | surface-3 |
|---|---|---|---|---|
| ink | 15.73 / 98 | 16.58 / 101 | 14.74 / 93 | 13.66 / 89 |
| ink-2 | 6.20 / 77 | 6.54 / 81 | 5.81 / 73 | 5.39 / 68 |
| ink-3 | 3.59 / 60 | 3.78 / 64 | 3.36 / 56 | 3.12 / 51 |
| accent (as text) | 3.67 / 61 | 3.86 / 64 | 3.43 / 56 | 3.18 / 52 |
| positive | 6.39 / 78 | 6.74 / 81 | 5.99 / 73 | 5.55 / 68 |
| negative | 5.47 / 73 | 5.77 / 76 | 5.12 / 68 | 4.75 / 63 |
| line-2 (non-text) | 3.59 | 3.78 | 3.36 | 3.12 |

Dark:

| text \ surface | background | surface | surface-2 | surface-3 |
|---|---|---|---|---|
| ink | 16.20 / −97 | 14.63 / −96 | 13.22 / −95 | 11.55 / −93 |
| ink-2 | 9.55 / −65 | 8.62 / −63 | 7.79 / −62 | 6.81 / −60 |
| ink-3 | 5.49 / −40 | 4.96 / −39 | 4.48 / −38 | 3.91 / −36 |
| accent (as text) | 9.80 / −66 | 8.85 / −65 | 8.00 / −64 | 6.98 / −62 |
| positive | 9.05 / −62 | 8.17 / −61 | 7.39 / −60 | 6.45 / −58 |
| negative | 6.42 / −47 | 5.80 / −46 | 5.24 / −44 | 4.58 / −42 |
| line-2 (non-text) | 5.49 | 4.96 | 4.48 | 3.91 |

Other pairs: on-accent on accent 4.74:1 (light; note that the regular ink at L 0.22 gives only 4.29:1 on this gold, which is why on-accent is a darker ink) and 9.80:1 (dark). Focus ring (ink) against background 15.7:1 light / 16.2:1 dark and against surface-3 13.7:1 / 11.6:1; because the ring is drawn with a 2 px offset it is always adjacent to a surface, never to a button fill (in dark mode the light ink would be only 1.7:1 against the gold), so it passes SC 2.4.13's 3:1 change on every surface without a second halo.

APCA as a secondary check. APCA's thresholds (references above): Lc 90 preferred and Lc 75 minimum for body text at 14–18 px, Lc 60 minimum for content text that is not body text, Lc 30 for placeholders and disabled text, with an allowance of 15 Lc for "sub-fluent" text that is not primary content. Read against those: `ink` is Lc 89–101 (light) and 93–97 (dark), so body text at 14–16 px passes at the preferred level; `ink-2` is Lc 68–81 (light) and 60–65 (dark), which clears the Lc 60 floor on every surface and the Lc 75 body line on `background` and `surface` in light mode, so it is right for labels, helper lines and timestamps at 14 px and up but not for paragraphs (the first draft at L 0.50 / 0.76 measured Lc 64 / 55 on surface-3 and was retuned for this reason); `ink-3` (Lc 51–64 light, 36–40 dark) sits between the placeholder floor and Lc 60, which matches its use for placeholders, list timestamps and disabled controls, never for content a person must read; `positive` and `negative` are Lc 63–81 light and 42–62 dark, fine for a number beside its label, and the dark `negative` at Lc 42–47 is one more reason the sign travels with the colour. If dark-mode secondary text at 13 px is ever needed, promote it to `ink` rather than inventing a fourth grey.

### 2.3 The accent: keep the gold, but it is a mark, not a text colour, and "late" is not amber

Findings:

- The prototype's light gold #b7811c (oklch 0.642 0.126 77) measures 3.09:1 on the paper and 2.68:1 on surface-3, so as a 2 px marker it fails SC 1.4.11 on inset surfaces and as text it fails SC 1.4.3 everywhere. The retuned accent (L 0.60) reaches 3.18–3.86:1 on all four light surfaces: valid for marks, rings, fills and large text, still not for body text (a 4.5:1 gold is oklch 0.50 0.11 75 = #865900, which reads brown, not gold).
- In dark mode the gold #e4b65c is 7.0–9.8:1 and may be used as text.
- Every chromatic role collides with something under CVD: gold vs BTC orange (ΔEok 0.5 under deuteranopia in light, 6.7 in dark), gold vs positive green under protanopia (3.0), any blue or teal accent would collide with LINK and SOL, magenta with negative, purple with ETH. There is no hue left that is free of the four coins plus two status colours; a different accent hue does not solve this. What solves it is role separation: the accent is only ever a position mark (today on the strip, the "now" dot on the loop) or the primary action fill; coin colours are only ever series marks and identity dots; status colours are only ever on signed values. Each role has its own shape, so a hue clash between roles is tolerable; within the coin role we validated distinctness (2.5).

**Recommendation**: keep gold as the single accent. Do not create an amber "late" state: a late month is still "the thing to do now", so it carries the same accent marker with text that says how late (`Buy day was 1 October, 15 days ago`), set in ink-2. No warning hue exists in the system; nothing in a calm monthly tool needs one. If a second status level is ever needed (for example "backup not done in 90 days"), it uses ink and a sentence, not a colour. In light mode the accent never appears as running text or a link; links are ink with an underline.

### 2.4 Positive and negative

Kept green and red because profit/loss readers expect them. Measures: both reach 4.5:1 on all four surfaces in both modes (worst: negative 4.58:1 on dark surface-3, 4.75:1 on light surface-3). Lightness is deliberately split (light: positive L 0.45 vs negative L 0.52; dark: 0.76 vs 0.70) so that the pair differs in luminance and not only in hue. Under simulation the pair is still weak for the red–green deficiencies, as any red/green pair is: ΔEok light 27 normal / 6.5 protan / 8.2 deutan; dark 28 / 18 / 5.2. Therefore colour is never the only cue: every signed number carries its sign (U+002B / U+2212), P&L cells also carry the word or an arrow glyph where space allows (`▲` / `▼` are acceptable; no emoji), and tables have a "gain/loss" column header. Status colours are never used for series and SOL's teal (hue 170–176) is kept well off the positive green (hue 145): ΔEok 9.0 light / 7.5 dark, acceptable because the two never play the same role, and flagged here so that no chart ever draws SOL and a green P&L line together.

### 2.5 Coin colours

Validated with the dataviz validator in all-pairs mode (any two lines may touch) against `background` and `surface` in each mode. Light: all five checks pass (lightness band, chroma ≥ 0.10, worst CVD pair ΔEok 8.3 BTC–SOL under protanopia, worst normal-vision pair 17.1 ETH–LINK, all ≥ 3:1). Dark: CVD worst 13.0 (ETH–LINK, deuteranopia), normal-vision worst 15.1 (SOL–LINK), all ≥ 3:1; the validator's dark "lightness band" (L 0.48–0.67, calibrated for a single #1a1a19 surface) is exceeded on purpose because our dark lines must also reach 3:1 on surface-2 (L 0.27) and surface-3 (L 0.31), which needs L ≥ 0.60, and four coins need lightness spacing to survive deuteranopia. A purple SOL (brand gradient) was tested and rejected: ETH indigo vs purple ΔEok 2.9 under protanopia and 11.6 under normal vision.

| Coin | Light OKLCH / hex | 3:1 on bg / surface / surface-2 / surface-3 | Dark OKLCH / hex | same, dark |
|---|---|---|---|---|
| BTC | oklch(0.60 0.164 48) #cb5a00 | 3.82 / 4.03 / 3.58 / 3.32 | oklch(0.73 0.16 52) #f4873a | 7.35 / 6.63 / 6.00 / 5.24 |
| ETH | oklch(0.45 0.19 288) #5635b6 | 7.38 / 7.78 / 6.91 / 6.41 | oklch(0.60 0.15 295) #886acf | 4.42 / 3.99 / 3.61 / 3.15 |
| SOL | oklch(0.52 0.103 170) #007c60 | 4.74 / 4.99 / 4.44 / 4.11 | oklch(0.78 0.12 176) #50d0b4 | 9.72 / 8.78 / 7.93 / 6.93 |
| LINK | oklch(0.58 0.15 252) #287ccf | 3.90 / 4.11 / 3.65 / 3.39 | oklch(0.73 0.13 245) #59aff4 | 7.81 / 7.05 / 6.37 / 5.56 |

Simulated appearance (hex after Machado 2009, severity 1.0) and pairwise ΔEok (normal / protan / deutan / tritan):

| Light | protan | deutan | tritan |
|---|---|---|---|
| BTC #cb5a00 | #7b6c00 | #968500 | #df3e4d |
| ETH #5635b6 | #0052b9 | #004cb3 | #325772 |
| SOL #007c60 | #78725e | #6b6962 | #007d74 |
| LINK #287ccf | #5482d3 | #3873ce | #00909c |

| Pair (light) | normal | protan | deutan | tritan |
|---|---|---|---|---|
| BTC–ETH | 34.1 | 28.9 | 34.3 | 29.8 |
| BTC–SOL | 24.8 | 8.3 | 15.1 | 29.8 |
| BTC–LINK | 30.7 | 25.4 | 28.1 | 29.9 |
| ETH–SOL | 26.5 | 22.4 | 20.1 | 11.7 |
| ETH–LINK | 17.1 | 15.3 | 11.9 | 16.8 |
| SOL–LINK | 18.0 | 17.3 | 17.0 | 7.5 |

| Dark | protan | deutan | tritan |
|---|---|---|---|
| BTC #f4873a | #a6942f | #c1ad38 | #ff6f77 |
| ETH #886acf | #477dd3 | #4c7acd | #777e93 |
| SOL #50d0b4 | #c9c4b3 | #b6b6b7 | #00d3c8 |
| LINK #59aff4 | #91b1f7 | #7ca2f2 | #00c0c7 |

| Pair (dark) | normal | protan | deutan | tritan |
|---|---|---|---|---|
| BTC–ETH | 29.5 | 26.9 | 30.9 | 22.6 |
| BTC–SOL | 25.3 | 18.2 | 13.9 | 31.6 |
| BTC–LINK | 28.8 | 24.6 | 25.9 | 30.1 |
| ETH–SOL | 29.5 | 28.1 | 23.3 | 23.1 |
| ETH–LINK | 17.7 | 17.4 | 13.0 | 18.2 |
| SOL–LINK | 15.0 | 14.2 | 13.9 | 5.5 |

Reading: under protanopia and deuteranopia the orange–teal and indigo–blue pairs are carried mostly by lightness (BTC lighter than SOL; LINK lighter than ETH), which is why the lightness order BTC > LINK > SOL > ETH (light) must not be changed when retuning. Under tritanopia SOL–LINK collapses (7.5 / 5.5) and BTC–negative does too; the mitigation is structural: every multi-series chart has direct labels at the line ends and a legend, lines are 2 px with distinct end markers, and a table view exists, so identity is never colour-alone (dataviz rule 6).

Extended palette for other coins (identity dots, pills and single-series charts only; charts cap at four series and fold the rest into "Other" in the neutral):

| Slot | Light OKLCH / hex | Dark OKLCH / hex |
|---|---|---|
| 5 magenta | oklch(0.52 0.17 345) #a8347f | oklch(0.72 0.15 345) #e57bba |
| 6 purple | oklch(0.48 0.16 312) #7b3b9d | oklch(0.68 0.14 312) #b57dd6 |
| 7 olive | oklch(0.58 0.12 118) #748322 | oklch(0.80 0.12 118) #b7c86b |
| 8 rose | oklch(0.52 0.16 8) #b03557 | oklch(0.72 0.15 8) #f17993 |
| 9 brown | oklch(0.50 0.08 58) #855732 | oklch(0.70 0.08 58) #c4926c |
| 10 steel | oklch(0.55 0.08 235) #3e799a | oklch(0.74 0.08 235) #78b3d6 |
| neutral ("Other", unknown coin) | oklch(0.60 0 0) #808080 | oklch(0.72 0 0) #a4a4a4 |

All ten reach 3:1 on their backgrounds. They are not pairwise CVD-safe and no ten-colour palette is (validator: worst adjacent ΔEok 4.3–4.5 under deuteranopia for brown–rose; magenta–purple 9–10 under normal vision); that is the reason for the four-series cap, not a defect to fix by retuning.

### 2.6 Rules that follow

- Colour never carries meaning alone: sign + colour for values; label + colour for series; shape (dot, ring) + colour for "now".
- Charts draw on `background` or `surface`; coin dots in lists sit on `surface` or `surface-2`; nothing chromatic sits on `surface-3` except text in `ink`.
- Light mode: accent for marks and fills only. Dark mode: accent may be text.
- Use the CSS `oklch()` function directly with the hex as the fallback in a preceding declaration; `oklch()` has 95% global support (caniuse, StatCounter September 2026: Chrome 111+, Firefox 113+, Safari 15.4+), so the fallback is for the long tail only.
- Declare the dark tokens twice: under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and under `:root[data-theme="dark"]`, so the in-app toggle wins both ways.

---

## 3. Spacing, radius, motion, elevation, focus, touch

One page; sources at the end of the section.

**Spacing (4 px base).** Scale: 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Semantic aliases: `space-inset-sm` 12, `space-inset` 16, `space-inset-lg` 24 (card padding); `space-stack-xs` 4, `-sm` 8, `-md` 16, `-lg` 24, `-xl` 40 (vertical rhythm); `gutter` 16 on phones, 24 from 600 px; reading measure 640 px, table measure 960 px. 2 px is only for gaps between adjacent fills (stacked bars, segmented controls) and hairline offsets.

**Radius.** `radius-lg` 14 px (cards, sheets, dialogs, the loop mark's container), `radius-md` 8 px (buttons, inputs, menus, chips with text), `radius-sm` 4 px (tags, tooltips, table-cell highlights), `radius-full` 999 px (the "now" dot, pills, avatars). Nested corners: inner radius = outer radius − padding, floored at 4 (a 14 px card with 8 px inset content gets 6 px inner corners). No 2 px radii; no asymmetric corners.

**Motion.** Durations: `motion-fast` 120 ms (hover, toggle, checkbox), `motion-base` 180 ms (fade, expand/collapse, tooltip), `motion-slow` 240 ms (bottom sheet, dialog, page transition), 320 ms is the ceiling for anything but a one-time chart draw-in (max 400 ms, once per page view, never on data refresh). Easings: enter `cubic-bezier(0.2, 0, 0, 1)` (decelerate), exit `cubic-bezier(0.3, 0, 1, 1)` (accelerate), `linear` for opacity-only changes ≤ 120 ms. No springs, bounces, parallax, looping or attention-seeking animation; nothing animates because the price moved. Number changes do not count up. `prefers-reduced-motion: reduce`: all duration tokens become 1 ms (not 0, so `transitionend` still fires), transforms are replaced by opacity, chart draw-in and sheet slides become fades, and the same switch is exposed as an in-app setting for people whose OS has none. These ranges sit inside Material 3's short/medium bands and Apple's guidance to keep motion brief and purposeful.

**Elevation.** Flat. Level 0: `surface` on `background` with a `line` hairline where a boundary is needed. Level 1 (only overlays: sheets, dialogs, menus, toasts): one shadow in light, `0 1px 2px oklch(0.2 0.01 80 / 0.10), 0 8px 24px -8px oklch(0.2 0.01 80 / 0.25)`; in dark, shadows are nearly invisible on charcoal, so overlays use `surface-2` plus a 1 px `line-2` border and a scrim `oklch(0.1 0 0 / 0.5)` behind modal sheets. No hover elevation, no "raised" cards.

**Focus.** `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }` with `border-radius` inherited so the ring follows the corner. `focus` = `ink` in both modes: contrast against every surface 11.6:1 or more, and the 2 px offset keeps the ring on the surface rather than on a button fill (where light ink on dark-mode gold would be 1.7:1), which satisfies SC 2.4.13 Focus Appearance (AAA: a ring at least 2 CSS px thick with ≥ 3:1 change against adjacent colours) as well as SC 1.4.11 on the ring itself. Do not reduce the offset to 0 on filled buttons. Never `outline: none`; mouse clicks do not show the ring (`:focus-visible` handles that); sticky bars get `scroll-padding` equal to their height so a focused element is never hidden behind them (SC 2.4.11 Focus Not Obscured, AA).

**Touch targets.** Three published minimums: WCAG 2.2 SC 2.5.8 Target Size (Minimum), AA, 24 × 24 CSS px with exceptions for spacing, inline text and user-agent controls; WCAG 2.2 SC 2.5.5 Target Size (Enhanced), AAA, 44 × 44; Apple Human Interface Guidelines, 44 × 44 pt; Material Design 3, 48 × 48 dp with 8 dp between targets. **Recommendation: 44 × 44 CSS px** for every interactive element (meets WCAG AAA and Apple; 4 px under Material, which is a dp recommendation rather than a conformance line), 8 px minimum between adjacent targets, 48 px row height in lists (44 + 4), 44 px buttons and inputs, icon buttons padded to 44 even when the glyph is 20, inline text links exempt as the standard allows. Charts: hover/tap hit areas larger than the mark (≥ 24 px around a 2 px line), per the dataviz interaction rules.

**Type sizes (for completeness).** Body 16 px / 1.5; dense tables 14 px with tabular figures; captions and meta 13 px; 12 px is the floor and only for axis ticks. Minimum colour for 13 px text is `ink-2`. Text must survive the SC 1.4.12 overrides (line height 1.5, paragraph spacing 2 em, letter spacing 0.12 em, word spacing 0.16 em) without clipping, which rules out fixed-height table cells.

Sources for this section (accessed 2026-10-16, confidence high unless noted):

- WCAG 2.2, https://www.w3.org/TR/WCAG22/: SC 2.5.8 Target Size (Minimum), AA: "The size of the target for pointer inputs is at least 24 by 24 CSS pixels, except when" spacing (a 24 px circle centred on each undersized target does not intersect another), equivalent, inline ("The target is in a sentence or its size is otherwise constrained by the line-height of non-target text"), user-agent control, essential (#target-size-minimum). SC 2.5.5 Target Size (Enhanced), AAA: "at least 44 by 44 CSS pixels" with equivalent, inline, user-agent and essential exceptions (#target-size-enhanced). SC 2.4.13 Focus Appearance, AAA: the indicator "is at least as large as the area of a 2 CSS pixel thick perimeter of the unfocused component" and "has a contrast ratio of at least 3:1 between the same pixels in the focused and unfocused states" (#focus-appearance). SC 2.4.11 Focus Not Obscured (Minimum), AA: the focused component "is not entirely hidden due to author-created content" (#focus-not-obscured-minimum). SC 2.3.3 Animation from Interactions, AAA: "Motion animation triggered by interaction can be disabled, unless the animation is essential" (#animation-from-interactions). SC 1.4.12 Text Spacing (#text-spacing).
- Apple Human Interface Guidelines, Accessibility, https://developer.apple.com/design/human-interface-guidelines/accessibility: "Offer sufficiently sized controls"; iOS and iPadOS default 44×44 pt, minimum 28×28 pt; "Consider spacing between controls as important as size"; about 12 pt of padding around elements with a bezel, about 24 pt around elements without one. HIG Buttons, https://developer.apple.com/design/human-interface-guidelines/buttons: "a button needs a hit region of at least 44x44 pt". (No dates shown; read via Apple's documentation JSON.)
- Material Design 3 figures via Google's Android pages because m3.material.io is script-rendered: Android Accessibility Help, "Touch target size", https://support.google.com/accessibility/android/answer/7101858: "at least 48dp" width and height, "about 9mm", targets "separated by 8dp of space or more"; Android Developers, Compose "API defaults", https://developer.android.com/develop/ui/compose/accessibility/api-defaults (updated 2026-09-22): "set the minimum size to 48dp to correctly follow the Material Design accessibility guidelines". Confidence medium that m3.material.io's own wording is identical.
- Material motion tokens, Material Components for Android "Motion", https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md: Short1–4 50/100/150/200 ms, Medium1–4 250–400 ms, Long1–4 450–600 ms; easing Standard `cubic-bezier(0.2, 0, 0, 1)`, StandardAccelerate `(0.3, 0, 1, 1)`, StandardDecelerate `(0, 0, 0, 1)`; "duration should increase as the area/traversal of an animation increases". Our enter and exit curves are Material's Standard and StandardAccelerate.
- Apple HIG Motion, https://developer.apple.com/design/human-interface-guidelines/motion: "Don't add motion for the sake of adding motion"; "Aim for brevity and precision in feedback animations"; "avoid adding motion to UI interactions that occur frequently"; with Reduce Motion on, "reducing automatic and repetitive animations, including zooming, scaling, and peripheral motion", "Replacing transitions in x-, y-, and z-axes with fades".
- MDN, `prefers-reduced-motion`, https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion (modified 2026-06-10): the setting means the person "prefers an interface that removes, reduces, or replaces motion-based animations"; scaling and panning of large objects "can be vestibular motion triggers"; MDN's own example replaces a pulse with a dissolve rather than deleting it.

---

## 4. Logo direction for "Proof of Calm"

Brief recap: avoid the infinity sign and the refresh arrow; the mark must survive 16 px, work as a maskable PWA icon, and carry the product's two ideas: a cycle that repeats and one marked "now".

Prior art (the brand pages carry usage rules but no verbal description of the marks, so these descriptions are from the researcher's prior knowledge and should be checked visually at the URLs; confidence in brackets):

- Loop Returns, https://www.loopreturns.com/: lowercase "loop" wordmark; app mark a rounded square with a circular-arrow return loop, black with bright green [low–medium].
- Loop Earplugs, https://www.loopearplugs.com/: lowercase wordmark; icon a single thick ring, black on white [medium].
- Loom, https://www.loom.com/: purple circular mark of radiating rounded spokes around a hollow centre, a shutter or flower ring [high].
- Lemon Squeezy, https://www.lemonsqueezy.com/brand: a stylised yellow lemon with a leaf; no loop [medium].
- Looker (Google Cloud), https://cloud.google.com/looker: a continuous blue line forming an open ring that curls into a tail [medium].
- Linear, https://linear.app/brand: four diagonal rounded segments of increasing length that imply a circle, monochrome, chip version in a rounded square [high].
- Microsoft Loop, https://www.microsoft.com/en-us/microsoft-loop: a looping ribbon forming an open infinity in a purple-to-blue gradient [medium–high]. Meta, https://www.meta.com/brand/resources/meta/company-brand/: a continuous infinity loop in blue [high].
- Crypto apps: Coinbase's mark is a blue disc with a white C-ring (a ring with a gap) [high]; Swan Bitcoin a swan silhouette; Relai a geometric R in a rounded square; Bitpanda a geometric panda; River a wordmark [low–medium].

So the crowded forms near "Proof of Calm" are: the infinity figure (Meta, Microsoft Loop), a single plain ring (Loop Earplugs; Coinbase's gapped C-ring), circular arrows (Loop Returns), radiating-spoke rings (Loom) and arc segments (Linear, Looker). A plain closed ring, a gapped ring without anything in the gap, and anything with an arrowhead are all taken.

**Direction A: the marked loop.** A ring drawn in `ink` (stroke about 1/7 of the diameter, very slightly superelliptical so it is not a compass circle) that is open at about the 2 o'clock position, and the gap is filled by one solid `accent` dot set into the stroke: the dot is "now", and it is what closes the loop. Rationale: the ring is the plan (it never ends and points nowhere), the dot is the only coloured thing in the brand, exactly as in the UI; the month strip in the app is the same ring unrolled. At 16 px a 1.5 px ring and a 4 px dot stay legible; in the favicon cut the dot is drawn a little larger than scale. Maskable: the ring at 66% of the canvas sits inside the 80% safe circle on a full-bleed paper or charcoal field, so the dot survives every Android mask shape. Motion, once a month at most: the dot steps one twelfth clockwise on buy day. Risks: ring marks are common, but the dot-in-gap distinguishes it from the plain ring (Loop Earplugs), the empty gap (Coinbase), the spokes (Loom), the arrow (Loop Returns) and the segments (Linear, Looker). In isolation a ring with a dot can read as a status indicator; the wordmark removes that. Checked against the infinity and refresh clichés: neither shape is present.

**Direction B: twelve.** A ring made of twelve short arcs with one arc filled in accent: the month strip bent into a circle. Rationale: literal to the product's calendar; works as a progress device inside the app. At 16 px the arcs merge into a dotted circle and the accent segment becomes a speck; it needs a reduced cut (ring with one gap and a dot), which weakens consistency. Risks: reads as a loading spinner or an activity ring (Apple Watch), and as a clock face. Verdict: keep as an in-app illustration for the year view, not as the logo.

**Direction C: the single-stroke e.** A lowercase e drawn as one continuous loop: the crossbar runs into the bowl and returns to the start so the letter closes on itself; a small terminal dot in accent marks the join. Rationale: ownable (a letterform, not a generic ring), and the loop is implicit in the gesture rather than illustrated. At 16 px a bold cut of the stroke holds; the dot disappears and should be omitted below 24 px. Maskable: fine. Risks: a looped lowercase e carries memories of Internet Explorer and Edge (an e with an orbit); without the orbit and with a static, calligraphic stroke the association is weak but not zero; also competes with the wordmark's own e.

**Recommendation: Direction A**, with the wordmark "proof-of-calm" in lowercase in the chosen text family, tracked slightly tight, set in ink; the ring-and-dot mark sits left of the wordmark at x-height. Direction C can become the wordmark's "e" if the mark and wordmark ever need to merge into a single-glyph favicon, but that is not needed now.

Icon assets required:

| Asset | Spec | Source |
|---|---|---|
| `favicon.svg` | vector mark, `<link rel="icon" type="image/svg+xml">`; a `@media (prefers-color-scheme: dark)` rule inside the SVG's `<style>` flips ink and paper | web.dev "Building an adaptive favicon" (2022-02-09), https://web.dev/articles/building/an-adaptive-favicon; caniuse SVG favicons https://caniuse.com/link-icon-svg: 92% global, Chrome 80+, Firefox 41+, Safari 26+ (not before), so the `.ico` stays |
| `favicon.ico` | 16, 32 and 48 px frames, simplified mark (ring plus a larger dot); served at the site root; `<link rel="icon" href="/favicon.ico">` and never `rel="shortcut icon"` (non-conforming) | MDN rel reference (2026-10-07), https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel#icon; the three-frame recipe is convention, not a documented requirement |
| `icon-192.png`, `icon-512.png` | manifest `icons` with `purpose: "any"`; required for Chromium installability (192 and 512); master artwork at 1024 px | MDN "Making PWAs installable" (2026-10-06), https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable; web.dev "Add a web app manifest" (2024-09-18), https://web.dev/articles/add-manifest; web.dev install criteria (2024-09-19), https://web.dev/articles/install-criteria |
| `icon-maskable-192.png`, `icon-maskable-512.png` | separate entries with `purpose: "maskable"` (web.dev's maskable article advises against combining purposes), opaque full-bleed background, content inside the safe zone: a central circle whose radius is 40% of the icon width, so the central 80% of the diameter; the outer 10% may be cropped | web.dev "Adaptive icon support in PWAs with maskable icons" (2019-12-19), https://web.dev/articles/maskable-icon; MDN "Define your app icons" (2025-06-30), https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons; MDN manifest `icons` reference, https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons |
| `icon-monochrome-512.png` | `purpose: "monochrome"`: the browser uses only the alpha channel as a mask over a solid fill (Android themed icons) | MDN manifest `icons` reference, as above |
| `apple-touch-icon.png` | 180 × 180 PNG (167 and 152 optional), opaque, no pre-rounded corners; iOS ignores `rel="icon"` and `sizes` and uses this tag | Apple, "Configuring Web Applications" (archive, 2016-12-12), https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html; MDN rel reference |
| Android adaptive layers (only if a Play listing via TWA is made) | all layers 108 × 108 dp; the logo at least 48 × 48 dp and at most 66 × 66 dp because "the inner 66x66 dp of the icon appears within the masked viewport"; outer 18 dp on each side reserved for masking and effects. (The brief's 72 dp is older wording.) A PWA installed from Chrome uses the maskable icon for this | Android Developers, "Adaptive icons" (2026-09-22), https://developer.android.com/develop/ui/views/launch/icon_design_adaptive |
| Splash | Android: generated by Chrome from `name`, `background_color`, `theme_color` and the 512 icon; iOS: `apple-touch-startup-image` is documented only in the 2016 archive page and its behaviour on current iOS is unverified; treat as optional best-effort | Apple archive page, as above |
| `theme-color` meta | two tags with `media="(prefers-color-scheme: light)"` and `dark`, set to the two background tokens; a page tag overrides the manifest colour in Edge | MDN theme-color (2026-04-22), https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color; Microsoft Edge PWA docs (2026-09-02), https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/icon-theme-color |
| `screenshots` in the manifest (optional) | one or more per form factor for Chrome's richer install UI (320–3840 px, aspect ≤ 2.3:1, same ratio per form factor) | web.dev add-manifest, as above; Chrome blog 2023-04-20, https://developer.chrome.com/blog/richer-install-ui-desktop |
| OG image | 1200 × 630, mark plus wordmark on paper, for link previews | convention |
| Not needed | Windows `msapplication` tiles and `browserconfig.xml` are archived IE-era documentation (IE11 support ended 2022-06-15); Edge reads the manifest. Lighthouse's PWA audit category was removed in v12.0.0 (2024-04-22); check the manifest in DevTools > Application instead | https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/platform-apis/dn320426(v=vs.85); https://github.com/GoogleChrome/lighthouse/releases/tag/v12.0.0 |

---

## 5. Voice and tone

### 5.1 Ten rules, with where they come from

Sources read (accessed 2026-10-16): GOV.UK A to Z style guide and writing guidelines, now at https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/style-guides/a-to-z-style-guide/ and https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/ (the old gov.uk URLs redirect; no dates shown); 18F Content Guide, archived copy at https://guides.18f.org/content-guide/ ("Archived as of January 20, 2025"); Monzo, "Monzo tone of voice", https://monzo.com/tone-of-voice/ (no date); Mailchimp Content Style Guide, https://styleguide.mailchimp.com/ (voice-and-tone, writing-principles, grammar-and-mechanics; © 2023); Stripe: no public documentation style guide exists as far as could be found (medium confidence), so three observable conventions of https://docs.stripe.com/ are used instead; Apple Human Interface Guidelines, Writing https://developer.apple.com/design/human-interface-guidelines/writing and Inclusion https://developer.apple.com/design/human-interface-guidelines/inclusion (no dates).

1. **Every number is a numeral, with its unit, and every date has a day, month and year.** GOV.UK: "Write all other numbers in numerals (including 2 to 9)", "Always use % with a number", dates as "4 June 2017" with "no ordinal numbers for the day" and "to" in ranges; 18F: numerals in "interface labels", "use the full four-digit year", % "in tables, technical or scientific writing, headings and subheadings, interface labels"; Stripe names the unit after the amount ("0.50 USD", "Measured in seconds since the Unix epoch"). Proof of Calm adds the date to any number that can change (a price, a balance, a rule).
2. **Say what it is, not what it means for the brand.** Mailchimp: "Avoid dramatic storytelling and grandiose claims", "Tell readers what they need to know, not just what we want to say"; GOV.UK: "Be open and specific"; 18F: "In most cases, you can avoid these figures of speech by describing what you're actually doing."
3. **No filler words, no metaphors, no idioms.** GOV.UK's banned list ("deliver", "empower", "leverage (unless in the financial sense)", "key", "robust", "streamline", "utilise") and "Avoid using metaphors - they do not say what you actually mean"; Monzo: "Any metaphors and idioms should be easy to understand at first glance"; Apple: "Replace colloquial expressions with plain language."
4. **Short sentences, one idea each, active voice.** GOV.UK: "Check sentences with more than 25 words", "Paragraphs should have no more than 5 sentences", "Use the active voice"; 18F: "Express only one idea in each sentence", the "by zombies" passive test, but "You may occasionally need to use the passive voice to soften an error message."
5. **Never patronise, never make light of money.** Mailchimp: "educate people without patronizing or confusing them", "never condescending"; Monzo: financial feelings are handled "with care and never make light of them", "there's no room at all for unexplained financial jargon", "Serious isn't the same as formal"; Apple: "Consider carefully before including humor"; Monzo's channel dial for operational messages is "wit none", which is Proof of Calm's permanent setting.
6. **No exclamation marks, no interjections, no "please".** Mailchimp: "Never use exclamation points in failure messages or alerts. When in doubt, avoid!"; Apple: "Interjections like "oops!" or "uh-oh" are typically unnecessary and can sound insincere", "Send" beats "Let's do it!"; GOV.UK: "There's usually no need to say 'please' or 'please note'."
7. **Buttons are verbs; labels say what happens.** Apple: "When labeling buttons and links, it's almost always best to use a verb", "avoid using "Click here""; 18F: "Start your sentences with active verbs or clear objectives", "Focus on what the reader can do rather than what they can't."
8. **Errors: next to the problem, no blame, no "we", and what fixes it.** Apple: "display it as close to the problem as possible, avoid blame, and be clear about what someone can do to fix it", ""Choose a password with at least 8 characters"" over "That password is too short", and "Avoid using *we* altogether", "Unable to load content" over "We're having trouble"; Stripe's callouts open with a plain-language headline ("Don't use real card details.") rather than a generic "Warning" label.
9. **Sentence case everywhere; "cannot", not "can't"; contractions otherwise allowed; serial comma.** GOV.UK: "Always use sentence case, even in page titles and service names", "avoid negative contractions like 'can't' or 'don't'" because "Many users find negative contractions hard to read, or misread them as the opposite"; 18F and Mailchimp both use the serial comma; Apple asks only for consistency per element type (its own default for buttons is title case; Proof of Calm chooses sentence case).
10. **Write for the person who is stressed and the person who is skimming.** Mailchimp: "Some people will read every word you write. Others will just skim", "Lead with the main point"; Apple: "Match your tone to the context" ("trying to make a payment and received an error?"); Monzo: "What does my reader care about most?" and explain the impact of a decision before the reasoning; GOV.UK: plain English is also what "people with higher levels of literacy prefer". The Red day page is written for the stressed reader; tables are written for the skimmer.

Two places where the sources disagree and Proof of Calm picks a side: ranges (GOV.UK says "to", 18F and Mailchimp allow a dash): tables use the en dash, prose uses "to". Spaces before units (GOV.UK: "3,500kg", no space; CLDR: locale-dependent): Proof of Calm follows `Intl` and CLDR because the app is localised, and never lets a unit wrap away from its number (1.3, rule 5).

### 5.2 Microcopy

Everything below: sentence case, no exclamation marks, no emoji, numbers with a unit and a date, verbs on buttons, the user's choice named rather than implied.

Buy day, one tap:
- Button: `Bought as planned`
- Result (toast, 8 s): `Recorded: €100 of BTC on 16 Oct 2026.  Edit` (Edit opens the entry for amount, price and fee)
- Secondary: `Bought a different amount` · `Skip October`

Late month (buy day 1 Oct, today 16 Oct):
- Heading: `October is still open`
- Body: `Buy day was 1 October, 15 days ago. Record it now or skip the month.`
- Buttons: `Bought as planned` · `Skip October`
- No red, no amber; the month keeps the accent marker because it is still the thing to do.

Skip a month with a note:
- Sheet title: `Skip October`
- Field: `Note (optional)` with placeholder `e.g. car repair`
- Button: `Skip October`
- History line: `October 2026 · skipped · car repair`

Pause the plan:
- Title: `Pause the plan`
- Body: `Reminders stop. Your entries stay. When you resume, the next buy day keeps its date.`
- Button: `Pause` · Status afterwards: `Paused since 16 Oct 2026 · Resume`

End buying today:
- Title: `End buying`
- Body: `No buy days after today, 16 October 2026. Your 23 entries and your sell window stay. You can start a new plan any time.`
- Button: `End buying today` · Secondary: `Keep buying`

Delete with undo:
- Entry: toast `Entry deleted.  Undo` (8 s)
- Plan: dialog `Delete this plan and its 23 entries?` body `Export a copy first if you want to keep them.` buttons `Export CSV` · `Delete plan`; toast `Plan deleted.  Undo` (10 s, then permanent)

Backup needed:
- `Your data lives only on this device. Last export 12 Sep 2026.`
- Never exported: `Your data lives only on this device. Export a copy.` (link)

Red day page (live state; the module at rest shows the same text with illustrative numbers):
- Paragraph (numbers from a real day, 2026-02-06, Bitstamp close 70,531 against a 90-day high close of 105,972 on 2025-11-10 and a 7-day fall of 16.2%): `Bitcoin is 33% below its 90-day high and fell 16% in the last seven days (6 Feb 2026). Since 2013 it has been more than 30% below a recent high on about one day in five. Of the 118 four-year monthly plans that could have started between January 2013 and October 2022, all ended above cost, and 26% of them spent a year or more under water on the way. None of this says what the next four years will do. Your buy day is 1 March. Today is not a buy day unless you decided that earlier.`
- Below it, labelled `Your note to yourself`, the user's own sentence with its date: `12 Dec 2025: "I buy on the 1st and I do not check the price on other days."` and an `Edit` link.
- Nothing else on the page: no chart of today, no news, no sentiment, no button that buys.

Empty states:
- No entries yet (plan exists): `No entries yet. Your first buy day is 1 November 2026.`
- No entries yet (no plan): `No entries yet. Set up a plan or import a CSV.`
- No sales yet: `No sales yet. When you sell, record it here so your cost basis and the tax summary stay right.`

Offline:
- `Prices from 14:05, 16 Oct 2026 · offline` as a single ink-3 line under the figures; no banner, no colour.

Risk line at onboarding:
- `You can lose all of it. Bitcoin has fallen more than 75% from a high four times since 2011; Ethereum fell 94% in 2018. Use only money you will not need for years.`

Account prompt:
- Title: `Where should we send the monthly reminder?`
- Field: `Email` · Helper: `One email on each buy day. Nothing else.`
- Buttons: `Send reminders` · `Not now`

Errors:
- Import not recognised: `This file is not in a format Proof of Calm can read. Export a CSV from your exchange, or use the Proof of Calm format: date, asset, amount, price, fee.  See an example` (no "we", per Apple's error guidance; the sentence names the fix)
- Sale exceeds units held: `This sale is 0.021 BTC more than you hold (0.312 BTC on 16 Oct 2026). Check the amount, or add the missing buys first.`

### 5.3 Banned words and replacements

| Banned | Why | Write instead |
|---|---|---|
| recommended | advice we do not give | `default`, `most people choose`, or state the choice and its consequence |
| safe, safer | nothing here is | describe the actual risk; for custody: `in your control`, `harder to lose` |
| guaranteed | false | the number, its date, and `so far` |
| wealth | aspirational register | `savings`, `money`, `holdings` |
| moon, to the moon | hype | `rose 48% between 1 Apr and 6 Oct 2025` |
| HODL | slang | `hold`, `keep` |
| bullish, bearish | forecast register | `rising since 1 Oct`, `down 35% from the 90-day high` |
| easy, just, simply | patronising; hides effort | delete the word; list the steps |
| passive income | promise | `staking rewards` with the risk named, or nothing |
| returns (as a promise) | implies expectation | `outcome`, `value today against cost`, past tense with dates: `ended at 1.89× cost` |
| you should | advice | `you can`, or `if you want X, do Y` |
| we suggest | advice | `the default is`, `one option is` |
| best coin | advice, hype | `the coins in your plan`; comparisons only with numbers and dates |
| will rise, will recover | forecast | `has risen` (dated); in education `may`, with the stated reason and its caveat |
| expected return | forecast | `historical outcome in the bundled data (2013–2026)`; the app shows no expected return |
| smart money | hype | delete |
| don't miss | urgency | `the buy day is 1 November` |
| also avoid: opportunity, dip ("buy the dip"), free, profits (as a promise), cheap, alert, breaking, hot, trending, exclusive, unlock, boost, congratulations, "crush", "win" | urgency, hype or gamification | plain statements with a number and a date |

---

## 6. Education facts with sources

Source key for 6a–6g and 6k (all live data endpoints, accessed 2026-10-16; prices USD; "intraday" = daily candle high/low on UTC days, "close" = UTC daily close): [MP] mempool.space, `https://mempool.space/api/block-height/<h>`, `/api/block/<hash>`, `/api/v1/block/<hash>`; [BC] blockchain.com, `https://blockchain.info/block-height/<h>?format=json`; [BS] Bitstamp, `https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400`; [CB] Coinbase Exchange, `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400`; [BFX] Bitfinex, `https://api-pub.bitfinex.com/v2/candles/trade:1D:tBTCUSD/hist`; [CMC] CoinMarketCap daily historical quotes, `https://api.coinmarketcap.com/data-api/v3/cryptocurrency/historical?id=<id>&convertId=2781` (the data behind `https://coinmarketcap.com/currencies/<coin>/historical-data/`); [CG] CoinGecko, `https://api.coingecko.com/api/v3/coins/<id>`; [BTY] bitcoinity.org Mt. Gox daily export, `https://data.bitcoinity.org/export_data.csv?currency=USD&data_type=price&exchange=mtgox&r=day&t=l&timespan=all`; [CM] Coin Metrics community API, `https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=PriceUSD&frequency=1d`. Two independent pulls were made (one for this report's bundled data, one by a fact-checking agent) and agree to the dollar where they overlap. Pre-2013 CoinMarketCap data is a backfilled composite of undocumented provenance; where it matters, the Mt. Gox and Bitstamp figures are given beside it.

### 6a. Halvings

| Block | Timestamp (UTC), [MP] and [BC] agree | Subsidy before → after (coinbase reward minus fees, [MP] block extras) | Confidence |
|---|---|---|---|
| 210,000 | 2012-11-28 15:24:38 | 50 → 25 BTC (block 209,999 paid 50.5362 with 0.5362 fees; 210,000 paid 38.5630 with 13.5630 fees) | high |
| 420,000 | 2016-07-09 16:46:13 | 25 → 12.5 BTC | high |
| 630,000 | 2020-05-11 19:23:43 | 12.5 → 6.25 BTC | high |
| 840,000 | 2024-04-20 00:09:27 | 6.25 → 3.125 BTC (block 840,000 paid 40.7506 of which 37.6256 was fees) | high |

Next halving: block 1,050,000, subsidy 3.125 → 1.5625 BTC. Chain tip at access: height 971,733 (2026-10-16 about 16:10 UTC) [MP], so 78,267 blocks remain. At the protocol's 10-minute target that is 2028-04-12; the average since block 840,000 (596.6 s) gives 2028-04-09; the last 2,016 blocks (566.6 s) give 2028-03-12; every 10 s of average block time moves the date by about nine days. Countdown sites use the same arithmetic (bitcoinblockhalf.com shows 12 Apr 2028 04:58 UTC on the 10-minute rule; coinwarz.com shows 12 Apr 2028 16:35 UTC on the last-20,160-block average; medium confidence, methods implied). Statement for the module: "Block 1,050,000, expected around April 2028; the date moves with block times, so the app recomputes it from the current height." Confidence high for the heights and timestamps, medium for any date.

### 6b. Cycle peaks and troughs

One series per cycle; the spread across sources is shown because the module will be checked against whatever chart a reader has open.

| Cycle | Peak | Trough | Drawdown |
|---|---|---|---|
| 2011 | Mt. Gox $31.91 intraday on 2011-06-08 ([BTY] max column; Bitcoin wiki "History" agrees). CMC composite shows up to $35.88 on 2011-06-11 (medium) | about $2: CMC $1.92 on 2011-11-22 (medium); Bitstamp, then a thin market, $2.22 on 2011-10-20 (high); Mt. Gox trade-level low not retrievable ([BTY] has gaps in Oct–Nov 2011) | −93% to −94% |
| 2013–2015 | Mt. Gox $1,242 intraday on 2013-11-29 ([BTY]); Bitstamp $1,163 on 2013-11-30 (close peak $1,132 on 2013-12-04); CMC $1,156.14 on 2013-11-30 | 2015-01-14 on every source: Bitstamp $152.40 (close $171.41); CMC $171.51 (close $178.10); Bitfinex $166.45 | −86.9% (Bitstamp); −85.2% (CMC); −84.5% on CMC closes |
| 2017–2018 | 2017-12-17 intraday: Bitstamp $19,666; Coinbase $19,892; CMC $20,089 (12:19 UTC). Highest close 2017-12-16 (Bitstamp $19,188; CMC $19,497) | 2018-12-15 intraday: Bitstamp $3,122.28; Coinbase $3,128.89; CMC $3,191.30 (close $3,236.76) | −84.1% (Bitstamp and CMC intraday); −83.4% on closes |
| 2021–2022 | 2021-11-10 intraday: Bitstamp and Coinbase $69,000.00; CMC $68,789.63. Highest close 2021-11-08 (Bitstamp $67,559; CMC $67,567) | 2022-11-21 intraday: Coinbase $15,460; Bitstamp $15,479; CMC $15,599 (close $15,787) | −77.6% (Bitstamp/Coinbase); −77.3% (CMC); −76.6% on closes |
| 2024–? (current) | 2025-10-06 intraday on every source: Bitstamp $126,272; Coinbase $126,296; CMC $126,198.07 (CMC coin page "All-time high $126,198.07, Oct 06, 2025"); CoinGecko $126,080 (`ath_date` 2025-10-06T10:57:42Z). Highest close 2025-10-06: Bitstamp $124,728; CMC $124,752.53 | lowest since: 2026-07-01 intraday, Coinbase $57,717.55; Bitstamp $57,734.63; CMC $57,747.76; lowest close 2026-06-30, Bitstamp $58,526.17, CMC $58,558.86 | −54.3% intraday; −53.1% on closes; so far |

All rows high confidence except the 2011 figures (medium: Mt. Gox and composite data). Earlier highs in 2025 for context (Bitstamp closes): $106,149 on 2025-01-21, a low of $76,244 on 2025-04-08, $123,360 on 2025-08-13.

The current cycle so far (Bitstamp; CMC within $150 unless shown): after the 2025-10-06 high the 2025-10-10 crash took the intraday low to $109,683 (Bitstamp; CMC $104,582 at 21:21 UTC) with the day closing near $113,000; month-end closes then ran $109,554 (Oct 2025), $90,382 (Nov; low $80,537 on 2025-11-21), $87,496 (Dec), $78,635 (Jan 2026; high $97,939 on 2026-01-14), $66,985 (Feb; low $59,930 on 2026-02-06, the day after a fall from $73,175 to $62,200), $68,215 (Mar), $76,310 (Apr), $73,568 (May; high $82,833 on 2026-05-06), $58,526 (Jun; the lowest close, 2026-06-30), $62,818 (Jul; low $57,735 on 2026-07-01), $78,571 (Aug), $83,563 (Sep; high $87,374 on 2026-09-21, the highest since January), and $81,533 at about 16:00 UTC on 2026-10-16 (CoinGecko $81,545, Coinbase $81,492, CMC $81,473 at the same time). Every day with an intraday low under $60,000 since the high: 2026-02-06, 2026-06-05, 2026-06-06 and 2026-06-24 to 2026-07-02. Today's price is 35.4% below the high and 41% above the low, 375 days after the high. Whether 2025-10-06 was this cycle's peak is unknown; the module must say "the 2025 high" and not "the peak". Secondary context, snippets only (low): Bloomberg 2026-02-05 "Bitcoin Falls Below $70,000 as Forced Deleveraging Hits Crypto Markets"; Bloomberg 2026-06-05 "Bitcoin Drops Below $60,000 for First Time Since Trump's 2024 Re-Election"; CNBC 2026-06-24 "Bitcoin falls back under $60,000, hitting its lowest level since October 2024"; CoinDesk 2026-02-24 (read, medium) "Bitcoin drifts toward $60,000 as traders brace for potential washout", `https://www.coindesk.com/markets/2026/02/24/crypto-markets-bleed-as-bitcoin-hovers-above-liquidation-zone`. The causes those pieces name (ETF outflows, an equity selloff, leverage unwinds, inflation prints) are not verified here and do not belong in the module.

### 6c. Months from halving to the cycle high

| Halving | Cycle high used | Days | Months (÷ 30.44) |
|---|---|---|---|
| 2012-11-28 | 2013-11-29 (Mt. Gox $1,242) or 2013-11-30 (Bitstamp $1,163) | 366–367 | 12.0–12.1 (12.2 to the highest close, 2013-12-04) |
| 2016-07-09 | 2017-12-17 | 526 | 17.3 |
| 2020-05-11 | 2021-11-10 | 548 | 18.0 |
| 2024-04-20 | 2025-10-06 (the high so far) | 534 | 17.5 |

Confidence high (dates above). The 2013 interval is the only one that moves by more than a day with the choice of peak.

### 6d. ETH, SOL and LINK maximum drawdowns

| Episode | Peak | Trough | Fall |
|---|---|---|---|
| ETH 2018 | 2018-01-13: CMC $1,432.88 (21:04 UTC); Bitstamp $1,420.00; Coinbase $1,419.96 | 2018-12-14 on exchanges: Coinbase $80.60 (close $83.00), Bitstamp $80.90; CMC $82.83 on 2018-12-15 | −94.3% (exchanges); −94.2% (CMC); −94.0% on closes |
| ETH 2022 | 2021-11-10: Bitstamp $4,868.79; Coinbase $4,867.81; CMC $4,859.50 (CMC also carries an isolated $4,891.70 print stamped 2021-11-16 that no exchange shows; treat as a bad print) | 2022-06-18 on all sources: Coinbase $879.80; Bitstamp $880.00; CMC $896.11; closes $993.64 | −81.9% (exchanges); −81.6% (CMC); −79.4% on closes |
| SOL 2022 | 2021-11-06: CMC $260.06; Coinbase $260.00 | 2022-12-29: Coinbase $8.00; CMC $8.14; close $9.64 | −96.9%; −96.3% on closes |
| LINK 2018 | 2018-01-08: CMC $1.435 (no USD pair on Bitstamp, Coinbase or Bitfinex then; CMC only, medium-high) | 2018-06-29: CMC $0.1621, the minimum for all of Feb–Dec 2018 | −88.7%; −87.9% on closes |
| LINK March 2020 | 2020-03-04: CMC $4.95; Coinbase $4.977 | 2020-03-13: CMC $1.507; Coinbase $1.515 | −69.6%; −62.3% on closes |
| LINK 2022 | 2021-05-10: Bitstamp and Bitfinex $53.00; Coinbase $52.99; CMC $52.88 (CMC page "All-time high $52.88, May 10, 2021"; still the all-time high) | 2022-06-13, not 06-18: Coinbase $5.286; Bitstamp $5.30; CMC $5.36 (the 06-18 lows were $5.41–5.47) | −90.0% (exchanges); −89.9% (CMC); −88.7% on closes |

Confidence high except LINK 2018 (medium-high). Today (Coinbase, about 16:00 UTC): ETH $2,439, SOL $104, LINK $12.39, so LINK is still 77% below its 2021 high and SOL 60% below its 2021 high, which is the honest counterweight to any "every coin recovers" reading of the Bitcoin tables.

### 6e. Diminishing returns

Peak-to-peak multiples of the cycle highs: 2011 → 2013 about 36–39× (Mt. Gox $31.91 → $1,242 is 38.9×; → Bitstamp $1,163 is 36.5×; very source-sensitive); 2013 → 2017 16.2–17.4×; 2017 → 2021 3.4–3.5×; 2021 → 2025 1.83× on every source (Bitstamp $69,000 → $126,272). Trough-to-peak within each cycle: about 520–620× (2011 low → 2013 high), 110–130× (2015 → 2017), 21–22× (2018 → 2021), 8.1–8.2× (2022 → 2025). Drawdown sequence, intraday: −94%, −87% (Bitstamp; −85% CMC), −84%, −77%, −54% so far. Arithmetic high; the spread comes only from the source choice for 2011–2015.

The caveat that must sit under the chart: four completed cycles are four data points. A falling sequence of multiples is consistent with a maturing, larger asset and also consistent with coincidence; the series cannot tell those apart, and the current cycle's figures are not final (its high may not have been the peak, its low may not have been the bottom). The multiples are also measured on the asset that survived; nothing in them says the next peak is higher than the last. The module may state the numbers and this paragraph, and must not fit a curve, draw a projection, or use the word "pattern" without "not".

### 6f. DCA statistics

Audit of the publishers named in the brief (pages read 2026-10-16): dcabtc.com publishes a simulator with a FAQ but names no price source, fee assumption, date range or aggregate statistic ("brought to you by CoinDiligent"); casebitcoin.com (`https://casebitcoin.com/charts`, "Data Source: Messari.io, bitcoincharts.com") shows an ROI table that matches a recomputation (at $81,460: 1 y −24%, 4 y +318%, 5 y +32%) but documents no window rules and carries stale boilerplate; costavg.com is the most transparent calculator (Kraken prices, fee presets, XIRR) but publishes no aggregate; Swan/Nakamoto Portfolio's "Running the Numbers: Dollar Cost Averaging vs. Lump-sum Investing" (Callahan and Zagury, 2023-04-13, `https://nakamotoportfolio.com/static/docs/DCA_Lumpsum.pdf`, code at `https://github.com/pxsocs/allocator`, CryptoCompare closes, no fees) is reproducible but a 2023 snapshot whose finding is that lump sums usually beat DCA, which is useful for honesty and not a window statistic; River's "Does timing matter for recurring bitcoin buys?" (2026-01-06, `https://river.com/content/dca-research-2026`) is a 2023–2025 buy-timing backtest (best vs worst weekly slot differ by 0.77%) with an unnamed price source; Fidelity Digital Assets' reports ("Getting Off Zero: Evaluating Bitcoin in 2026", 2026-03-25) contain no rolling-window or DCA statistic. Swan's marketing pages ("1,227 days to break even", a homepage counter) give no method. Conclusion: there is no trustworthy published statistic to cite, so Proof of Calm computes its own from bundled data and cites nothing else. The two independent computations made for this report agree:

- Monthly DCA, $100 on the 1st of each month, valued one month after the last buy, every start month from 2013-01 to the last feasible (Bitstamp daily closes here; Coin Metrics `PriceUSD` daily reference rate in the cross-check, identical results): 48-month windows 118 of 118 above cost (100%), minimum 1.373× (buys 2019-01 to 2022-12, valued 2023-01-01), median 4.04×, maximum 27.8×, and 26% of windows spent 12 or more consecutive month-ends under water; with a 1% fee per buy still 118/118 (minimum 1.36×). 60-month 106/106. 36-month 126 of 130 (96.9%, minimum 0.90×). 24-month 114 of 142 (80.3%, minimum 0.51×). 12-month 110 of 154 (71.4%, minimum 0.45×). ETH on Coinbase closes from 2017-01: 48-month windows 63 of 70 (90%), minimum 0.75×.
- Lump-sum rolling returns on Coin Metrics daily prices (every day t, P(t) / P(t − 4 calendar years), 4,473 windows ending 2014-07-18 to 2026-10-15): none negative; minimum +31.7% (2021-04-13 $63,446 → 2025-04-13 $83,569, a 4-year CAGR of 7.1%); 48 days between 2025-03-09 and 2026-04-04 had a 4-year return under +50%, which had never happened before 2025. The claim does not extend to five years: the 5-year return was negative on nine days (2022-12-07 to 2023-01-06, worst −15.4%, 2017-12-16 $19,641 → 2022-12-16 $16,606), the 3-year return on 33 of 4,838 days (worst −35.2%), the 2-year return on 15.9% of days. The next stress point is the 5-year windows ending in November 2026 against the November 2021 high.
- How to say it in the module: "Every four-year monthly plan in our data (118 start months, January 2013 to October 2022, Bitstamp prices, no fees) ended above cost; the worst ended at 1.37× and a quarter of them were under water for a year or more. Over three years, 4 of 130 ended below cost; over one year, 44 of 154. Computed 2026-10-16; this is one asset's past, not a forecast." Never "never loses", never "always", and the five-year result above is the reason.
- The honest counterweight, from a regulator: BIS Working Paper 1049, Auer, Cornelli, Doerr, Frost and Gambacorta, "Crypto trading and Bitcoin prices: evidence from a new database of retail adoption", 2022-11-14, `https://www.bis.org/publ/work1049.htm`: "an estimated 73-81% of retail investors have likely lost money on their initial investment" (app-adoption data, 95 countries, 2015–2022, described by the authors as back-of-the-envelope); BIS Bulletin 69, 2023-02-20, `https://www.bis.org/publ/bisbull69.htm`: "a majority of crypto app users in nearly all economies made losses on their bitcoin holdings". Confidence high for the quotes. People buy at peaks and sell in troughs; the window statistics assume the opposite discipline, which is the product's whole point.

### 6g. Fear & Greed indices

- alternative.me Crypto Fear & Greed Index, `https://alternative.me/crypto/fear-and-greed-index/` (API `https://api.alternative.me/fng/`; earliest record 2018-02-01, value 30; 3,176 daily records to 2026-10-16): Bitcoin-only, 0 (extreme fear) to 100 (extreme greed), six inputs as headed on the page: Volatility 25% (current volatility and drawdowns against 30- and 90-day averages), Market Momentum/Volume 25%, Social Media 15% (Twitter hashtag volume and interaction rates), Surveys 15% (weekly polls, marked "currently paused"), Dominance 10% (Bitcoin's market-cap share, rising dominance read as fear), Trends 10% (Google Trends); the page does not say how the paused 15% is redistributed. Reading on 2026-10-16: 63 "Greed" (53 the day before). Confidence high.
- CoinMarketCap CMC Crypto Fear and Greed Index, `https://coinmarketcap.com/charts/fear-and-greed-index/`, launched 2023-08-03 (CMC Academy article and Chainwire release of that date), history from 2023-06-29: five components with undisclosed weights ("a complex weighting system"): Price Momentum (top-10 coins ex-stablecoins), Volatility (Volmex 30-day implied-volatility indices BVIV and EVIV), Derivatives Market (BTC and ETH options put/call ratio), Market Composition (Stablecoin Supply Ratio) and CMC Proprietary Data (search and engagement); bands 1–19 Extreme Fear, 20–39 Fear, 40–59 Neutral, 60–79 Greed, 80–100 Extreme Greed (API docs, `https://coinmarketcap.com/api/documentation/pro-api-reference/global-metrics`). Reading on 2026-10-16: 49 "Neutral"; its 2026 low was 5 on 2026-02-06, the day of the February price low. Confidence high.
- For the Noise module: the two indices disagreed by 14 points on the same day; one has a paused component with an undisclosed fallback and the other undisclosed weights; both are descriptions of the recent past dressed as a mood. That is the one-paragraph reason the app shows neither.

### 6h. Scams and losses

Chainalysis figures are revised upward for a year or more after first publication as more illicit addresses are identified, so every number must carry its vintage.

| Figure | Value | Source (Chainalysis blog) | Confidence |
|---|---|---|---|
| Illicit volume 2024, first estimate | "$40.9 billion", "we estimate the total may be closer to $51 billion" | 2025 Crypto Crime Report introduction, 2025-01-15, https://www.chainalysis.com/blog/2025-crypto-crime-report-introduction/ | high |
| Illicit volume 2024, revised | "$57.2 billion" | 2026 Crypto Crime Report introduction, 2026-01-08, https://www.chainalysis.com/blog/2026-crypto-crime-report-introduction/ | high |
| Illicit volume 2023, revised | $24.2bn → "$46.1 billion" | 2025 introduction, as above | high |
| Scam revenue 2024 | "at least $9.9 billion on-chain", "could surpass the $12 billion threshold"; pig-butchering revenue "grew nearly 40% YoY"; high-yield investment scams 50.2% and pig butchering 33.2% of scam inflows | 2025-02-13, https://www.chainalysis.com/blog/2024-pig-butchering-scam-revenue-grows-yoy/ ; recalculated to "$12 billion" in the 2026 scams chapter | high |
| Address poisoning 2024 | "crypto sent to address poisoning scams grew over 15,000%, largely driven by a single massive attack in May" | same 2025-02-13 page | high |
| Stolen funds 2024 | "$2.2 billion" (+21%), 303 incidents, DPRK "$1.34 billion" (61%), private-key compromises 43.8% | 2024-12-19, https://www.chainalysis.com/blog/crypto-hacking-stolen-funds-2025/ | high |
| Illicit volume 2025 | "at least $154 billion", a lower bound; stablecoins "84% of all illicit transaction volume"; illicit share of on-chain volume "below 1%" | 2026 introduction, 2026-01-08 | high |
| Scam revenue 2025 | "at least $14 billion on-chain", projected to "exceed $17 billion"; impersonation scams "growing more than 1400% compared to 2024"; AI-enabled operations "$3.2 million per operation compared to $719,000" | 2026-01-13, https://www.chainalysis.com/blog/crypto-scams-2026/ | high |
| Stolen funds 2025 | "over $3.4 billion in theft from January through early December 2025"; Bybit, February 2025, "$1.5 billion", "the largest single hack in crypto history"; DPRK "at least $2.02 billion"; personal-wallet compromises $713m, 20% of value stolen; "158,000" theft incidents; "at least 80,000" victims | 2025-12-18, https://www.chainalysis.com/blog/crypto-hacking-stolen-funds-2026/ | high |

US FTC Consumer Sentinel: 2024 (Data Book 2024, https://www.ftc.gov/system/files/ftc_gov/pdf/csn-annual-data-book-2024.pdf, and press release 2025-03-10, https://www.ftc.gov/news-events/news/press-releases/2025/03/new-ftc-data-show-big-jump-reported-losses-fraud-125-billion-2024): "more than $12.5 billion to fraud in 2024" from 2.6 million fraud reports; investment scams "$5.7 billion", the largest category; by payment method, bank transfers "$2.09 billion" then "Cryptocurrency ($1.42 billion)"; median loss "$497" overall, "$9,196" for investment-related reports. 2025 (FTC testimony to the Joint Economic Committee, 2026-03-25, https://www.ftc.gov/system/files/ftc_gov/pdf/ftc-testimony-jec-hearing-on-the-rising-scam-economy.pdf; release 2026-06-15): "3 million fraud reports … $15.9 billion in losses"; investment scams "over $7.9 billion", "approximately half of the total reported fraud losses", average individual loss "over $10,000"; imposter scams "$3.5 billion". No 2025 Data Book was published by 2026-10-16; the 2025 crypto-payment total sits in the FTC's Tableau dashboard and was not verified. Data spotlights: Bitcoin ATMs, 2024-09-03 (https://www.ftc.gov/news-events/data-visualizations/data-spotlight/2024/09/bitcoin-atms-payment-portal-scammers): BTM losses "topping $65 million" in the first half of 2024, median $10,000, people over 60 about 71%; social media, 2026-04-27: "$2.1 billion" lost to social-media scams in 2025, "$1.1 billion … to investment scammers". All high.

UK: City of London Police (national lead for fraud), April 2025: "over £649m lost to investment fraud in 2024" (+16%), and "cryptocurrency continued to be the most common asset fraudsters claimed to be investing in, accounting for 66 per cent of all reports" (a share of reports, not of losses; https://www.cityoflondon.police.uk/news/city-of-london/news/2025/april/city-of-london-police-over-649m-lost-to-investment-fraud-in-2024-with-cryptocurrency-fraud-on-the-rise/ ; medium, the police sites block automated fetches). 2025: "£879.8 million through investment fraud", 34,673 reports, average £25,612 (+31%); Action Fraud was replaced by "Report Fraud" in December 2025 (CoLP release, April 2026; medium). FCA Cryptoassets consumer research 2025, Wave 6 (https://www.fca.org.uk/publication/research-notes/cryptoasset-consumer-research-2025-wave-6.pdf; fieldwork 5 Aug–2 Sep 2025, n = 2,353 plus a 1,053 boost; high for content): "the percentage of the UK adult population currently holding cryptoassets has declined from 12% in 2024 to 8% in 2025", still "double the proportion" of 2021; buying "as a gamble that could make or lose money has risen by 4 percentage points to 30%"; among crypto users "7% saying they have personally been a victim" of a scam, most often "social media scams including fake endorsements or giveaway scams (41%)" and "fake websites or phishing attempts (40%)". FCA 2024 (https://www.fca.org.uk/news/press-releases/fca-finds-crypto-ownership-continues-rise-it-delivers-plans-regulate-crypto, 2024-11-26): average holding £1,842; first year of the promotions regime "issuing 1702 alerts, taking down over 900 scam crypto websites and over 50 apps". High.

The common patterns, one authoritative description each (all high):

- Fake exchanges, websites and apps. FTC, "What To Know About Cryptocurrency and Scams", https://consumer.ftc.gov/articles/what-know-about-cryptocurrency-and-scams: "The investment website they steer you to looks real, but it's really fake, and so are their promises." ESAs factsheet "Crypto frauds & scams", 2025-12, https://www.esma.europa.eu/sites/default/files/2025-12/Crypto_fraud_and_scams_factsheet.pdf: warning sign "Unknown exchange platform"; "The message invites you to log in or download a new app."
- Pig-butchering (romance-investment). FinCEN Alert FIN-2023-Alert005, 2023-09-08, https://www.fincen.gov/sites/default/files/shared/FinCEN_Alert_Pig_Butchering_FINAL_508c.pdf: scammers "leverage fictitious identities, the guise of potential relationships, and elaborate storylines to 'fatten up' the victim", then "the 'butchering' phase involves convincing victims to invest in virtual currency".
- Fake support and impersonation. ESAs factsheet: "you receive an unexpected direct message (DM) or an email from someone pretending to be a trusted contact (e.g., a crypto-exchange, wallet provider, IT support, or even a friend). The person asks for your seed phrase … passwords, or private keys".
- Seed-phrase phishing. ESAs factsheet: "Never share passwords, private keys, or seed phrases: Anyone with access to them can take control of your assets. Legitimate companies will never ask for your passwords or security codes by email, text, or phone." Ledger Academy, https://www.ledger.com/academy/crypto/what-is-a-recovery-phrase (updated 2026-06-19): "It's vital to never enter it into a computer or smartphone and to never share it with anyone."
- "Guaranteed returns". FTC, as above: "Only scammers will guarantee profits or big returns." FCA ScamSmart, https://www.fca.org.uk/scamsmart/how-avoid-investment-scams: "Fraudsters often promise tempting rewards, such as high returns on an investment."
- Address poisoning. ESAs factsheet: "Scammers can make fake wallet addresses appear in your transaction history by sending a tiny amount of crypto from a look-alike address to your wallet." and "When you try to send crypto and copy the wrong address from your wallet history, you unknowingly send funds to the scammer's wallet." Chainalysis mechanism (2025-02-13): the scammer generates "a new crypto address similar to one the target interacts with regularly" and sends "a small transaction from this newly created address to 'poison' the target's address book."

### 6i. Exchange and custody failures

| Event | Dates | Size | Primary source | Confidence |
|---|---|---|---|---|
| Mt. Gox | withdrawals halted 2014-02-07 (medium); site closed noon JST 2014-02-25; civil rehabilitation application announced 2014-02-28 | "approximately 750,000 bitcoins deposited by users and approximately 100,000 bitcoins belonging to us had disappeared"; on 2014-03-20 "approximately 200,000 BTC" found in an old wallet, so about 650,000 BTC missing; about US$473m at the time (Reuters 2014-02-28, via secondary; medium) | MtGox Co., Ltd. announcements, https://www.mtgox.com/img/pdf/20140228-announcement_eng.pdf and https://www.mtgox.com/img/pdf/20140320-btc-announce.pdf | high |
| QuadrigaCX | founder's death (December 2018) announced 2019-01-14; platform ceased and filed for creditor protection by 2019-02-05 | "Over 76,000 clients were owed a combined $215 million in assets" (CAD); the trustee "was able to recover or identify just $46 million"; "Most of the $169 million asset shortfall resulted from Cotten's fraudulent conduct"; "Quadriga operated like a Ponzi scheme" | Ontario Securities Commission staff report, cover date 2020-04-14, https://www.osc.ca/quadrigacxreport/ | high (the brief's C$190m / US$145m were the February 2019 filing figures) |
| Celsius | withdrawals halted 2022-06-12; Chapter 11 2022-07-13 (S.D.N.Y. 22-10964) | FTC judgment "$4.7 billion, which will be suspended"; executives "misappropriated these deposits totaling more than $4 billion"; "$4.7bn owed" and "1.7 million customers" come from the first-day declaration (medium) | SEC release 2023-133, https://www.sec.gov/news/press-release/2023-133 ; docket https://cases.stretto.com/celsius/ ; FTC 2023-07-13, https://www.ftc.gov/news-events/news/press-releases/2023/07/ftc-reaches-settlement-crypto-platform-celsius-network-charges-former-executives-duping-consumers | high |
| Voyager Digital | accounts frozen 2022-07-01; Chapter 11 2022-07-05 (medium for the exact dates) | customers "lost more than $1 billion in crypto assets"; FTC judgment "$1.65 billion, which will be suspended"; 3.5m users and $1.3bn of crypto are first-day-declaration figures (low–medium) | FTC 2023-10-12, https://www.ftc.gov/news-events/news/press-releases/2023/10/ftc-reaches-settlement-crypto-company-voyager-digital-charges-former-executive-falsely-claiming | high for the FTC figures |
| FTX | withdrawals stopped 2022-11-08 to 11-10 ("On November 10, FTX and FTX US halted all trading and withdrawals"); Chapter 11 2022-11-11, 134 companies, D. Del. | "over $8 billion in customer deposits were now missing"; more than one million creditors (15 Nov 2022 filing; medium); Bankman-Fried convicted on seven counts 2023-11-02 and sentenced to 25 years 2024-03-28 (DOJ releases; medium, bot-challenge pages) | CFTC complaint 2022-12-13, https://www.cftc.gov/media/7986/enfsamuelbankman-friedcomplaint121322/download ; CFTC release 8638-22 | high |

Self-custody basics, with sources (all high): bitcoin.org "Securing your wallet", https://bitcoin.org/en/secure-your-wallet: "An offline wallet, also known as cold storage, provides the highest level of security for savings"; "Hardware wallets are the best balance between very high security and ease of use"; keep only "small amounts of bitcoins on your computer or mobile device for everyday use"; a backup "can protect you against computer failures and many human mistakes". Ledger Academy, "Best practices when using a hardware wallet", https://www.ledger.com/academy/hardwarewallet/best-practices-when-using-a-hardware-wallet (updated 2024-05-07): "You must verify the recipient address shown on your screen by displaying it on your device"; "we recommend sending a small amount first, to make sure that you have properly received it"; "Never ever share your 24-word secret recovery phrase, also known as a seed phrase, in any form, with anyone." ESAs revised warning, 2025-10-06: "Losing private keys to crypto-assets results in the permanent and irreversible loss of access and ownership." (Trezor's documentation URLs could not be reached; not cited.) Module sentences that follow: the seed phrase is the money; it is written on paper or metal, never typed into a website or photographed; a hardware wallet signs on its own screen, so the address is checked there; the first transfer to a new address is a small one.

### 6j. Emergency fund guidance

- FCA InvestSmart, "Should you invest?", https://www.fca.org.uk/investsmart/should-you-invest (updated 2025-05-16): "Many experts recommend having an emergency fund that can cover your outgoings for between 3 and 6 months." High.
- BaFin, "Das kleine Einmaleins der Geldanlage", https://www.bafin.de/DE/verbraucherinnen-verbraucher/themen-finanzprodukte/geldanlage/einmaleins-der-geldanlage/einmaleins-der-geldanlage.html: "Als Faustregel für die Höhe einer sofort verfügbaren Geldreserve werden von Expertinnen und Experten häufig drei Monatseinkommen empfohlen." High.
- CFPB, "An essential guide to building an emergency fund", https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/ (modified 2025-10-29): defines the fund and says "The amount you need to have in an emergency savings fund depends on your situation", with no month count. High.
- CCPC (Ireland) mentions an "'emergency fund' savings to cover unexpected loss of income or unexpected expenses" without a number (https://www.ccpc.ie/manage-your-money/saving-and-investments/the-difference-between-saving-and-investing). Todos Contam (Banco de Portugal) and MoneyHelper (UK) block automated access, so their wording is unverified (low); do not cite them until read by hand.
- For the module: "The FCA's guidance is an emergency fund of three to six months of outgoings; BaFin's rule of thumb is three months' income. Until that exists, a monthly plan is money you may be forced to sell." The number is attributed, not ours.

### 6k. Leverage and liquidations

- The 10–11 October 2025 event. CoinGlass's own post, @coinglass_com, 2025-10-10 23:48 UTC, `https://x.com/coinglass_com/status/1976796969961193641`: "The largest liquidation event in crypto history. In the past 24 hours, 1,618,240 traders were liquidated, with a total liquidation amount of $19.13 billion. The actual total is likely much higher — #Binance only reports one liquidation order per second." Confidence high (text read via X's oEmbed endpoint). The later headline figures ($19.2bn and 1.64m; $19.35bn and 1.67m) are later readings of the same rolling 24-hour counter. CoinGlass, "2025 Crypto Derivatives Market Annual Report", `https://www.coinglass.com/learn/2025-annual-report-en` (data to 2025-11-20): liquidations "exceeded $19 billion, far surpassing the single-day highs of all previous liquidation rounds", longs about 85–90% of the total, and "the actual nominal liquidation scale likely approached $30–40 billion" because of exchange reporting caps (Binance's futures stream documents "only the latest one liquidation order within 1000ms will be pushed", `https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/All-Market-Liquidation-Order-Streams`). CoinDesk Research, 2025-10-17, `https://www.coindesk.com/research/market-spotlight-the-19-billion-liquidation-that-shook-crypto`: perpetual open interest fell from $217bn on 10 October to $123bn on 11 October (−43%) (medium-high). About 70% of the tracked liquidations happened between 20:50 and 21:30 UTC on 10 October, peaking at $3.21bn in one minute at 21:15 UTC (Amberdata via CoinGecko Learn, updated 2026-02-06, medium). Bitcoin's intraday low that day was $104,582 on CMC and $109,683 on Bitstamp, from about $122,000 a day earlier; it closed near $113,000. "Largest on record" means largest in CoinGlass's dataset; the prior high was about $2bn on 2025-02-03 (secondary, medium), while older Bybt-era figures for 2021-05-19 (about $8–10bn) are unresolved (low).
- Steady state. CoinGlass annual report: 2025 liquidations to 20 November "approximated $150 billion", "a daily average of roughly $400–500 million". CoinGlass "2026 Semi-Annual Cryptocurrency Derivatives Market Report", `https://www.coinglass.com/learn/2026h1-market-report-en`: $73.35bn in the first half of 2026, "averaging approximately US$405 million per day", longs 62%, largest day $2.588bn on 2026-01-31. Confidence high (publisher's reports; sample exchanges unnamed).
- Who loses. ESMA, press release ESMA71-98-128, 2018-03-27, `https://www.esma.europa.eu/press-news/esma-news/esma-agrees-prohibit-binary-options-and-restrict-cfds-protect-retail-investors`: national analyses "shows that 74-89% of retail accounts typically lose money on their investments, with average losses per client ranging from €1,600 to €29,000"; the formal Decision (EU) 2018/796 recital 35 lists the national studies (CySEC 76%, AMF over 89%, Central Bank of Ireland 74–75%, FCA 82%). FCA CP16/40, December 2016: "82% of clients lose money on these products. The average outcome was a loss of £2,200 per client". The FCA banned the sale of crypto derivatives to retail consumers from 2021-01-06 (press release 2020-10-06, `https://www.fca.org.uk/news/press-releases/fca-bans-sale-crypto-derivatives-retail-consumers`). Crypto-specific: BIS WP 1049 above (73–81% of retail app users likely lost money, 2015–2022); Soska et al., "Towards Understanding Cryptocurrency Derivatives: A Case Study of BitMEX", WWW 2021: $30.5bn of long against $18.3bn of short liquidations on BitMEX's perpetual, 2017–2020, with effective leverage of 20–35×. All high.
- Why the app says no leverage, in the module's words: "A monthly plan only works if you can hold through a fall of 54% to 94%, because that is what the data contains. Leverage turns a fall into a forced sale at the bottom: on 10 October 2025, 1.6 million accounts were closed for them in 24 hours. Proof of Calm has no leverage, no margin and no liquidation price, so there is nothing here that can sell your coins for you."

### 6l. Standard risk-warning phrasings to adapt

- ESAs (EBA, ESMA, EIOPA) joint warning on crypto-assets, ESA 2022 15, 2022-03-17, https://www.esma.europa.eu/sites/default/files/library/esa_2022_15_joint_esas_warning_on_crypto-assets.pdf: "many crypto-assets are highly risky and speculative"; "Consumers face the very real possibility of losing all their invested money if they buy these assets"; the list "you may lose all the money you invest; prices can fall and rise quickly over short periods; you may fall victim to scams, fraud, operational errors or cyber attacks; and you are unlikely to have any rights to protection or compensation if things go wrong"; the question "can you afford to lose all the money you invest?" High.
- ESAs revised warning, 2025-10-06, https://www.esma.europa.eu/sites/default/files/2025-10/Joint_ESAs_revised_warning_on_crypto-assets.pdf, titled "Crypto-assets can be risky and your protection, if any, may be limited": "While a new regulation known as MiCA … is now in place in the EU … most crypto-assets typically remain volatile and highly risky"; "You may lose a lot, or even all, of the money invested"; MiCA protections "are not as extensive as those applicable to more traditional financial products (e.g. you will not benefit from compensation schemes)"; a transitional period "applies until July 2026 in some Member States" during which unauthorised providers give "no MiCA protections". High. BaFin publishes the same text in German (Meldung 2025-10-06): "Kryptowerte können riskant sein und Ihr Schutz, falls vorhanden, kann begrenzt sein"; "Sie können viel oder sogar alles von dem investierten Geld verlieren." https://www.eba.europa.eu/sites/default/files/2025-10/3454ea12-eda0-4f22-b1f6-f883c61017a5/Updated%20Joint%20ESAs%20revised%20warning%20on%20crypto-assets_DE.pdf . High.
- MiCA, Regulation (EU) 2023/1114, Article 6(5), the statements every crypto-asset white paper must carry (https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32023R1114): "(a) the crypto-asset may lose its value in part or in full; (b) the crypto-asset may not always be transferable; (c) the crypto-asset may not be liquid; … (e) the crypto-asset is not covered by the investor compensation schemes under Directive 97/9/EC …; (f) the crypto-asset is not covered by the deposit guarantee schemes under Directive 2014/49/EU." Article 6(3): "This crypto-asset white paper has not been approved by any competent authority in any Member State of the European Union." High.
- FCA, COBS 4.12A (https://www.handbook.fca.org.uk/handbook/COBS/4/12A.html), in force for cryptoassets from 2023-10-08 (PS23/6): the prescribed warning, 4.12A.11R(1)(d): "Don't invest unless you're prepared to lose all the money you invest. This is a high-risk investment and you should not expect to be protected if something goes wrong."; the link text "Take 2 mins to learn more" (4.12A.11R(3)(a)); the short form where characters are limited: "Don't invest unless you're prepared to lose all the money you invest." (4.12A.11R(2)(a)); the ban on incentives such as refer-a-friend bonuses (4.12A.7R); the 24-hour cooling-off period for first-time investors with a firm (4.12A.18R). High.
- Central Bank of Ireland, "Crypto – Consumer Information", https://www.centralbank.ie/consumer-hub/crypto-consumer-information: "Consumers could face the possibility of losing all their money if they buy crypto"; "Crypto can be subject to sudden and extreme price movements"; "Crypto scams are common"; "Crypto is not protected by any form of compensation scheme"; on MiCAR, "it does not eliminate all risks". High.
- BaFin's own words, "Risiken im Fokus 2026": "Diese hohe Volatilität macht Kryptowerte für Verbraucherinnen und Verbraucher zu einer hochspekulativen Geldanlage"; "Geht dieser Private Key verloren, droht der Verlust des gesamten Guthabens"; no deposit insurance, "da es keine Einlagensicherung wie bei Spareinlagen gibt". https://www.bafin.de/DE/die-bafin/publikationen-daten/risiken-im-fokus/Fokusrisiken_2026/RIF_Verbraucher_2/RIF_verbraucher_sozialemedien_node.html . High. Verbraucherzentrale (2026-08-06): "Auch ein Totalverlust ist denkbar." High.
- CMVM (Portugal): the new cmvm.pt is script-rendered and no Portuguese wording could be read (low). Use the Portuguese edition of the 2025 ESAs warning, which the EBA publishes in all EU languages, until the CMVM text is read by hand.

Adapted Proof of Calm lines (every element traceable to the texts above): onboarding, "You can lose all the money you put in. Prices can fall and rise quickly over short periods. Nothing here is covered by a deposit guarantee or investor compensation scheme."; settings footer, "Proof of Calm is a planner, not an exchange, broker or adviser. It holds no money and gives no advice."; education footer, "Past prices are not a forecast. Holding and tax rules change; check the date on each page."

### 6m. Tax-rule volatility, with dates

| Jurisdiction | Change | Instrument and source | Confidence |
|---|---|---|---|
| Portugal | Crypto gains became taxable from 2023-01-01: 28% autonomous rate on gains from crypto-assets held under 365 days; gains on assets held 365 days or more excluded | Lei n.º 24-D/2022, 30 Dec 2022 (OE 2023); consolidated CIRS at the Autoridade Tributária: art. 10.º n.º 1 k) "Alienação onerosa de criptoativos que não constituem valores mobiliários" (aditada pela Lei n.º 24-D/2022), n.º 22 (formerly 19) "excluídos os ganhos … relativas a criptoativos detidos por um período igual ou superior a 365 dias", renumbered by Decreto-Lei n.º 97/2026 of 20 May 2026 without changing the rule; art. 72.º n.º 1 c) 28%. https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs10.aspx and …/irs72.aspx | high (the DL 97/2026 text itself not read; medium) |
| Germany | Private sales of crypto held one year or less are taxable; the annual Freigrenze rose from €600 to €1,000 (gains under €1,000 in a year stay untaxed) from tax year 2024; the BMF letter of 2025-03-06 replaced the 2022-05-10 letter on crypto taxation | § 23 Abs. 1 S. 1 Nr. 2 and Abs. 3 S. 5 EStG, https://www.gesetze-im-internet.de/estg/__23.html ("weniger als 1 000 Euro"); Wachstumschancengesetz, 27 Mar 2024, BGBl. 2024 I Nr. 108, Art. 2 Nr. 5: "In § 23 Absatz 3 Satz 5 wird die Angabe „600 Euro" durch die Angabe „1 000 Euro" ersetzt", https://www.recht.bund.de/bgbl/1/2024/108/regelungstext.pdf ; BMF, "Einzelfragen zur ertragsteuerrechtlichen Behandlung bestimmter Kryptowerte", 2025-03-06, https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2025-03-06-einzelfragen-kryptowerte.html | high; "from 2024" medium (the law has no § 23-specific application clause) |
| Italy | Substitute tax on crypto gains 26% → 33% for gains realised from 2026-01-01; the €2,000 annual threshold removed from 2025; the 2026 budget kept 26% only for euro e-money tokens; the rules are being re-codified into a new income-tax code applicable from 2027 | Legge 30 dicembre 2024, n. 207, art. 1 c. 24 ("realizzati a decorrere dal 1° gennaio 2026 … aliquota del 33 per cento") and c. 25 (threshold words "sono soppresse"), https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2024-12-30;207 ; Legge 30 dicembre 2025, n. 199, art. 1 c. 28 (26% for euro EMTs only); D.Lgs. 19 giugno 2026, n. 117 (new Testo unico) | high; "no rate change in the re-codification" medium |
| Belgium | A 10% tax on capital gains on financial assets including crypto-assets, effective 2026-01-01, withholding from 2026-06-01; first €10,000 per year exempt (statutory base amount €4,855, indexed), with a carry-forward of unused exemption; the annulment actions 8661, 8662 and 8663 against the law are pending on 2026-11-05, so the challenges `docs/JURISDICTIONS.md` §7.2 lists as possible are actual | Loi du 6 avril 2026 "introduisant un impôt sur les plus-values sur les actifs financiers", Moniteur belge 2026-04-21, art. 171, 2°, e) CIR 92 "à 10 p.c.", art. 96/2 exemption, art. 35 entry into force, https://www.ejustice.just.fgov.be/cgi_loi/change_lg.pl?language=fr&la=F&cn=2026040609&table_name=loi | high for the law; €10,000 as the indexed amount medium (RSM Belgium, April 2026) |
| United Kingdom | CGT annual exempt amount £12,300 (2022–23) → £6,000 (2023–24) → £3,000 (2024–25, unchanged through 2026–27); main CGT rates 10%/20% → 18%/24% for disposals on or after 2024-10-30; Cryptoasset Reporting Framework from 2026-01-01 (first reports due 1 Jan–31 May 2027) | HMRC, https://www.gov.uk/guidance/capital-gains-tax-rates-and-allowances (updated 2026-04-13); https://www.gov.uk/government/publications/changes-to-the-rates-of-capital-gains-tax/capital-gains-tax-rates-of-tax (2024-10-30); Cryptoassets Manual https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual (updated 2025-11-28); CARF https://www.gov.uk/government/publications/cryptoasset-reporting-framework/implementation-of-the-cryptoasset-reporting-framework-carf | high |
| Ireland | CGT 33% (from 2012-12-06; Revenue's page prints 2021) → 31% for most gains from 2026-10-07 (Budget 2027, Finance Bill pending); €1,270 annual exemption; "There are no special tax rules for cryptocurrencies or crypto-assets" | Revenue, https://www.revenue.ie/en/gains-gifts-and-inheritance/transfering-an-asset/how-to-calculate-cgt.aspx (published 2026-10-07); Tax and Duty Manual Part 02-01-03 (reviewed January 2026) | high |

The point for the module: six jurisdictions changed crypto tax rules in each of 2023, 2024, 2025 and 2026, one of them nine days before this report. "Taxes where you live" therefore carries a three-month review cycle, shows its date at the top, names the instrument and date for every rule, and never computes a tax figure the person could file.

---

## 7. Simulator method

### 7.1 Data

Daily closes in USD (or the plan currency via a daily FX series) for each supported coin, bundled with the app and refreshed with releases: BTC from 2011-08-18 (Bitstamp) or 2013-01-01 (the first full year with a liquid USD market), ETH from 2016-05-18, LINK from 2019-06-27, SOL from 2021-06-17 (Coinbase). One row per UTC day: date, close, and ideally high and low (for intraday drawdowns, shown as a secondary figure). Record the source and the download date in the bundle's manifest and show them on the simulator page ("Prices: Bitstamp BTC/USD daily closes, 2011-08-18 to 2026-10-16").

### 7.2 Computation

Inputs: coin, monthly amount A, buy day N (1–28), start month, end month (default: the last full month in the data), optional fee f (percent of each buy; default 0, typical 0.5–1.5).

For each month m in the window: buy date = the first day ≥ day N with a close (if N falls on a missing day, the next available day); price p_m = close on that date; net amount = A × (1 − f/100); units bought u_m = net / p_m; cumulative units U_m, cumulative cost C_m = A × (number of buys so far). Daily value path V_t = U_t × close_t using the units held at day t. Outputs:

- cost basis C, average cost per unit C / U, units U;
- final value V_end and final multiple V_end / C (not "return"), with the valuation date;
- maximum drawdown of the value path: min over t of V_t / max_{s ≤ t} V_s − 1 (the worst fall from a previous high of the portfolio, which is what the person would have felt), plus the worst value-to-cost ratio min_t V_t / C_t (how far below the money put in);
- time under water: the longest run of consecutive days with V_t < C_t, and the share of days under water;
- a start-date sensitivity view: the same window length started in each month of the data, plotted as the distribution of final multiples (median, 10th and 90th percentiles) with the chosen start highlighted.

Worked examples from the bundled data (BTC, €100 on the 1st, valued at the 2026-10-16 close of 81,533; USD data, so "€" here is the illustrative plan currency):

| Start | Buys | Cost | Value | Multiple | Max drawdown of value | Worst value/cost | Longest under water |
|---|---|---|---|---|---|---|---|
| 2021-11 (the previous peak) | 60 | 6,000 | 11,353 | 1.89× | −49% | 0.44 | 486 days |
| 2022-11 (the previous trough) | 48 | 4,800 | 8,249 | 1.72× | −47% | 0.77 | 64 days |
| 2024-04 (the halving) | 31 | 3,100 | 3,217 | 1.04× | −40% | 0.73 | 101 days |
| 2025-10 (the all-time-high month) | 13 | 1,300 | 1,365 | 1.05× | −23% | 0.67 | 315 days |
| 2021-11 with a 1.5% fee | 60 | 6,000 | 11,183 | 1.86× | −49% | 0.43 | 486 days |
| ETH, 2021-11 | 60 | 6,000 | 6,582 | 1.10× | −62% | 0.32 | 488 days |

Buy-day sensitivity is negligible: for 48-month BTC windows starting each month from 2013-01, the median multiple is 3.82–4.04× for buy days 1, 8, 15, 22 and 28, and the worst window is 1.36–1.44× in all five cases. The simulator should say so instead of offering day-of-month optimisation.

### 7.3 Honest presentation

- Show the whole path, not the end value: value line in the coin colour, cost line in ink-2, the area between them shaded in `negative` at low opacity while value < cost and left unshaded otherwise; drawdown periods are therefore visible as shaded troughs. The headline figures sit beside the chart, each with its date.
- Lead with the worst moment, not the best: "lowest point: 0.44× cost on 21 Nov 2022, 486 days under water", then the final multiple.
- The start-date sensitivity view is the default second chart, because the final multiple of a single window is mostly luck of the start date (48-month BTC windows since 2013 ranged from 1.37× to 27.8×).
- Log scale for price axes spanning more than one order of magnitude, linear for value-versus-cost; state which.
- No extrapolation line, no "if this continues", no projected value input. The end date cannot be later than the last day in the data.
- Caveat text under every simulator result: `Past prices, including fees you set, nothing else. Bitcoin is one asset that survived; coins that went to zero are not in this data. Four cycles are not a pattern. The next window can end below cost for years, or forever.`

### 7.4 Red day thresholds

Two signals were measured on Bitstamp BTC/USD daily closes (last five years 2021-10-16 to 2026-10-16, 1,827 days; also ten years and since 2013 for stability). "Episodes" count distinct runs (a 7-day run ends after seven clear days; a 90-day-high run ends when the condition clears).

7-day change (close today vs close 7 days ago):

| Threshold | Share of days (5 y) | Days per year | Episodes per year | Since 2013: share / episodes per year |
|---|---|---|---|---|
| ≤ −5% | 17.8% | 65 | 11.4 | 20.3% / 11.2 |
| ≤ −7.5% | 9.8% | 36 | 8.0 | 12.9% / 9.0 |
| ≤ −10% | 5.7% | 21 | 6.4 | 9.3% / 7.4 |
| ≤ −12.5% | 3.1% | 11 | 4.0 | 6.2% / 5.9 |
| ≤ −15% | 1.8% | 6 | 2.0 | 3.8% / 4.1 |
| ≤ −20% | 0.8% | 3 | 0.8 | 1.9% / 2.2 |

Distance from the trailing 90-day high of closes:

| Threshold | Share of days (5 y) | Days per year | New entries per year | Since 2013: share / entries per year |
|---|---|---|---|---|
| ≤ −10% | 55.0% | 201 | 8.0 | 59.1% / 8.6 |
| ≤ −20% | 31.9% | 117 | 6.4 | 39.2% / 7.3 |
| ≤ −25% | 19.5% | 71 | 3.6 | 26.9% / 6.2 |
| ≤ −30% | 11.9% | 43 | 4.6 | 19.4% / 4.1 |
| ≤ −35% | 7.3% | 27 | 2.4 | — |
| ≤ −40% | 3.7% | 13 | 0.8 | 10.3% / 2.6 |

Combined (either condition), last five years: 7-day ≤ −10% or 90-day ≤ −30%: 15.2% of days, 55 days per year, 9.4 entries per year; with ≤ −35%: 11.5% / 42 / 8.2; 7-day ≤ −15% or 90-day ≤ −35%: 8.1% / 30 / 3.2. For ETH over the same five years the same thresholds fire two to three times as often (7-day ≤ −10% on 10.7% of days; 90-day ≤ −30% on 28.1%).

Reading: being 20% below a 90-day high is a third of all Bitcoin days; it is a regime, not a red day. A 10% weekly fall is a genuine event (about six a year, lasting about three days each). **Recommendation**: the live Red day state turns on when the 7-day change is ≤ −10% ("a sharp week") or the price is ≥ 30% below its 90-day high ("a deep drawdown"), which together cover about 15% of Bitcoin days in the last five years and about 21% over ten; the page shows which condition fired, the number, the date, and the historical frequency sentence computed from the bundled data for that coin ("this has been true on 15% of days since 2021"), so the thresholds are explained rather than asserted. Thresholds are per coin only in the sense that the frequency sentence is per coin; the numbers stay the same for all coins so the rule is learnable. Compute the frequencies at build time from the bundled series and show the computation date.

---

## 8. Reading time and "last reviewed"

Method (**Recommendation**): reading time = ceil(words ÷ 230) minutes, counted on the rendered body text excluding headings, captions, alt text and the caveat box, plus 10 seconds for the chart when a module has one. 230 wpm sits just under the meta-analytic silent-reading rate for adults reading non-fiction in English, so the estimate errs long, which is the right direction for readers in their second language (pt, de). Display: `4 min read` next to `Last reviewed 16 Oct 2026` under the module title; a 400-word module shows `2 min read`.

Source: Marc Brysbaert, "How many words do we read per minute? A review and meta-analysis of reading rate", Journal of Memory and Language 109 (2019), 104047, https://doi.org/10.1016/j.jml.2019.104047 (metadata verified through Crossref https://api.crossref.org/works/10.1016/j.jml.2019.104047 and OpenAlex, published 2019-08-09, 547 citations at access). Headline figures: silent reading of non-fiction by English-speaking adults about 238 wpm and fiction about 260 wpm, from 190 studies with about 18,500 participants; oral reading about 183 wpm. Confidence high on the figures, medium on the exact abstract wording (the publisher page returned 403; figures are from the indexed abstract). Medium's often-quoted 265 wpm could not be verified (help centre returned 403) and is not cited.

"Last reviewed" convention: every module stores `reviewed` (ISO date) and `nextReview` (reviewed + 12 months; + 3 months for "Taxes where you live"). The page shows `Last reviewed 16 Oct 2026` in ink-2 under the title and, for the tax module only, `Next review due 16 Jan 2027`; when today is past `nextReview`, the line becomes `Last reviewed 16 Oct 2025 · review overdue` in ink (not red), and the tax module adds `Rules may have changed since this date. Check your tax authority before filing.` The build fails if any module's `reviewed` is more than 18 months old. Precedent: the NHS website prints "Page last reviewed: 19 July 2024" and "Next review due: 19 July 2027" in the footer of every condition page (https://www.nhs.uk/conditions/high-blood-pressure/, accessed 2026-10-16); GOV.UK's publishing guidance asks editors to set a review date when content is updated and reports content that is "overdue for a review, based on the review date that someone set when they last updated the content" (https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/plan-manage-content/manage-existing-govuk-content/), and prefers updating to withdrawing ("Guidance should usually be updated rather than withdrawn").

---

## 9. Conflicts with the decisions already taken, and corrections to the brief

1. **Typeface.** The prototype used Archivo. Archivo's I and l are identical bars, its width file is 88 KiB, and the Google Fonts build drops its slashed zero; the recommendation is IBM Plex Sans (1.2). If keeping Archivo is a brand decision, load the wght-only file (34 KiB) and accept the I/l ambiguity in IDs.
2. **Accent gold.** The prototype's light gold #b7811c measures 3.09:1 on paper, 2.89:1 on surface-2 and 2.68:1 on surface-3, so it fails SC 1.4.11 on inset surfaces and fails as text everywhere. Retuned to #ac7300 (3.18–3.86:1), for marks and fills only; text on the gold needs the darker on-accent ink (#110f0d), because the regular ink gives 4.29:1. "Late" is not amber; it keeps the accent marker and says how late in words.
3. **Positive and negative.** The prototype's light green #1f7a3a is 4.6:1 on paper but 4.3:1 on surface-3, and the light red #c9403a is 4.3:1 on paper, under AA. Replaced by #146720 and #b63039 (4.75:1 or better everywhere). The dark values are close to the prototype's.
4. **Coin colours in light mode.** The prototype's BTC #eb6834 (2.9:1) and SOL #1baf7a (2.6:1) fail 3:1 on paper as 2 px lines; LINK and ETH pass. Light and dark now have separate, validated values (2.5), and SOL is teal-green rather than mint because mint collides with the positive green.
5. **Background.** #f4f4f2 is near-neutral (oklch 0.967 0.003 106); "warm paper" is now hue 80 at chroma 0.007 (#f7f4ef), with the same warmth in the charcoal.
6. **Brief examples.** CLDR's pt-PT groups digits only from five digits, so 1234.56 is `1234,56 €` and 12345.67 is `12 345,67 €`; the brief's `1 234,56 €` is the fr-FR form (with U+202F). Android's adaptive-icon safe zone is 66 dp, not 72. Lighthouse no longer has a PWA category (removed in v12, 2024-04-22). Medium's 265 wpm could not be verified and is not cited; 230 wpm stands on Brysbaert alone.
7. **Facts in the brief that the data corrects.** LINK's 2022 low was 2022-06-13 (about $5.29–5.36), not 06-18. ETH's 2018 low was 2018-12-14 on Coinbase and Bitstamp (CMC says 12-15). QuadrigaCX: the OSC's final figures are C$215m owed to more than 76,000 clients, not C$190m / US$145m. FTX's withdrawal halt ran 8–10 November 2022 (the CFTC dates the full halt to the 10th). Ireland's CGT rate is 31% from 2026-10-07, not 33%. The 2024 halving block carried 37.6 BTC of fees against a 3.125 BTC subsidy, worth a sentence in the Cycles module.
8. **Red day definition.** A page that turns on at "20% below the 90-day high" would have been on for a third of all Bitcoin days in the last five years; the recommended rule is a 7-day fall of 10% or more, or 30% or more below the 90-day high (about 15% of days).
9. **"Never lost money" claims.** True for 4-year windows in the data (lump-sum minimum +31.7%; monthly DCA minimum 1.37×), false for 5-year windows for nine days in December 2022 and January 2023 and for 3-year windows on 33 days, so no module may generalise beyond the exact window it quotes.
10. **Emergency fund.** Only the FCA gives "between 3 and 6 months" (attributed to "many experts"); BaFin says three months' income; CFPB gives no number; the Portuguese source could not be read. Attribute, do not assert.
11. **Voice.** GOV.UK's "no space before a unit" (3,500kg) and "to" for ranges conflict with CLDR and the en-dash rule; Proof of Calm follows CLDR in the UI and uses "to" in prose. Apple's advice to avoid "we" in error messages is adopted; "Where should we send the monthly reminder?" keeps "we" because it is the company speaking, which Apple's Inclusion page allows.
12. **Validator band.** The dataviz validator flags the dark coin colours (L 0.60–0.78) as above its dark-mode lightness band (0.48–0.67); the band assumes one surface at L 0.19, while Proof of Calm's lines must reach 3:1 on surfaces up to L 0.31. Documented as a deliberate exception, not a failure.

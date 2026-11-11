# Proof of Calm design system

The single description of how the product looks and behaves visually. The tokens below are
implemented once, in `packages/ui/src/styles/tokens.css`, and consumed by every host and by
Storybook; a component that hardcodes a colour, size or font is a bug. Research with sources:
`docs/research/brand-content-education.md` (typography measured on the font binaries; every colour
pair computed for WCAG 2.2 and APCA; coin colours run through the dataviz validator). Decisions:
ADR-0005 (toolkit), ADR-0022 (charts). Voice and copy: `docs/CONTENT-STYLE.md`.

## 1. Name and mark

The name is Proof of Calm (ADR-0040); nothing below depends on the letters except the wordmark.
Wordmark: "proof of calm" on one line, lowercase, set in the text family at
weight 600, tracked −0.01 em, in `ink`. Mark ("the marked loop"): a ring in `ink` with a stroke about
one seventh of its diameter, very slightly superelliptical, open at about the two o'clock position,
the gap closed by one solid `accent` dot set into the stroke. The ring is the plan; the dot is "now",
the only coloured thing in the brand, exactly as on the Today strip. Motion: at most once a month,
the dot steps one twelfth clockwise on buy day. Not an infinity sign, not an arrow, not a plain ring.

## 2. Principles

Warm paper in light, matte charcoal in dark. One accent for "now". Coin colours as the only other
colour. Tabular numerals wherever a number can change or align. No decoration, no gradients, no
illustration, no shadows except on overlays. Colour never carries meaning alone: a sign, a label or
a shape always accompanies it.

## 3. Colour tokens (OKLCH, hex fallback)

Hue 80 at very low chroma warms the paper without tinting the inks; the charcoal keeps the same hue.

### Light

| Token | OKLCH | Hex | Use |
|---|---|---|---|
| `background` | oklch(0.967 0.007 80) | #f7f4ef | page |
| `surface` | oklch(0.985 0.004 80) | #fbfaf7 | cards, sheets |
| `surface-2` | oklch(0.945 0.008 80) | #f0ece7 | insets, inputs, table stripes |
| `surface-3` | oklch(0.920 0.009 80) | #e8e4de | selected rows, code, pressed |
| `ink` | oklch(0.220 0.005 80) | #1c1a18 | text, icons, focus ring (15.7:1 on background) |
| `ink-2` | oklch(0.470 0.008 80) | #5d5a56 | secondary text (≥ 5.39:1 on every surface) |
| `ink-3` | oklch(0.600 0.008 80) | #83807b | placeholders, disabled (≥ 3.12:1) |
| `line` | oklch(0.880 0.008 80) | #dad7d2 | decorative hairlines |
| `line-2` | oklch(0.600 0.008 80) | #83807b | boundaries that must be perceivable (3:1) |
| `accent` | oklch(0.600 0.127 75) | #ac7300 | "now" marks, the primary action fill (3.18–3.86:1: marks and fills only, never text in light) |
| `on-accent` | oklch(0.170 0.005 80) | #110f0d | text on accent (4.74:1) |
| `positive` | oklch(0.450 0.130 145) | #146720 | gains, always with a + sign (≥ 5.55:1) |
| `negative` | oklch(0.520 0.170 22) | #b63039 | losses with a − sign; destructive actions (≥ 4.75:1) |
| `focus` | = `ink` | #1c1a18 | 2 px ring, 2 px offset |

### Dark

| Token | OKLCH | Hex | Use |
|---|---|---|---|
| `background` | oklch(0.190 0.004 80) | #151412 | page |
| `surface` | oklch(0.235 0.005 80) | #1f1e1b | cards, sheets |
| `surface-2` | oklch(0.270 0.006 80) | #282623 | insets, inputs |
| `surface-3` | oklch(0.310 0.006 80) | #32302d | selected, code, pressed |
| `ink` | oklch(0.955 0.005 90) | #f1f0ec | text, icons, focus (16.2:1) |
| `ink-2` | oklch(0.790 0.007 85) | #bcbab6 | secondary text (≥ 6.81:1) |
| `ink-3` | oklch(0.640 0.007 85) | #8e8c87 | placeholders, disabled (≥ 3.91:1) |
| `line` | oklch(0.300 0.006 80) | #2f2d2a | hairlines |
| `line-2` | oklch(0.640 0.007 85) | #8e8c87 | perceivable boundaries |
| `accent` | oklch(0.800 0.120 82) | #e4b65c | "now"; may be text in dark (7.0–9.8:1) |
| `on-accent` | = `background` | #151412 | text on accent (9.8:1) |
| `positive` | oklch(0.760 0.140 145) | #74c878 | gains (≥ 6.45:1) |
| `negative` | oklch(0.700 0.160 18) | #f16f78 | losses (≥ 4.58:1) |
| `focus` | = `ink` | #f1f0ec | ring |

Rules:

- The accent is a position mark (today on the strip, the dot on the loop) or the primary action fill.
  There is no amber "late" state: a late month keeps the accent marker and says how late in words.
  There is no warning hue in the system.
- Positive and negative differ in lightness as well as hue; every signed value carries its sign
  (U+002B, U+2212) and P/L columns carry a header, so colour is never the only cue. Status colours
  are never used for chart series.
- Links are `ink` with an underline; nothing chromatic sits on `surface-3` except `ink` text.
- Implementation: `tokens.css` declares each token in hex first and as `oklch()` second, the OKLCH
  values inside `@supports (color: oklch(0 0 0))`: a custom property repeated in the next declaration
  is no fallback (the last declaration wins whatever the browser can render), so the support check is
  what makes the hex values serve browsers without `oklch()`. Dark tokens are declared twice, under
  `@media (prefers-color-scheme: dark)` guarded
  by `:root:not([data-theme="light"])` and under `:root[data-theme="dark"]`, so the in-app toggle
  wins both ways; `theme.css` maps them inside `@theme inline` to Tailwind colours under shadcn's
  names (`--color-background` and `--color-foreground`; `--color-card`, `--color-popover`,
  `--color-primary`, `--color-secondary`, `--color-muted` and `--color-accent`, each with its
  `-foreground`; `--color-destructive`, `--color-border`, `--color-input`, `--color-ring`) and sets
  shadcn's `--radius` in a plain `:root` rule; the dark variant is
  `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`; an inline script in
  `<head>` sets `data-theme` before paint from the stored preference, falling back to the system. The
  offline page, which the worker serves in place of the app, carries the same script; the other site
  pages carry none and follow the system theme (ADR-0045 §3 and its deviation of 2026-10-19).

## 4. Coin colours and the chart palette

Validated on 2026-10-16 with the dataviz validator in all-pairs mode (any two lines may touch):

| Coin | Light OKLCH / hex | 3:1 on background / surface / surface-2 / surface-3 | Dark OKLCH / hex | same, dark |
|---|---|---|---|---|
| BTC | oklch(0.60 0.164 48) #cb5a00 | 3.82 / 4.03 / 3.58 / 3.32 | oklch(0.73 0.16 52) #f4873a | 7.35 / 6.63 / 6.00 / 5.24 |
| ETH | oklch(0.45 0.19 288) #5635b6 | 7.38 / 7.78 / 6.91 / 6.41 | oklch(0.60 0.15 295) #886acf | 4.42 / 3.99 / 3.61 / 3.15 |
| SOL | oklch(0.52 0.103 170) #007c60 | 4.74 / 4.99 / 4.44 / 4.11 | oklch(0.78 0.12 176) #50d0b4 | 9.72 / 8.78 / 7.93 / 6.93 |
| LINK | oklch(0.58 0.15 252) #287ccf | 3.90 / 4.11 / 3.65 / 3.39 | oklch(0.73 0.13 245) #59aff4 | 7.81 / 7.05 / 6.37 / 5.56 |

Validator results: light passes every check (worst colour-vision pair ΔE 8.3, BTC–SOL under
protanopia; worst normal-vision pair 17.1; all ≥ 3:1). Dark passes colour-vision separation (worst
13.0), the normal-vision floor (15.1) and contrast; it exceeds the validator's dark lightness band
(0.48–0.67) on purpose, because the lines must reach 3:1 on `surface-3` (L 0.31) and four coins need
lightness spacing to survive deuteranopia; in-band alternatives tested on the same day failed the
colour-vision checks (blue against purple ΔE 3.3–6.8), so the deviation is recorded here as a
deliberate exception. Under tritanopia SOL–LINK is weak (7.5 light, 5.5 dark); the mitigation is
structural: direct labels at line ends, a legend, 2 px lines with distinct end markers, and a table
view for every chart. The lightness order BTC > LINK > SOL > ETH in light must not change when
retuning.

Extended palette (identity dots, pills and single-series charts only; charts cap at four series and
fold the rest into the neutral "Other"): 5 magenta #a8347f / #e57bba; 6 purple #7b3b9d / #b57dd6;
7 olive #748322 / #b7c86b; 8 rose #b03557 / #f17993; 9 brown #855732 / #c4926c; 10 steel #3e799a /
#78b3d6; neutral #808080 / #a4a4a4 (light / dark). They reach 3:1 on their backgrounds but are not
pairwise colour-vision-safe, which is why four series is the cap, not a defect to retune.

Chart rules (ADR-0022): colour follows the entity, assigned from the plan's coin order, never
cycled; one axis per chart; 2 px lines, markers ≥ 8 px, 2 px surface gaps between fills; text in
text tokens, never the series colour; a legend whenever there are two or more series; selective
direct labels; `role="img"`, an `aria-label` with the series and, on a time chart, the range, its
dates and the first and last values, with no change figure, because money bought inside the range
would read as a rise (`docs/CONTENT-STYLE.md` §3, the "Portfolio value chart" row), and a table view;
dark mode uses the dark steps above, not an inversion; the validator runs whenever the palette changes.

## 5. Typography

- **Text family: IBM Plex Sans**, self-hosted from IBM's build, weights 400, 500 and 600, no italics
  (emphasis is weight), subset to Latin with `pyftsubset --layout-features+=tnum,zero,ss03,ss04,case,lnum`;
  the width axis pinned at 100 in one variable upright file. Chosen because its digits and
  operators are tabular by default, its capital I has serifs and its l a tail (so `Il1` never
  collapses in a table or an identifier), it carries U+202F for French grouping, and it reads as a
  technical document rather than a dashboard. Declared in `packages/ui/src/styles/fonts.css` (`font-weight: 400 600`,
  `font-display: swap`; `theme.css` maps it to `--font-sans`) and preloaded by the hosts' build
  (`packages/config/vite/font-preload-plugin.ts`, ADR-0045 §7). The upright subset
  weighs 34,712 bytes and the Mono 14,396 (`packages/ui/src/fonts/README.md` has the commands). Inside
  the files the families are named Calm Sans and Calm Mono: "Plex" is a Reserved Font Name, and a
  subset is a Modified Version that may not carry it (OFL FAQ 2.6 and 5.8). The typeface is unchanged.
- **Monospace: IBM Plex Mono 400** for addresses, hashes, CSV previews and code; dotted zero by
  default. Not preloaded (the hosts' font preload plugin adds only the text family's file): it never sets a first screen, and a preload on every page
  competes with the text family that the largest contentful paint waits for.
- No display family. Headings are the text family at 600.
- Scale (px / line height): 12 / 1.4 axis ticks only; 13 / 1.45 captions, meta and a form's refusal
  line (minimum colour `ink-2`, the refusal line in `negative`); 14 / 1.45 dense tables, a
  control's label and the description under a title (a card's, a banner's, a toast's, a choice
  card's line); 16 / 1.5 body; 18 / 1.4; 20 / 1.35; 24 / 1.3; 28 /
  1.25; 32 / 1.2; 40 / 1.1 the portfolio number. Headings 600, letter-spacing −0.01 em. Reading measure 640 px,
  table measure 960 px. Text must survive the WCAG 1.4.12 spacing overrides without clipping, so no
  fixed-height table cells.
- `font-variant-numeric: tabular-nums lining-nums` on every number that can change, every numeric
  column and every total (a no-op for Plex, there for fallbacks); body prose keeps proportional
  figures. Stylistic sets, if used, go in one combined `font-feature-settings` list on that element.

### Number typography

1. Never hand-build a number: `Intl.NumberFormat` with the country's formatting locale and the plan
   currency; `formatToParts`, with the `minusSign` part replaced by U+2212 (ICU emits a hyphen-minus
   in en, de, pt, fr, it and nl). Digits are always Western (`numberingSystem: 'latn'`, one option in
   `packages/app/src/lib/format/digits.ts` that every formatter and the number field share): the
   generic profile formats in `und`, which resolves to the device's locale, and an ar-EG device would
   otherwise show `١٬٢٣٤٫٥` beside a field that reads only `1,234.5`.
2. Signed values always carry their sign (`signDisplay: 'exceptZero'`): `+1 234,56 €`, `−12,3 %`.
   No accounting parentheses.
3. Multiples use U+00D7 with no space: `1.89×`, `4,04×`.
4. Ranges: en dash without spaces in tables (`3–6 months`, `2013–2026`); the word "to" in prose and
   whenever an end carries a sign; localised ranges through `formatRange` (its pt-PT pattern is a
   spaced hyphen; do not "correct" CLDR).
5. Number and unit are joined by a no-break space where the locale uses one; group separators are
   whatever CLDR gives (pt-PT groups only from five digits: `1234,56 €`, `12 345,67 €`).
6. Currency symbol placement follows the locale (`12 345,67 €` pt-PT, `12.345,67 €` de-DE,
   `€12,345.67` en-IE, `€ 12.345,67` nl-BE); crypto codes after the number with a no-break space:
   `0.01234567 BTC`; fiat codes only when several currencies appear.
7. Fixed decimals per asset in tables (BTC 8, ETH 6, SOL and LINK 4), trimmed in prose.
8. Slashed or dotted zero only in monospace contexts, never in money tables.
9. Right-align numeric columns and their headers; dates in records show the year; exports use ISO
   8601; times show the zone when they matter (`prices from 14:05 WEST`): a time is shown in the
   device's zone, and its zone's name, in the UI language, joins it when the zone's offset at that
   moment differs from its offset now, because the clocks changed in between (`lib/format` `time`).
10. Percentages: one decimal for changes, none for shares over 10 %; differences between percentages
    are "percentage points". One exception (2026-11-09): a cycle's fall read from
    `packages/content/cycles/drawdowns.json` shows as a whole percent, the data's precision, on the fall
    page's earlier falls and in the drawdowns-bar chart (#62), and a module's text quotes such a fall at
    the same precision.

## 6. Spacing, radius, motion, elevation, focus, touch

- **Spacing** (4 px base): 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Aliases: `inset-sm` 12,
  `inset` 16, `inset-lg` 24 (card padding); `stack-xs` 4 to `stack-xl` 40 (vertical rhythm);
  gutter 16 on phones, 24 from 600 px. 2 px only for gaps between adjacent fills and hairline offsets.
- **Radius**: `lg` 14 (cards, sheets, dialogs), `md` 8 (buttons, inputs, menus, text chips), `sm` 4
  (tags, tooltips, cell highlights), `full` (the now dot, pills). Inner radius = outer − padding,
  floored at 4. No 2 px radii, no asymmetric corners.
- **Motion**: `fast` 120 ms (hover, toggle), `base` 180 ms (fade, expand, tooltip), `slow` 240 ms
  (sheet, dialog, page); 320 ms ceiling except a one-time chart draw-in (≤ 400 ms, once per page
  view, never on data refresh). Enter `cubic-bezier(0.2, 0, 0, 1)`, exit `cubic-bezier(0.3, 0, 1, 1)`,
  linear for opacity ≤ 120 ms. No springs, bounces, parallax, loops; nothing animates because a price
  moved; numbers do not count up. `prefers-reduced-motion: reduce` sets every duration to 1 ms,
  replaces transforms with opacity and slides with fades; the same switch exists as an in-app setting.
- **A chart while its data loads**: no loading state is added, no spinner, skeleton or shimmer. The
  chart's empty frame, busy, hidden from assistive technology and at its loaded height
  (`docs/ENGINEERING.md` §4), is the quiet state (§2: no decoration): Portfolio's value chart while
  the daily closes load, and an open holdings row's chart the same way. When they cannot be had the
  frame stays, unseen, and the value chart's line stands in its place, so a failed read moves nothing.
- **Elevation**: flat. Overlays only: light `0 1px 2px oklch(0.2 0.01 80 / 0.10), 0 8px 24px -8px
  oklch(0.2 0.01 80 / 0.25)` over the scrim `oklch(0.2 0.01 80 / 0.25)`; dark overlays use
  `surface-2`, a 1 px `line-2` border and a scrim `oklch(0.1 0 0 / 0.5)`. No hover elevation.
- **Focus**: `:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px }`, radius
  inherited; `focus` = `ink` (≥ 11.5:1 on every surface: 11.55 on dark `surface-3`, which an earlier
  version of this line rounded twice to 11.6; the offset keeps the ring off filled
  buttons); never `outline: none`; sticky bars get `scroll-padding` equal to their height plus the
  focus ring's extent outside the box (`--focus-offset` plus `--focus-width`), so a focused element
  stops with its whole ring clear of the bar. The page's top edge keeps the ring's extent plus 1 px
  (`scroll-padding-top` on `<html>`), so a field that an earlier scroll left at or above the
  window's top edge comes back with its whole ring in view. A popup that scrolls (the Sheet) clips
  at its padding box, so it gets `scroll-padding` of the ring's extent plus 1 px, since browsers
  keep scroll offsets to whole pixels (Chromium and WebKit, measured on 2026-10-26): a field scrolled into it, or a
  button Tab reaches, stops with its whole ring inside it (the keyboard e2e check). Chromium's Tab into
  a text field scrolls at most its caret's line, so the Sheet itself, on `focusin` of a text field
  (an input, textarea, select or contenteditable) that shows its ring, scrolls by the least that
  shows the whole field and ring as it takes the focus (`revealFocusedField` in
  `packages/ui/src/lib/reveal.ts`, at once, as the browser's own focus scroll); any other focus,
  a module's section heading among them, is the browser's to place (WebKit centres the heading); the
  entry form's "Venue and note" panel, once open to its height, scrolls into the Sheet the same way,
  gliding unless motion is reduced (android-small and zoom-125, 2026-11-09); the module sheet's
  sticky `Close` adds no padding, its module taking a scroll margin instead (§8). A container that
  clips its children or draws a border around them (the collapsible's panel, the segmented control,
  the tab list, the table's scroller) is padded by the ring's extent on every side, so a focused
  child's whole ring stays inside it; where the padding must not move the layout (the panel, the
  table's scroller), an equal negative margin cancels it, and that margin stays inside the parent's
  own padding (the sheet's inset, the page's gutter), so nothing scrolls sideways. A cancelling
  margin that reaches under a control keeps that control's whole target: the collapsible's trigger
  is positioned (no z-index), so it paints above the open panel, whose margin reaches under its
  bottom edge when the root has no gap, and a tap there still closes it. A script focus move onto
  an element that may sit under the tab bar (a row after "Show all", the row in a deleted row's
  place, the row an Undo restores) focuses with `preventScroll` and then calls `scrollIntoView({ block: 'nearest' })`:
  Chromium's own focus scroll ignores the padding and leaves the element partly under the bar.
  Every element this move lands on carries a top scroll margin of `stack-md` (`scroll-mt-result`;
  the header is not sticky, §7): the Log rows' toggles, the country change's result line, the
  review's result line, an import's result and problem lines, the buttons an Undo returns focus to and Today's headings. The
  least scroll then leaves room above it: without one, the country change's result line stopped
  flush with the window's top edge, with nothing above it to read it by (android-small and
  zoom-125, 2026-11-05). The entry form's alert line takes none: the form scrolls a box around it
  into the Sheet, not the line into the window.
- **Focus after an action**: when the control that ran an action unmounts, or a dialog closes after
  its action, focus moves to the element that reports the result (a result line with
  `tabindex="-1"`), never to `body`. When that unmount shrinks the document (the country change's
  confirmation above its result line), the move waits for the commit that removes the control and
  uses the script focus move of the entry above. A focus before that commit leaves the line above
  the window (android-small and zoom-125, 2026-11-05). A Cancel returns it to the control that
  opened the dialog, and closing a "Why?" sheet returns it to its link, set as the sheet's
  `finalFocus`, since Safari does not focus a pressed button; a sheet opened on a section puts the
  focus on that heading. End buying's and Delete everything's Undo put the focus on the control that
  ran the action they undo, with its ring showing whether the Undo was reached by a click, F6 or
  Tab, unless the person moved the focus while the undo ran; a refused one gives it back where it
  was before the toast. A Log row's `Delete entry` sets its target before the write and, once the
  commit has removed the row, moves the focus by the script focus move above to the toggle of the
  row now at the deleted row's index among the transactions shown, else to the toggle before it,
  else to the Log's `h1`; before that commit the row at that index is still the deleted one, and a
  refused or failed delete moves no focus. Its Undo keeps the toast's default focus return, so the
  page never scrolls to its top. Once the toast has given the focus back, a Log row's Undo moves it to the
  restored row's toggle and a skipped month's Undo on Today to the action card's heading
  (`today-action`, `tabindex="-1"`) and on Log to the screen's `h1`. Dismissing the rule-change
  notice or the red-day banner at Today's foot, or `Later` on the annual review, takes its button away
  (the review gives way to the next box on the same visit), so the focus moves to that
  same heading by the script focus move above, once the commit has removed the banner, since on a
  phone the heading is above the window once the foot has been scrolled to; a failed `Later` keeps the
  review and the focus on its button, and the toast says so.
  `Mark as reviewed` on `/plan/review` gives way to its result line (`tabindex="-1"`), which takes the
  focus by the script focus move above once the commit has replaced the button; a failed write keeps
  the button and the focus on it, and the toast says so. A mark refused because another tab replaced
  or deleted the plan re-opens the page on what is stored, which takes the button away, so the page's
  `h1` takes the focus by the script focus move above once that commit is in, and the toast says so.
  Accepting the re-ask of the risk text takes its button away with no new pathname for
  the shell to act on, so the focus moves to Today's `h1` by the script focus move above. An action
  that ends in a problem with no result to show (the import of a file) moves the focus to the
  `role="alert"` line that words it, also given `tabindex="-1"`, through every button and the dialog
  alike, since an empty result line reports nothing; a read that fails (a pasted text or a chosen
  file that cannot be read) is such an action, and the alert, like the result line, takes the script
  focus move above, so it stops clear of the tab bar. When reading an import adds a step below the
  control (the country step for a file from the DCA plan page with no plan), the focus moves once to
  the step's first line, given `tabindex="-1"`, as it appears. A refused save keeps the focus on
  Save, and its `role="alert"` line announces itself; the line stays above Save, and once it has
  rendered, the line and Save, grown by the focus ring's extent, scroll into the view of the sheet
  that holds them (that scroller only, by the least that shows both, as `block: 'nearest'` would),
  so the line never pushes the focused Save out of sight (WCAG 2.4.11; the entry sheet's
  refused-save stories at android-small and zoom-125). A save refused from a field (Enter in the
  date) moves the focus to the alert line, given `tabindex="-1"`, with `preventScroll`, and scrolls
  the line, grown by the focus ring's extent, into the sheet's view by the same least scroll: the
  line sits below the fields, and a sheet too short to show the focused field and the line together
  would leave the refusal or the focus out of sight; with the focus on the line the person reads the
  refusal in view, and Shift+Tab returns to the fields. A button disabled while its action runs
  stays focusable (Base UI's `focusableWhenDisabled`), since a browser drops the focus of a disabled
  button to `body` once the action outlasts a frame; so does a button whose action can only be
  refused again (Skip after `already skipped` or `already recorded`), with `aria-disabled`. A paste
  into the import's text box grows it and can push `Read the pasted text` below the fold: after the
  paste's frame the button scrolls by the least that shows it (`block: 'nearest'`, the page's scroll
  padding keeping it clear of the tab bar), and the focus stays in the box.
- **Focus on a route change**: the first screen leaves the focus where the page starts, also after a
  redirect; each later change of pathname moves it to the new screen's `h1` (given `tabindex="-1"`
  when it has none), once a lazy screen has rendered it, and scrolls to the top.
- **Skip link and landmark**: the first tabbable element is "Skip to content", shown only while
  focused; it focuses the one `main` (the shell's, `tabindex="-1"`) without changing the URL.
- **Names in `tokens.css`**: Tailwind owns the `--radius-*`, `--text-*`, `--ease-*` and `--shadow-*`
  names, so the tokens are `--corner-sm` to `--corner-full`, `--type-12` to `--type-40` (each with a
  `-leading`), `--easing-enter` and `--easing-exit`, `--duration-fast` to `--duration-draw`,
  `--overlay`, `--overlay-border`, `--overlay-shadow` and `--scrim`; `theme.css` turns them into the
  utilities `rounded-md`, `text-13`, `ease-enter`, `shadow-overlay` and the rest. Values this document
  left open: `stack-sm` 8, `stack-md` 16, `stack-lg` 24; the chart heights 160 (line chart), 32
  (sparkline), 20 (strip) and 8 (allocation bar), and a bar chart's row 28 (`--bar-row`, in rem so it grows
  with the text); in-app reduced motion is `data-motion="reduce"` on
  `<html>`, beside `data-theme`.
- **Touch targets**: 44 × 44 CSS px for every interactive element (WCAG 2.5.5 and Apple's 44 pt;
  4 px under Material's 48 dp), 8 px between adjacent targets, 48 px list rows, icon buttons padded
  to 44, inline text links exempt, and so is "Why?" inside a sentence (on a line of its own it keeps
  the 44 px height); chart hit areas ≥ 24 px around a 2 px line.

## 7. Layout

One column. Phones: bottom tab bar (Today · Portfolio · Log · Learn) with safe-area insets, a
gear for Settings in the header, Plan reached from the strip. Desktop: top navigation with the same
four destinations, content centred at the table measure. Hero on Today: the action first, the number
beside it on wide screens and below it on phones, the strip across the bottom. Holdings rows show
the coin and the value with its P/L beneath it, so they fit a phone at 125 % text, and expand
on tap; log rows show date, kind, total and chips. Every
screen is reachable in two taps from Today. No horizontal page scroll at any width (asserted in CI).

Values this section left open, chosen in M1: the tab bar shows below 48rem (768 px at the default
text size; in rem, so larger text keeps the tab bar longer) and the top navigation from 48rem, so a
tablet in portrait gets the top navigation. The tab bar is 56 px (`--tab-bar-height`) plus the home
indicator's inset, fixed, with an in-flow spacer of its height, so the end of a page scrolls clear of
it; while one is on the page, `--bottom-bar` holds that height and the toast viewport sits above it.
`<html>` takes the larger of `--bottom-bar` and `--toast-inset` (in `max()`, never their sum) plus
the focus ring's extent (§6) as `scroll-padding-bottom`: while a toast shows, its viewport sets
`--toast-inset` (`0px` by default) on `<html>` to the band the toast covers, measured from its top to
the bottom of the window, plus the gutter, the bar or the home indicator's inset under it included,
and measured again once its entry transition (§8 Toast) has finished, since a translate never
resizes it. The screen area's bottom padding takes the inset less the bar's spacer, and a focused element the toast covers, when it shows or when focus lands there, scrolls clear with
`scrollIntoView({ block: 'nearest' })`, so the toast never hides the focus. A modal Sheet or Dialog
paints over the toast: it stays under the scrim, out of reach, and its window waits until the last
modal has closed (WCAG 2.2.1; each popup counts in `packages/ui/src/lib/modal-layer.ts` while it is
mounted). The insets apply once the host's
viewport sets `viewport-fit=cover`. The current destination is marked by `aria-current="page"`,
weight 600 and a 2 px `ink` bar (above the tab's icon, under the top navigation's word, under the
Settings gear's icon), never by colour alone. Neighbouring tabs and links sit 8 px apart
(`--target-gap`, §6). The header is not sticky. Links render through the link component the app
passes, its navigation adapter; `packages/ui` imports no router.

## 8. Component inventory (shadcn on Base UI, restyled; `packages/ui`)

Button (primary: `accent` fill with `on-accent` text; secondary: outline in `line-2`; ghost; link;
destructive: `negative`), Input (text and numeric with `inputmode="decimal"`, date), Select,
Segmented control (range selector, currency toggle, the entry sheet's choice of kinds), Coin chip (swatch dot + ticker + amount),
Circle toggle (sell parts), Tabs (Settings), Dialog, Sheet (bottom on phones, used for "Why?"
modules and forms), Toast with one action (undo, edit, reload), Tooltip, Table with expandable rows
(holdings, log) and month group headers, Progress strip with today marker, Timeline (SVG on
desktop, list on phones), Banner (one at a time), Empty state, Card, Menu, Switch, Date input,
Navigation (tab bar, top nav), Charts (`LineChart`, `CoinChart`, `AllocationBar`, `Sparkline`,
`SimulatorChart`, `ProgressStrip`, `BarChart`). Every component: Storybook stories at 360 px and 1280 px in
light and dark with the a11y addon; tokens only; `data-slot` attributes from shadcn kept for
styling hooks.

Built so far (M0): Button, Input (text, numeric, date) in a Field, Select, Segmented control, Coin
chip, Tabs, Dialog, Sheet, Toast, Table with expandable rows and group headers, Banner, Empty state,
Card, and the charts `ProgressStrip`, `LineChart`, `AllocationBar`, `Sparkline`; `BarChart`, one
labelled bar per row with its table, on 2026-11-09 (#62). Notes: the sheet
floats 8 px off the screen edges so its four corners keep one radius; one toast shows at a time; the
banner is a polite status, not an alert; labels are props, never strings inside `packages/ui`. A
table wider than its column scrolls inside its wrapper, which only then takes a tab stop, so the
keyboard can scroll it, and becomes a region named by the `label` prop or the caption; a focused
wrapper keeps both until it loses focus. A table with neither name gets the tab stop without the
region and logs an error in development, so give every table that can scroll a caption or a label. The
wrapper is padded by the focus ring's extent (§6) and pulled out by as much with a negative margin, so
its overflow never clips a focused row's ring and the table keeps its place in the column. The
charts draw the core's geometry as SVG attributes (positions, path data) and keep text in HTML: the
CSP allows no inline style attributes (`docs/SECURITY.md` §4), and stretched SVG text would distort.
The strip tells its phases apart by weight and by the labels under it; the accent marks today only.

Today's foot, under the strip, holds one thing at most: the banner `bannerFor` picks (the red-day
banner, the rule-change notice, the annual review or the Backup needed banner, each a bordered box), or, when `docs/CONTENT-STYLE.md` §3 shows it
and no banner shows, the durability line as plain 14 px `ink-2` text with no border, no link and no
dismiss (ADR-0004, ADR-0019). It sits on Today, not in Settings, because Today is the screen a person
opens each month. The foot settles once per visit: with units held it shows nothing until the red-day
model answers (a failed read counts as no episode and says nothing), then the pick, and within the
visit it never swaps one box for another except by Dismiss or the review's `Later`; the red-day banner,
recorded as it shows, gives way to the next banner on the next visit. While a red-day episode is under way,
shown on this visit or an earlier one, the annual review waits (`reviewAsked`, `docs/DOMAIN.md` §3.12).

Settings ends with About, below its four tabs and outside them, so it shows on every tab: a heading at
20 px and two `ink-2` lines, the site line with its Risk link and the legal pages in one line joined by
middle dots (`docs/CONTENT-STYLE.md` §3), plain links inline in the text as on the site pages' footer.

Built in M1: Navigation (`TabBar`, `TopNav`, and `AppHeader` with the wordmark and the Settings gear as
a 44 px icon link), `Timeline`, `CoinChart`, Circle toggle, Switch, Checkbox, Radio group as choice
cards (`RadioCard`: a title, a line, an optional leading badge, and `describedBy` for text the cards share), Textarea, Collapsible and Tooltip,
and the Toast again, as our own instead of Base UI's (ADR-0045 §14). No Menu: no M1 screen needs one
(the header holds only the gear, Settings has its tabs, a log row's actions sit in its detail and in
the form), so it waits for a screen that does. Notes, and the values this document left open:

- **Timeline.** Each phase gets a row: its name and dates in HTML on the left, its bar on one shared
  time axis on the right. The prototype's single band with labels set along it would need text placed
  at a position, which takes a style attribute or stretched SVG text. The bars speak the strip's
  language (buy and sell 8 px, hold 2 px, the way out dashed), the past is a 2 px `ink` line over
  them, points on a bar (the holding date, the sell parts) are filled once done and rings before,
  and today is an `accent` line across the rows with a dot on top and a key under them. Phase names
  are 16 px at 600, their dates 13 px. The plan's references (the cycle plan's halving and expected
  peak, `docs/DOMAIN.md` §5) follow the phases as rows of their own, in the strip's language: a range
  is a 2 px `ink-3` line like the strip's peak, a point an `ink-3` ring. Below 48rem it is a list: a
  rail of dots in date order, past ones filled, coming ones rings filled with the backdrop (`on`),
  today the accent dot with its own word and `aria-current="date"`, under the drawing's name shown as
  a sentence (14 px `ink-2`), the one string the drawing carries from 48rem. Like every chart (ADR-0022) the
  drawing is named and described, and the table view sits under it at every width. The phases are
  named as nouns, `Buying` · `Holding` · `Selling` · `Out by`, never as instructions (`docs/LEGAL.md`
  §6), on Plan and in Today's strip alike. A plan with no sell window holds with no end: the axis ends
  on `No end set`, and the drawing's name says `Plan from 1 Oct 2026, with no end set.`, never a date
  the plan does not hold; the strip's end is only where it stops drawing.
- **Coin chart.** Buys are hollow 10 px circles and sales hollow 10 px squares, so shape tells them
  apart; the average cost is a 1.5 px dashed `ink-2` level labelled at its right end, drawn only
  inside the range; marks beyond the plot are clamped to its edge (y) or left out (x). The crosshair
  is a dotted `ink-3` line with an 8 px dot, and the tooltip, anchored to the point, follows a mouse or
  a finger sliding sideways (`touch-action: pan-y`). The average's label is the one SVG text: an
  overlay without a viewBox, placed in percent, so it neither stretches nor needs a style attribute.
  On Portfolio it is drawn in an open holdings row only (a closed row's detail is hidden, never
  emptied, so it holds no chart), over the value chart's range, its line in the coin's colour as in the
  allocation bar, and only while the value chart draws or loads. While that chart shows a line instead
  (no purchase yet, the closes unavailable, too few closes, a range with nothing to draw, closes that
  end before the first entry, nothing held), an open row draws nothing: it would be the path's first
  historic view without the past-performance line (`docs/LEGAL.md` §4). With the closes unavailable,
  the row keeps its empty frame's place, unseen, as the value chart keeps its own. A coin with closes but fewer
  than two inside the range shows no chart and one `ink-2` line of its own in its place, naming the coin
  and the range's dates (`docs/CONTENT-STYLE.md` §3); a coin with no closes at all shows nothing, and the
  value chart's line says why. The allocation bar shows only while something is held: a bar weighed by
  the amount invested would sit beside a value of 0.
- **Tooltip.** `ink` with `background` text, radius sm, 13 px, fading in 180 ms after Base UI's 600 ms
  hover delay (at once on a chart, which opens it itself); a visual aid only, whose words the
  trigger's name repeats. It weighs about 37 kB brotli
  (Base UI's positioning and hover handling), so it lives in the lazily loaded charts and never on
  every page: the header's gear has none.
- **Switch, checkbox, circle toggle.** The switch is a 52 × 44 target around a 44 × 24 track, on being
  the `ink` fill with the thumb to the right; the checkbox a 20 px box with a 2 px `line-2` border, the
  circle toggle a 20 px circle, each in a 44 px target, ticked or done being the `ink` fill with a
  check. Those checks are glyphs of 16 px or less at a stroke of 3, heavier than the icons' 1.75, so
  they stay legible. A refused, unticked checkbox (`aria-invalid`) has the `negative` border, as a
  refused field's is. Disabled boolean controls and choice cards are drawn at half opacity. The
  checkbox's focus ring is drawn just inside its 44 px target (an offset of minus the ring's width,
  the one exception to §6's offset), so it keeps clear of the label 4 px beside it.
- **Tabs.** The list never scrolls sideways: the tabs share its width and a long label wraps onto a
  second, balanced line, so four tabs fit a 360 px phone at 125 % text. The list is padded by the focus
  ring's extent (§6), so nothing clips a focused tab's ring, and the active tab's 2 px `ink` underline
  still sits on the list's hairline.
- **Segmented control.** It hugs its options (the range selector). With `stretch` it spans its
  container, and each option takes its label's width plus an equal share of the rest, never under
  44 px. Its border is padded by the focus ring's extent (§6), so the first and the last option's
  rings stay inside it. A label wraps onto a second, balanced line inside its option only when its share is too
  narrow. The entry sheet's choice of kinds uses it: every set of kinds reads on one line on a 360 px
  phone and at zoom-125, and at 360 px with 125 % text the starting amount's set wraps two of its
  labels (measured 2026-11-05).
- **Dialog footer.** The buttons keep their DOM order on screen at every width (WCAG 2.4.3): the safe
  action first and the destructive one last, stacked top to bottom on phones and in a row to the right
  from 640 px, so the order the eye reads is the Tab order. Focus stays inside while it is open, so
  Shift+Tab from the first button wraps to the last. While its action runs (a replace, a delete, an end
  of buying), the dialog stays open: Escape, a press outside it and the safe button do nothing. Both
  buttons are disabled but still focusable, so the focus stays put (§6). The action settles in the open
  dialog, and a refusal shows inside it.
- **Choice cards.** A `line-2` boundary on `surface`; chosen is an `ink` boundary on `surface-2` with
  a filled dot; in a refused group (`aria-invalid`) the chosen card's boundary is `negative`, as a
  refused field's is; the badge is a radius-sm tag in `ink-2`.
- **Textarea and Collapsible.** The textarea has the input's look, at least 5.5rem (three lines) tall,
  growing with its text where `field-sizing` is supported. The collapsible's trigger is a 44 px row
  whose chevron turns; its panel opens to its height in 180 ms, its fields' focus rings inside its clip
  (§6). The trigger's words name what it
  reveals, so they say what happens while it is closed (`docs/CONTENT-STYLE.md` §1 rule 7), and they stay
  once it is open (`Show 3 more conditions`, `Show the values as a table`): the chevron and
  `aria-expanded` carry the state. A reading page, such as the country card, holds no collapsible.
- **Toast.** M0's look on our own code: a new toast replaces the one on screen, its Undo included (a
  Settings save within End buying's undo window ends that Undo); at most one action
  (undo, edit, reload) beside the close button, both 44 px buttons in the tab order, and pressing the
  action closes the toast first. The viewport is a polite live region (`role="status"`) that stays in
  the document, so a toast is announced when it appears. It never takes focus; F6 moves focus into it,
  and focus goes back where it came from when the toast closes or is replaced (End buying's and Delete everything's Undo place it themselves; a Log row's and a skip's Undo move it after, §6), also after the page
  has lost focus and got it back. The manager the app creates holds the one toast and its timer
  (`UNDO_WINDOW_MS` for an undo, none for the update prompt), which waits while the pointer is on the
  toast, focus is in it, the page is out of focus or out of sight (another tab or app), or a modal
  Sheet or Dialog is open over it (§7), and then runs its whole window again. It rises 16 px and fades in over `slow`, fades out with the exit
  easing, and both take 1 ms under reduced motion.
- **The module sheet's `Close`.** A "Why?" sheet has no foot, so its `Close` stays in view as the module
  scrolls, on the `overlay` fill, so text scrolled under it stays out of the way, and the title scrolls
  off: a module's idea runs to several lines at 360 px, and the focus on the section keeps the place.
  Other sheets keep a `Close` that scrolls with them, because they have Save or Cancel at the foot. At
  rest it sits where theirs does, 8 px from the popup's top right, in the 44 px target. It is the
  popup's first child, since a last child cannot stick to the top of its scroller, so on this sheet it
  comes first in the tab order, and a sheet opened with no section puts the focus on it. The popup
  keeps every sheet's scroll padding (§6): more would cover `Close`'s band, the browser would scroll
  to reveal it on each focus, and only the reader's place would move. Every element of the module
  takes a scroll margin of that place and height instead, on top of the padding, so a section heading
  scrolled to the top, or a link Tab reaches under `Close`, stops with its whole ring clear of it;
  `Close` stands outside the module and takes none. Tested by the `module-sheet.stories.tsx` play functions and on the viewport
  matrix (`apps/web/e2e/why.spec.ts`).
- **Server HTML.** Base UI's checkbox, radio and switch render a hidden input with an inline style
  attribute, which the CSP blocks in server HTML, so they render a look-alike until hydration
  (`lib/hydrated.ts`), and an open collapsible panel waits for the client. Without a script the
  look-alikes stay inert and the panel's content never arrives, so Collapsible, Checkbox, Switch and
  RadioCard are for client-rendered app screens only, never for the site pages prerendered with no
  script (ADR-0045). A unit test renders every component on the server and finds no style
  attribute. The M0 Select still carries Base UI's, so a screen renders it on the client only, as the
  screens do once the store has hydrated; its inline `<style>` elements: `docs/SECURITY.md` §4.

## 9. Icons and assets

Icons from `lucide-react` at 20 px, stroke 1.75, in `ink` or `ink-2`; no filled icons; no emoji.
App icons: `favicon.svg` (adaptive to colour scheme), `favicon.ico` (16, 32, 48 with a larger dot),
`icon-192.png` and `icon-512.png` (`purpose: any`), `icon-maskable-192.png` and
`icon-maskable-512.png` (opaque full-bleed paper or charcoal, the ring within the central 80 %),
`icon-monochrome-512.png`, `apple-touch-icon.png` 180 px opaque without rounded corners, manifest
screenshots per form factor (planned: M2), an OG image 1200 × 630 (planned: M2), two `theme-color` meta tags for light and dark
set to the two backgrounds. The Android adaptive-icon safe zone is 66 dp; the PWA uses the maskable
icon.

## 10. Checks that enforce this document

- Lighthouse accessibility 100 and axe clean on every page and story.
- A unit test over `tokens.css` recomputes the contrast table in §3 and fails on regression
  (`packages/ui/test/tokens.test.ts`, from the OKLCH values; the hex fallbacks must name the same colour
  and pass WCAG on their own).
- The palette validator runs in CI when `tokens.css` changes (light against `background`, dark
  against `surface`, all pairs), with the dark band exception asserted explicitly
  (`packages/ui/test/palette.test.ts`, which also asserts the results recorded in §4).
- Visual snapshots per screen, viewport and theme (`docs/ENGINEERING.md` §2).
- A lint forbids hex colours, `px` font sizes and font-family declarations outside `packages/ui/src/styles`
  (`tools/lint/styles.ts`, part of `pnpm lint`; it also forbids removing the focus outline).

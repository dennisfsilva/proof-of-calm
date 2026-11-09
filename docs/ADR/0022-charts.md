# ADR-0022: Charts

Status: Accepted · Date: 2026-10-16 · Deciders: planning session (research: `docs/research/stack-frontend.md` §7; chart design method: the dataviz skill's validator and mark specs)

## Context

The charts are few and simple: the portfolio value line with one global range selector, a per-coin line with buy and sell markers and a dashed average-cost line, the allocation bar, sparklines, the simulator chart with drawdown shading, the plan's progress strip and timeline. The prototype draws them in about 150 lines of SVG. Libraries measured: Recharts 3.10.1 at 96 kB brotli (incompatible with the budget), lightweight-charts 5.2.1 at 46 kB (canvas, client-only), visx primitives 24 kB, uPlot 20 kB (no accessibility), Observable Plot 76 kB.

## Decision

**Custom SVG**, as the prototype: pure helpers in `packages/core/charts` (scales, path builders, drawdown segments, tick generation, downsampling; all property-tested) and thin components in `packages/ui/charts` (`LineChart`, `CoinChart`, `AllocationBar`, `Sparkline`, `SimulatorChart`, `ProgressStrip`, `Timeline`). About 3 kB. lightweight-charts is lazy-loaded behind `use(browser())` only if a zoomable many-thousand-point chart is ever needed; Recharts is out.

Rules (from the dataviz method and the brand system, `docs/DESIGN.md`):

- Colour follows the entity: each coin has a fixed colour from the validated palette in both themes; the validator (`validate_palette.js`) is run whenever the palette changes, in light against the paper surface and in dark against the charcoal surface. Status colours (positive, negative, accent) are never reused as series colours.
- One axis per chart; never a dual axis. Thin marks: 2 px lines, markers at least 8 px, 2 px surface gaps between fills in the allocation bar, recessive grid and axes in the line tokens.
- Text wears text tokens, never the series colour; numbers in tabular figures; values labelled selectively (ends, the last point, the average line), never on every point.
- Legend present whenever there are two or more series (the holdings table doubles as the legend for the allocation bar); a single series needs no legend box.
- Every chart has `role="img"`, an `aria-label` that states the series, range and change ("Portfolio value, last year, from 1,200 € to 1,860 €, +55 %"), a `<desc>`, and a `<details>` with the data as a table built from the same values.
- Hover and touch: a transparent overlay with pointer events, `touch-action: pan-y`, a crosshair and a tooltip that follows the pointer; 44 px targets for the range selector; nothing is hover-only.
- Reduced motion: no path animation when `prefers-reduced-motion` is set; otherwise one short fade.
- Dark mode uses its own validated colour steps, not an automatic inversion.

## Consequences

- Everything renders at build time and in the static-export host.
- Storybook stories per chart at phone and desktop widths, light and dark, with the a11y addon; snapshot tests of the SVG path output for fixed data in the core.
- The simulator's drawdown shading is a path under the running maximum, computed in the core and tested.

## Readings recorded by the build session

The decision stands; these are the choices its text left open, made while building `CoinChart` and
`Timeline` on 2026-10-17 (`docs/DESIGN.md` §8 has the visual values).

- **Hover.** The plot listens to pointer moves (`touch-action: pan-y`, so a finger sliding sideways
  works too), snaps the crosshair to the nearest point the shell passes, and shows Base UI's Tooltip,
  open while a point is hovered and anchored to that point on the screen. Base UI's tooltip weighs
  about 37 kB brotli, so it stays in the lazily loaded charts; if a page cannot afford it, the same
  words can sit in the plot as SVG text placed in percent, like the average's label, for well under
  1 kB.
- **Labels at a data position.** Text stays in HTML except where it must sit at a data position: the
  average cost's label is SVG text in an overlay without a viewBox, placed in percent, so it neither
  stretches nor needs a style attribute (`docs/SECURITY.md` §4).
- **Timeline.** Phases, and then the plan's references, are rows with their names and dates in HTML
  beside one shared time axis, not one band with labels placed along it, so no label is positioned
  and none can collide; below 48rem the drawing gives way to the list of milestones. The drawing keeps
  every rule above: `role="img"`, the `aria-label`, the description and the table. Its rows are HTML,
  and an HTML element has no `<desc>`, so the description is a hidden paragraph the drawing names with
  `aria-describedby`, which gives assistive technology the same description.
- **2026-11-09, BarChart.** A component the Decision's list leaves out, added for a module's
  `drawdowns-bar` chart (#62): one horizontal bar per row from a shared zero, its label before it and
  its value after it in HTML, every row one `--bar-row` high (`docs/DESIGN.md` §6), one series in the
  neutral fill, `role="img"` with the summary as its label, and the table with the same values.

## Deviations recorded on 2026-10-26

- **2026-10-26, a time chart's label states no change figure.** The Decision's example ("Portfolio
  value, last year, from 1,200 € to 1,860 €, +55 %") ends in a change; on the Portfolio value chart that
  figure would count the money bought inside the range as a rise, so the label carries the series, the
  range, its dates and the first and last values only, and its own dates alone when the closes start
  after the range's first day. The wording is `docs/CONTENT-STYLE.md` §3's "Portfolio value chart" row;
  `docs/DESIGN.md` §4 states the rule for every time chart.

## Disagreement

None.

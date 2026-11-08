# Research scripts (2026-10-16)

Analysis scripts written by the planning session's research agents, kept for reproducibility; not
part of the product build.

- `fonts/` — font binary inspection (tabular figures, features, axes, file sizes) with fontTools.
- `analysis/` — OKLCH/WCAG/APCA/colour-vision checks for the design tokens (`color.py`, `bands.py`,
  `widths.py`), the DCA rolling-window and Red day frequency computations (`analyze.py`,
  `analyze2.py`, `extra.py`, `bci_check.py`), the Fear & Greed statistics (`fng_stats.py`,
  `cmc_stats.py`), public-API price pulls (`fetch_prices.py`) and PDF text extraction helpers.

The raw inputs these downloaded (exchange candles, PDFs, pages) are deliberately not committed
(ADR-0036: never commit raw exchange files); re-run the scripts to regenerate them.

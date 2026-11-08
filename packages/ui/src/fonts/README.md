# Fonts

Self-hosted subsets of IBM's builds of IBM Plex (docs/DESIGN.md §5), under the SIL Open Font
License 1.1 (`OFL.txt`, copied unchanged from the source package).

| File | Source | What was kept | Size |
|---|---|---|---|
| `calm-sans-latin.woff2` | `@ibm/plex-sans-variable@0.2.0`, `fonts/complete/ttf/IBM Plex Sans Var-Roman.ttf` (version 3.000) | upright, `wght` 400–600, `wdth` pinned at 100, Latin | 34,712 bytes |
| `calm-mono-latin.woff2` | `@ibm/plex-mono@2.5.0`, `fonts/complete/woff2/IBMPlexMono-Regular.woff2` (version 2.005) | Regular 400, Latin | 14,396 bytes |

## Why the files are called Calm Sans and Calm Mono

"Plex" is a Reserved Font Name. A subset is a Modified Version under the OFL (OFL FAQ 2.6), and a
Modified Version may not use a Reserved Font Name without the copyright holder's written permission
(OFL FAQ 5.8). The family names inside both files were therefore changed; the copyright record is
untouched, and the trademark and licence records (name IDs 7, 13 and 14) are not in the files:
pyftsubset drops them by default. The typeface is IBM Plex; only the name inside the files differs.

## How they were made

The IBM packages are fetched with `npm pack` into a scratch folder and never installed: they run a
telemetry `postinstall` script. fontTools 4.66.1 with its `woff` extra (Brotli) did the work, run with
`uv`. The Latin set is Google Fonts' `latin` range plus ≤ and ≥; it covers U+202F (French grouping),
U+2212 (minus), U+00D7 (multiplication sign), U+2013 (en dash) and U+20AC (euro).

```sh
npm pack @ibm/plex-sans-variable@0.2.0 @ibm/plex-mono@2.5.0 --pack-destination src --ignore-scripts
tar -xzf src/ibm-plex-sans-variable-0.2.0.tgz -C src/sans
tar -xzf src/ibm-plex-mono-2.5.0.tgz -C src/mono

LATIN="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+2264-2265,U+FEFF,U+FFFD"
FEATURES="--layout-features+=tnum,zero,ss03,ss04,case,lnum"
FT='uv run --no-project --with fonttools[woff]==4.66.1'

$FT fonttools varLib.instancer "src/sans/package/fonts/complete/ttf/IBM Plex Sans Var-Roman.ttf" \
  wght=400:600 wdth=100 --output out/plex-sans-wght-400-600.ttf
$FT pyftsubset out/plex-sans-wght-400-600.ttf --unicodes="$LATIN" "$FEATURES" --flavor=woff2 \
  --output-file=out/ibm-plex-sans-latin.woff2
$FT pyftsubset src/mono/package/fonts/complete/woff2/IBMPlexMono-Regular.woff2 --unicodes="$LATIN" \
  "$FEATURES" --flavor=woff2 --output-file=out/ibm-plex-mono-latin.woff2
```

The rename then replaced the family in every name record except IDs 0, 7, 13 and 14 (copyright,
trademark, licence; of these the subset kept only ID 0): `IBM Plex Sans Var` became `Calm Sans`
(PostScript `IBMPlexSansVar` became `CalmSans`) and `IBM Plex Mono` became `Calm Mono` (`IBMPlexMono`
became `CalmMono`), saved as WOFF2 with fontTools' `TTFont`.

Both files keep `zero`, `ss03` and `ss04`. Plex has no `tnum` or `case` feature to keep: its figures are
tabular and lining by default, which is why the text family needs no `font-feature-settings` for numbers.

## Where they are used

`src/styles/fonts.css` declares both with `@font-face`; the hosts and Storybook import it, and
`theme.css` maps the sans family to `--font-sans`. The hosts' build preloads the sans file with its
hashed name (`packages/config/vite/font-preload-plugin.ts`; docs/DESIGN.md §5).

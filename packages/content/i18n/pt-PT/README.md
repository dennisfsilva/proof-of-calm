# pt-PT

The European Portuguese translations of the content, sparse, in `jurisdictions/`, `templates/`, `facts/` and `learn/` under the English file's name (ADR-0057; a module's, ADR-0048): the four templates, the profiles of Portugal, the United Kingdom, Ireland, the United States and the generic country (`jurisdictions/pt.json`, `jurisdictions/gb.json`, `jurisdictions/ie.json`, `jurisdictions/us.json`, `jurisdictions/xx.json`) and the Learn modules Start here, Noise, When the market drops, Cycles and Taxes where you live (`learn/start-here.mdx`, `learn/noise.mdx`, `learn/when-the-market-drops.mdx`, `learn/cycles.mdx`, `learn/taxes-where-you-live.mdx`) so far.

For translators: write every number as a numeral, as the English does, and keep a quoted law title or statutory term in its own language, word for word (in a pending change's title or summary, translate the words around the quotation).

In a template's texts, write each percentage as the English does, `40 %` with an ordinary space, in the same order: the app writes it in the plan's format (`overlay-percent-mismatch` otherwise).

In a profile whose page writes a comma decimal (Germany, Spain, France, Italy, the Netherlands, Portugal), copy every figure as the English writes it. Put a no-break space between groups from 10 000 (`EUR 20 350`, written `\u00a0` in JSON) and none below (`EUR 1000`). Write a decimal with a comma (`5,5 %`). Keep a point only in a citation (`art. 33.1`). Never write `EUR 20.350` or `EUR 20,350`.

In every profile and module, whatever its decimal, join a currency code to its figure and a form's name to its number with a no-break space (`GBP 3000`, `100 USD`, `Modelo 721`, `Anexo G`; `figure-join`, `docs/CONTENT-STYLE.md` §4).

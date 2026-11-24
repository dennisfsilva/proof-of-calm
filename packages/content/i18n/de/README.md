# de

The German translations of the content, sparse, in `templates/` under the English file's name (ADR-0057): the four templates (`templates/accumulate.json`, `templates/btc-only-hold.json`, `templates/cycle-plan.json`, `templates/two-coins.json`) so far. No profile, fact or Learn module is translated yet, so no `rules/de/` folder is generated.

For translators: write German as `docs/CONTENT-STYLE.md` §10 sets it (`Sie`, the glossary, the imperative rule of §2's German rows), and write every number as a numeral, as the English does, except in a template's name, which spells out its number (`Drei Coins, ohne Verkaufsfenster`).

In a template's texts, keep each `{date:<field>}` placeholder of the English text, and write each percentage as the English does, `40 %` with an ordinary space, in the same order: the app writes it in the plan's format (`overlay-percent-mismatch` otherwise). Keep the explanation's paragraphs, each after a blank line as in the English, and no other line break.

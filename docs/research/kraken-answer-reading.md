# Reading of Kraken's market data answer

Date: 2026-11-27. The evidence behind ADR-0036's Reading of 2026-11-27. Not legal advice.

## What was read

- The answer: Kraken's support, for its Market Data Team, on 2026-11-26 at 15:42 PST. It answered
  the letter the owner resent that day (`docs/research/letters/kraken-market-data.md`) and the
  owner's answers to the address's automatic reply. ADR-0036 quotes it.
- Kraken's Terms of Service, read live on the night of 2026-11-26. A desktop browser's request was
  used, since the fetch tool cut both documents at 100,000 characters:
  - the EEA Terms (https://www.kraken.com/legal/eea-terms), "Last updated: November 18, 2026", with
    the same date on the Portuguese and German copies;
  - the Global Terms (https://www.kraken.com/legal/global-terms), with the same date.
- Kraken's other pages:
  - the API documentation's full text (https://docs.kraken.com/llms-full.txt, 45,045 lines, with no
    version);
  - support articles 360047124832 (the bulk OHLCVT files, updated 2026-11-02), 360000919986 (the
    public endpoints) and 206548367 (the rate limits, updated 2026-10-01);
  - the Exchange Trading Rules.
- No API or market-data terms document exists. Nine likely URLs return 404, and the documentation
  carries no licence, redistribution or attribution statement. Its only licensing line is the
  contact row that names marketdata@kraken.com. The bulk files' article and the README inside the
  2026Q3 archive state no terms of use.

## The clauses

- Which terms apply. The Global Terms say: "These Terms of Service will apply to you unless you live
  in Brazil (...), Canada or the European Economic Area (EEA)", and "If you reside in the European
  Economic Area (EEA), the EEA Terms of Service are the binding agreement between you and Payward".
  Their list of EEA countries includes Portugal.
- EEA §11.1, "Our Content":
  - "We or our licensors own (...) all content, materials, software, and trademarks found on them
    (including, for example, our pricing data)".
  - "we permit you to use our services, and Our Content made available to you as part of our
    services, but only for approved purposes as permitted by us and for your own benefit. We can
    take away this permission at any time for any reason."
  - "If you wish to use Our Content for any other purpose you must seek prior permission to do so by
    contacting marketdata@kraken.com."
- EEA §11.5, "When you use our services, you agree not to":
  - "copy, modify, disassemble, decompile, or reverse engineer Our Content";
  - "licence, sublicence, sell, resell, transfer, assign, distribute or otherwise commercially exploit
    or make available to any third party Our Content in any way";
  - "access or use Our Content to build or support products or services competitive to our services";
  - "use any web scraping, web harvesting, or data extraction methods to extract any data from Our
    Content, or create, use, operate, or employ any bots, robots, parsers, spiders, scripts,
    programs, routines, or any other forms of automation to engage in any activity on Our Content";
  - "develop any third party applications that interact with Our Content without our prior written
    consent".
- EEA §16.7: "Each party agrees that it will have no remedies in respect of any statement,
  representation, assurance or warranty (...) that is not set out in this Agreement", though the
  Agreement "does not limit any separate, mutually agreed upon, duly executed written agreement".
- Whom the EEA Terms bind is unclear:
  - §1.4 binds anyone "otherwise accessing or using our services or the Platform";
  - §2.2 says "You must have an Account with us in order to use any of our services";
  - the public endpoints need no account (support article 360000919986: "a Kraken account is not
    required").
  The answer makes compliance with the Terms a condition of its own approval, so the project acts as
  bound.
- The rate limits (support article 206548367): "Calling the public endpoints at a frequency of 1 per
  second (or less) would remain within the rate limits".

## The three readings

Each reader worked alone with one lens. They all saw the answer, the letter, the automatic reply's
answers, the project's facts and the clauses above.

- strict: how Kraken's own lawyers would read it;
- plain: what the agent most plausibly meant;
- red team: assume everything is published, then find where that fails.

| Use | Strict | Plain | Red team |
|---|---|---|---|
| U1 collect: the bulk files once, then OHLC daily | covered on a condition | covered | covered |
| U2 keep per-exchange closes privately | covered on a condition | covered | covered on a condition |
| U3 compute the reference closes | covered | covered | covered |
| U4 show them in the app | unclear | covered on a condition | covered on a condition |
| U5 publish them in the public repository | not covered | unclear | unclear |
| U6 a person's CSV valued at them | covered on a condition | covered on a condition | covered on a condition |
| U7 days where Kraken is the only source | not covered | not covered | not covered |
| U8 the same uses in a paid tier | not covered | not covered | not covered |
| U9 Kraken's Ticker as the live fallback | not covered | unclear | not covered |
| U10 computed figures on public pages | covered on a condition | covered | covered |

The conditions in common:

- the rate limits;
- a store nobody else can read;
- no real value committed or served from the production domain before Kraken's yes;
- only the person's own valuations in the CSV;
- figures, not closes, on the public pages.

Where they agreed:

- The paragraph on changed plans begins "If your plans change to include a customer-facing
  product". It assumes plans with none of the uses the letter described, so the reply most likely
  filed the request as internal use or answered from a template. It came minutes after the automatic reply's answers,
  marked Solved, in words close to the Terms. It approves the customer-facing parts no more than it
  refuses them, and it asks for contact "before proceeding". The reply in the same thread is that
  contact.
- How many sources a day has decides whether its reference close is a derived metric:
  - one source: the reference close is Kraken's own close, which is the underlying data;
  - two sources: their mean is a new number, but Kraken's close comes back as twice the mean less
    the other exchange's public close, so it is derived in form and reversible in fact; picking one
    of the two would publish that exchange's close;
  - three sources: the strongest case for a derived metric, though the median always equals one
    exchange's close;
  - per cent changes and other computed figures are derived metrics on any day.
- Session 19 does not wait. It builds and runs the pipeline privately, with publication switched off.
- Coinbase's market-data terms are unread, yet every two-source day before the pipeline's first run
  rests on them.

Where they differed:

- The CSV: strict allows values on three-source dates now; the other two wait for Kraken's yes
  before launch.
- The Ticker fallback: ask Kraken (plain), drop it (red team), or either (strict). The owner's reply
  leaves it out, since no session needs it.
- Silence is not a yes (strict). If the owner chooses to publish before an answer, the least exposed
  form is two- and three-source days only, with no reuse grant (red team). That choice would be a new
  Reading.

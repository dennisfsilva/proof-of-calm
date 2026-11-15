# Changelog

What changed for the people who use Proof of Calm, in plain words. Each session's docs sync adds
the user-visible changes merged to `main` under `Unreleased`; the release PR gives that section its
version and its date (`docs/RELEASE.md`).

## Unreleased

There has been no release yet. This section lists what the app does on 15 Nov 2026, before its first
release.

### The plan and the monthly loop

- Set up a plan once, with no account: your country first, then one of 4 templates or your own
  coins and split, the monthly amount, and the first and last buy days. The plan and the entries are
  stored on this device.
- Today shows this month's buy. `Bought as planned` records it in one tap and estimates its units
  from the day's price. You can edit it, delete it with an undo, or skip the month. You can pause the
  plan or end buying.
- Record an extra buy or a sale on any day, coins you held before the plan or received as a gift,
  and moves between an exchange and a wallet.
- Coins you move between an exchange and a wallet keep each purchase's date and cost.
- Add the monthly buy day to your calendar with a calendar file.

### Where you are

- Portfolio: the value over time, the split, and each coin's units and average cost.
- Plan: the milestones from the first buy to the last, the sell window's 3 parts where the plan has
  one, and your note if you wrote one. In the sell phase, where a holding rule applies, it shows the
  units past their holding date and the date for the rest.
- Log: every entry by month, with each purchase's holding date where your plan has a holding rule.
- Once a year, a review lists the units the Log holds at each exchange or wallet, so you can check
  them against what each exchange or wallet shows.

### Your country's rules

- Holding rules and tax years for 9 countries, each with its sources and the date it was last
  checked, and a profile for every other country that shows no tax-free date.
- A dated notice on Today when the rules for your plan's country change in the app, with a link to
  review the plan.
- A tax-year export: a CSV of the lots in your country's tax year, with the day each lot passes the
  country's holding rule where there is one. The file says it is not a tax computation.

### Learn

- 6 short modules: Start here, Cycles, Noise, Risk honestly, Taxes where you live, and When the
  market drops. A `Why?` link opens a module in a sheet without leaving the screen.
- When the coins you hold fall 10 % or more in 7 days, or end a day 30 % or more below their 90-day
  high, Today shows one line, once per fall, that opens a page about it. The page shows that fall
  beside each coin's earlier dated falls, where the app has any, and your note, if you wrote one.

### Your data

- Export everything as a JSON backup and import it again, export the Log as a CSV file, or delete
  everything.
- Import the buys and sales from an exchange's export file into the Log, after a preview; the import
  lists the formats it reads.

### Risks

- A Risk page on the web, linked from the footer of every site page. It says that with a plan, no
  single day's price decides what you pay on average, and that a plan does not limit how far a
  price can fall. It shows the coins' earlier falls from a high in a table, with their dates and
  source.
- It covers custody with a provider or in your own wallet, and tax. It lists the signs of a scam and
  what the app never asks for.
- Its one statement on status says the app "is not registered with or supervised by any financial
  supervisor, and no investor-compensation or deposit-protection scheme covers crypto-assets".
- It shows where to check a provider in ESMA's public register and how to find an adviser. It links
  to official warnings, each with the date its link was checked.

### On the web and offline

- Install the app on a phone's home screen. It opens offline and shows the last prices with the
  time they were fetched.
- The Learn modules, one page per country, and a holding-date page open on the web without the app.
  Search engines do not list them yet.

# Changelog

What changed for the people who use Proof of Calm, in plain words. Each session's docs sync adds
the user-visible changes merged to `main` under `Unreleased`; the release PR gives that section its
version and its date (`docs/RELEASE.md`).

## Unreleased

There has been no release yet. This section lists what the app does on `main` on 15 Nov 2026.

### The plan and the monthly loop

- Set up a plan once, with no account: your country first, then one of 4 templates or your own
  coins and split, the monthly amount and the first buy day. The plan and the entries are stored on
  this device.
- Today shows this month's buy. `Bought as planned` records it at the day's prices in one tap; you
  can edit it, delete it with an undo, or skip the month. You can pause the plan or end buying.
- Record an extra buy or a sale on any day, coins you held before the plan or received as a gift,
  and coins you moved between an exchange and a wallet, which keep their purchase dates and costs.
- Add the monthly buy day to your calendar with a calendar file.

### Where you are

- Portfolio: the value over time, the split, and each coin's units and average cost.
- Plan: your sentence, the milestones, and in the sell phase the units you can sell under your
  country's rule.
- Log: every entry by month, with each purchase's holding date where your country has a holding rule.
- Once a year, a review compares the units the Log holds at each exchange or wallet with what they show.

### Your country's rules

- Holding rules and tax years for 9 countries, each with its sources and the date it was last
  checked, and a profile for every other country that shows no tax-free date.
- A dated notice when a country's rule is set to change.
- A tax-year export: a CSV of the year's lots, shaped by your country's tax year and rules.

### Learn

- 6 short modules: Start here, Cycles, Noise, Risk honestly, Taxes where you live and When the
  market drops. A `Why?` link opens a module in a sheet without leaving the screen.
- When the coins in your plan fall far below their recent high, one banner on Today, once per fall,
  opens a page with that fall beside past falls and the sentence you wrote at setup.

### Your data

- Export everything as a JSON backup and import it again, export the Log as a CSV file, or delete
  everything.
- Import the buys and sales in an exchange's export file into the Log, after a preview.

### On the web and offline

- Install the app on a phone's home screen. It opens offline and shows the last prices with the
  time they were fetched.
- The Learn modules, one page per country and a holding-date page open on the web without the app.
  Search engines do not list them yet.

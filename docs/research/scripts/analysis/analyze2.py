import csv, sys, datetime as dt, bisect, os
D = sys.argv[1]
def load(name):
    rows = []
    with open(os.path.join(D, name)) as f:
        for r in csv.DictReader(f):
            rows.append((dt.date.fromisoformat(r["date"]), float(r["open"]), float(r["high"]), float(r["low"]), float(r["close"])))
    rows.sort(); return rows

def combos(rows, start, end, label, pairs):
    dates = [r[0] for r in rows]; closes = [r[4] for r in rows]
    i0 = bisect.bisect_left(dates, dt.date.fromisoformat(start)); i1 = bisect.bisect_right(dates, dt.date.fromisoformat(end))
    years = (i1 - i0) / 365.25
    print("\n  [%s] %s..%s" % (label, dates[i0], dates[i1-1]))
    for thr7, thr90 in pairs:
        hits = []
        for i in range(max(i0, 90), i1):
            hi = max(closes[i-90:i]); hits.append((closes[i]/closes[i-7]-1 <= thr7/100) or (closes[i]/hi-1 <= thr90/100))
        cnt = sum(hits); ep = 0; prev = False
        for h in hits:
            if h and not prev: ep += 1
            prev = h
        print("    OR(7d<=%g%%, 90dHigh<=%g%%): %5.1f%% of days | %5.1f days/yr | %4.1f entries/yr" % (thr7, thr90, 100*cnt/len(hits), cnt/years, ep/years))
    # single thresholds
    print("    7-day change <= thr: share of days / episodes per yr")
    for thr in (-10, -15):
        hits = [closes[i]/closes[i-7]-1 <= thr/100 for i in range(max(i0, 7), i1)]
        cnt = sum(hits); ep = 0; last = -999
        for k, h in enumerate(hits):
            if h:
                if k - last > 7: ep += 1
                last = k
        print("      %g%%: %.1f%% of days, %.1f episodes/yr" % (thr, 100*cnt/len(hits), ep/years))
    for thr in (-25, -30, -35):
        hits = [closes[i]/max(closes[i-90:i])-1 <= thr/100 for i in range(max(i0, 90), i1)]
        cnt = sum(hits); ep = 0; prev = False
        for h in hits:
            if h and not prev: ep += 1
            prev = h
        print("      90dHigh %g%%: %.1f%% of days, %.1f entries/yr" % (thr, 100*cnt/len(hits), ep/years))
    # 1-day drops for reference
    for thr in (-5, -10):
        hits = [closes[i]/closes[i-1]-1 <= thr/100 for i in range(max(i0, 1), i1)]
        print("      1-day <= %g%%: %.1f%% of days, %.1f days/yr" % (thr, 100*sum(hits)/len(hits), sum(hits)/years))

btc = load("bitstamp_btcusd_daily.csv"); eth = load("coinbase_ethusd_daily.csv")
P = ((-10, -30), (-12.5, -30), (-15, -30), (-10, -35), (-15, -35), (-15, -40))
print("== BTC combos =="); combos(btc, "2021-10-16", "2026-10-16", "BTC last 5y", P); combos(btc, "2016-10-16", "2026-10-16", "BTC last 10y", P)
print("== ETH combos =="); combos(eth, "2021-10-16", "2026-10-16", "ETH last 5y", P)

# last 12 months of BTC monthly closes for context
print("\n== BTC month-end closes, last 15 months (Bitstamp) ==")
last_by_month = {}
for r in btc:
    last_by_month[(r[0].year, r[0].month)] = r
for k in sorted(last_by_month)[-15:]:
    r = last_by_month[k]; print("  %s close %.0f" % (r[0], r[4]))

# halving -> peak intervals and multiples
halv = {"2012": dt.date(2012, 11, 28), "2016": dt.date(2016, 7, 9), "2020": dt.date(2020, 5, 11), "2024": dt.date(2024, 4, 20)}
peaks = {"2012": dt.date(2013, 11, 30), "2016": dt.date(2017, 12, 17), "2020": dt.date(2021, 11, 10), "2024": dt.date(2025, 10, 6)}
print("\n== Halving -> peak ==")
for k in halv:
    d = (peaks[k] - halv[k]).days; print("  %s: %s -> %s = %d days = %.1f months (30.44 d)" % (k, halv[k], peaks[k], d, d/30.4375))
print("\n== Peak-to-peak multiples (intraday highs: 31.91 Mt.Gox 2011-06-08; 1163 Bitstamp 2013-11-30; 19666 Bitstamp 2017-12-17; 69000 Bitstamp 2021-11-10; 126272 Bitstamp 2025-10-06) ==")
pk = [("2011", 31.91), ("2013", 1163.0), ("2017", 19666.0), ("2021", 69000.0), ("2025", 126272.0)]
for (a, pa), (b, pb) in zip(pk, pk[1:]):
    print("  %s -> %s: %.1fx" % (a, b, pb/pa))
print("== Trough-to-peak multiples (lows: 2.22 Bitstamp 2011-10-20 [Mt.Gox ~2.0 2011-11]; 152.40 2015-01-14; 3122.28 2018-12-15; 15479 2022-11-21) ==")
tr = [("2011 low", 2.22), ("2015 low", 152.40), ("2018 low", 3122.28), ("2022 low", 15479.0)]
for (a, pa), (b, pb) in zip(tr, pk[1:]):
    print("  %s -> %s peak: %.0fx" % (a, b, pb/pa))
print("  2011 low (Mt.Gox ~2.0) -> 2013 peak: %.0fx" % (1163/2.0))

import json, sys, datetime as dt
from collections import OrderedDict

path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    raw = json.load(f)
px = OrderedDict()
for r in raw["data"]:
    if r.get("PriceUSD") in (None, ""):
        continue
    d = dt.date.fromisoformat(r["time"][:10])
    px[d] = float(r["PriceUSD"])
dates = list(px.keys())
print("rows", len(dates), "first", dates[0], "last", dates[-1], "last price", round(px[dates[-1]], 2))
missing = (dates[-1] - dates[0]).days + 1 - len(dates)
print("missing days in series:", missing)

def minus_years(d, n):
    try:
        return d.replace(year=d.year - n)
    except ValueError:
        return d.replace(year=d.year - n, day=28)

def plus_months(d, n):
    y = d.year + (d.month - 1 + n) // 12
    m = (d.month - 1 + n) % 12 + 1
    return dt.date(y, m, 1)

def price_on_or_after(d):
    while d not in px:
        d += dt.timedelta(days=1)
        if d > dates[-1]:
            return None, None
    return d, px[d]

# ---- 1. Lump-sum 4-year rolling return, every day ----
def rolling(nyears, start_from=None):
    out = []
    for d in dates:
        s = minus_years(d, nyears)
        if s < dates[0] or (start_from and s < start_from):
            continue
        if s in px:
            out.append((d, s, px[d] / px[s]))
    return out

for ny in (4, 3, 2, 5):
    r = rolling(ny)
    neg = [x for x in r if x[2] < 1.0]
    mn = min(r, key=lambda x: x[2])
    print(f"\n[{ny}-year rolling, lump sum, all days] windows={len(r)} negative={len(neg)} ({100*len(neg)/len(r):.2f}%) min ratio={mn[2]:.4f} on end {mn[0]} (start {mn[1]}, {px[mn[1]]:.2f} -> {px[mn[0]]:.2f})")
    if ny == 4:
        # start dates >= 2013-01-01
        r13 = rolling(ny, dt.date(2013, 1, 1))
        neg13 = [x for x in r13 if x[2] < 1.0]
        print(f"   start>=2013: windows={len(r13)} negative={len(neg13)} ({100*len(neg13)/len(r13):.2f}%)")
        # worst (lowest) ratio per calendar year of window end
        byyear = {}
        for d, s, ratio in r:
            y = d.year
            if y not in byyear or ratio < byyear[y][2]:
                byyear[y] = (d, s, ratio)
        print("   lowest 4y ratio by END year:")
        for y in sorted(byyear):
            d, s, ratio = byyear[y]
            print(f"     {y}: min ratio {ratio:.3f} ({(ratio-1)*100:+.1f}%) end {d} px {px[d]:.0f} vs start {s} px {px[s]:.0f}")
        if neg:
            print("   negative windows (first 10):", [(str(a), str(b), round(c,3)) for a,b,c in neg[:10]])
            # group negative runs
            runs=[]; cur=None
            for d,s,ratio in neg:
                if cur and (d-cur[1]).days==1: cur[1]=d
                else:
                    if cur: runs.append(tuple(cur))
                    cur=[d,d]
            if cur: runs.append(tuple(cur))
            print("   negative runs (end-date ranges):", [(str(a),str(b)) for a,b in runs])

# ---- 2. Specific date checks ----
print("\n[specific dates]")
for s in ["2021-04-14","2021-11-08","2021-11-09","2021-11-10","2021-11-21","2022-01-01","2022-02-05","2022-06-18","2022-10-16","2022-11-21",
          "2025-04-07","2025-10-06","2025-11-10","2025-11-21","2025-12-31","2026-01-01","2026-02-05","2026-02-06","2026-04-07","2026-06-01","2026-10-15"]:
    d = dt.date.fromisoformat(s)
    if d in px:
        s4 = minus_years(d, 4)
        extra = f"  4y-earlier {s4}: {px[s4]:.2f}  ratio {px[d]/px[s4]:.3f}" if s4 in px else ""
        print(f"  {d}: {px[d]:.2f}{extra}")
    else:
        print(f"  {d}: not in series")
for y in (2024, 2025, 2026):
    ys = [(d, px[d]) for d in dates if d.year == y]
    if ys:
        lo = min(ys, key=lambda x: x[1]); hi = max(ys, key=lambda x: x[1])
        print(f"  {y}: low {lo[1]:.0f} on {lo[0]}, high {hi[1]:.0f} on {hi[0]}")

# ---- 3. Monthly DCA, 48 purchases on the 1st of each month ----
def dca_windows(first_start, months=48, fee=0.0, amount=100.0):
    res = []
    start = first_start
    while True:
        end_month = plus_months(start, months)  # valuation date: 1st of month after final purchase
        ed, ep = price_on_or_after(end_month)
        if ed is None:
            break
        btc = 0.0; cost = 0.0; ok = True
        for i in range(months):
            bd, bp = price_on_or_after(plus_months(start, i))
            if bd is None: ok = False; break
            btc += amount * (1 - fee) / bp
            cost += amount
        if not ok: break
        res.append((start, ed, btc * ep / cost))
        start = plus_months(start, 1)
    return res

for label, fs in (("since 2013-01", dt.date(2013,1,1)), ("since 2010-08", dt.date(2010,8,1)), ("since 2015-01", dt.date(2015,1,1))):
    for fee in (0.0, 0.01):
        w = dca_windows(fs, 48, fee)
        pos = [x for x in w if x[2] > 1.0]
        mn = min(w, key=lambda x: x[2])
        print(f"\n[48-month DCA {label}, fee {fee:.0%}] windows={len(w)} ({w[0][0]}..{w[-1][0]} starts; last valuation {w[-1][1]}) above cost basis={len(pos)} ({100*len(pos)/len(w):.1f}%) min value/cost={mn[2]:.3f} (start {mn[0]}, valued {mn[1]})")
        if fee == 0.0:
            below = [(str(a), str(b), round(c,3)) for a,b,c in w if c <= 1.0]
            print("   windows at/below cost basis:", below if below else "none")
            # worst by valuation year
            byy = {}
            for a,b,c in w:
                if b.year not in byy or c < byy[b.year][2]: byy[b.year]=(a,b,c)
            print("   lowest value/cost by valuation year:", {y:(str(v[0]), round(v[2],3)) for y,v in sorted(byy.items())})

# ---- 4. 36- and 60-month monthly DCA for context ----
for months in (12, 24, 36, 60):
    w = dca_windows(dt.date(2013,1,1), months, 0.0)
    pos = [x for x in w if x[2] > 1.0]
    mn = min(w, key=lambda x: x[2])
    print(f"[{months}-month DCA since 2013-01, no fee] windows={len(w)} above cost={len(pos)} ({100*len(pos)/len(w):.1f}%) min={mn[2]:.3f} (start {mn[0]})")

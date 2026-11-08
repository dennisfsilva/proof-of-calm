import json, sys, datetime as dt
raw = json.load(open(sys.argv[1], encoding="utf-8"))
px = {dt.date.fromisoformat(r["time"][:10]): float(r["PriceUSD"]) for r in raw["data"] if r.get("PriceUSD")}
ds = sorted(px)
def my(d, n):
    try: return d.replace(year=d.year-n)
    except ValueError: return d.replace(year=d.year-n, day=28)
neg5 = [(d, px[d]/px[my(d,5)]) for d in ds if my(d,5) in px and px[d] < px[my(d,5)]]
print("5-year negative days:", [(str(d), round(r,3)) for d, r in neg5])
mn5 = min(((d, px[d]/px[my(d,5)]) for d in ds if my(d,5) in px), key=lambda x: x[1])
print("5-year worst:", mn5[0], round(mn5[1],3), px[my(mn5[0],5)], "->", px[mn5[0]])
for s in ["2026-10-15"]:
    d = dt.date.fromisoformat(s)
    for n in (1,2,3,4,5):
        print(f"{d} {n}y ratio {px[d]/px[my(d,n)]:.3f} CAGR {(px[d]/px[my(d,n)])**(1/n)-1:+.1%} (from {px[my(d,n)]:.0f})")
# worst 4y window in 2025-2026 expressed as CAGR
for s in ["2025-04-13","2026-03-29"]:
    d = dt.date.fromisoformat(s); r = px[d]/px[my(d,4)]
    print(f"{d}: 4y ratio {r:.3f} CAGR {r**0.25-1:+.1%}")
# count of days in 2025-2026 with 4y ratio below 1.5
low = [d for d in ds if d.year >= 2025 and my(d,4) in px and px[d]/px[my(d,4)] < 1.5]
print("days in 2025-26 with 4y return < +50%:", len(low), "first", low[0] if low else None, "last", low[-1] if low else None)

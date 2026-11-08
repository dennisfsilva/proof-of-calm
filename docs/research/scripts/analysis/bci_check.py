import json, sys, datetime as dt
j = json.load(open(sys.argv[1]))
px = {}
for v in j["values"]:
    if v["y"] and v["y"] > 0:
        px[dt.datetime.utcfromtimestamp(v["x"]).date()] = v["y"]
ds = sorted(px); print("blockchain.info rows", len(ds), ds[0], ds[-1], px[ds[-1]])
def my(d, n):
    try: return d.replace(year=d.year-n)
    except ValueError: return d.replace(year=d.year-n, day=28)
r = [(d, px[d]/px[my(d,4)]) for d in ds if my(d,4) in px]
neg = [x for x in r if x[1] < 1]
mn = min(r, key=lambda x: x[1])
print("4y windows", len(r), "negative", len(neg), "min ratio", round(mn[1],3), "end", mn[0], "start", my(mn[0],4), px[my(mn[0],4)], "->", px[mn[0]])
r5 = [(d, px[d]/px[my(d,5)]) for d in ds if my(d,5) in px]
neg5 = [x for x in r5 if x[1] < 1]
print("5y windows", len(r5), "negative", len(neg5), "first/last negative", neg5[:1], neg5[-1:])

import json, sys, datetime
with open(sys.argv[1], encoding="utf-8") as f:
    d = json.load(f)
def u(t): return datetime.datetime.fromtimestamp(int(t), datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
data = d["data"]
print("top-level data keys:", list(data.keys()))
dl = data["dataList"]
print("dataList entries:", len(dl))
print("first:", dl[0]["timestamp"], u(dl[0]["timestamp"]), dl[0]["score"], dl[0]["name"])
print("last :", dl[-1]["timestamp"], u(dl[-1]["timestamp"]), dl[-1]["score"], dl[-1]["name"])
ts = sorted(int(x["timestamp"]) for x in dl)
gaps = [(u(a), u(b), (b-a)/86400) for a,b in zip(ts, ts[1:]) if b-a != 86400]
print("non-1-day steps:", len(gaps)); [print("  ", g) for g in gaps[:15]]
print("expected days:", (ts[-1]-ts[0])//86400+1, "actual:", len(set(ts)))
for k,v in data.items():
    if k == "dataList": continue
    print(f"--- {k} ---")
    if k == "historicalValues":
        for kk, vv in v.items(): print("  ", kk, vv, "=>", u(vv["timestamp"]))
    else:
        print("  ", json.dumps(v))
from collections import defaultdict
rng = defaultdict(lambda: [999,-1])
for x in dl:
    s = int(x["score"]); c = x["name"]; rng[c][0]=min(rng[c][0],s); rng[c][1]=max(rng[c][1],s)
for c,(lo,hi) in sorted(rng.items(), key=lambda kv: kv[1][0]): print(f"  observed {c}: {lo}-{hi}")
print("status:", json.dumps(d.get("status")))

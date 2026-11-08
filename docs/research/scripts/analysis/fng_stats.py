import json, sys, datetime
p = sys.argv[1]
with open(p, encoding="utf-8") as f:
    d = json.load(f)
data = d["data"]
ts = [int(x["timestamp"]) for x in data]
print("entries:", len(data))
def u(t): return datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
newest = data[0]; oldest = data[-1]
print("newest:", newest["value"], newest["value_classification"], newest["timestamp"], u(ts[0]), "time_until_update:", newest.get("time_until_update"))
print("oldest:", oldest["value"], oldest["value_classification"], oldest["timestamp"], u(ts[-1]))
print("min ts:", min(ts), u(min(ts)), " max ts:", max(ts), u(max(ts)))
# gaps
s = sorted(ts)
gaps = [(u(a), u(b), (b-a)//86400) for a,b in zip(s, s[1:]) if b-a != 86400]
print("non-1-day steps:", len(gaps))
for g in gaps[:20]: print("  gap:", g)
expected = (max(ts)-min(ts))//86400 + 1
print("expected days if continuous:", expected, " actual:", len(set(ts)), " dupes:", len(ts)-len(set(ts)))
# classification -> value ranges observed
from collections import defaultdict
rng = defaultdict(lambda: [999,-1])
for x in data:
    v = int(x["value"]); c = x["value_classification"]
    rng[c][0] = min(rng[c][0], v); rng[c][1] = max(rng[c][1], v)
for c,(lo,hi) in sorted(rng.items(), key=lambda kv: kv[1][0]): print(f"  observed {c}: {lo}-{hi}")
# first few oldest entries
print("oldest 5:")
for x in data[-5:]: print("  ", x["timestamp"], u(int(x["timestamp"])), x["value"], x["value_classification"])
print("newest 8:")
for x in data[:8]: print("  ", x["timestamp"], u(int(x["timestamp"])), x["value"], x["value_classification"])

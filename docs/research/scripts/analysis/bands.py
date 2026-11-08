import json, sys
from collections import defaultdict
def bands(items, vkey, ckey, label):
    m = defaultdict(set)
    for x in items: m[int(x[vkey])].add(x[ckey])
    overlaps = {v: s for v, s in m.items() if len(s) > 1}
    print(f"{label}: distinct values {min(m)}..{max(m)}; values with >1 label: {overlaps if overlaps else 'none'}")
    # contiguous runs
    runs = []; prev = None
    for v in sorted(m):
        c = next(iter(m[v]))
        if prev and prev[0] == c: prev[2] = v
        else: prev = [c, v, v]; runs.append(prev)
    for c, lo, hi in runs: print(f"   {c}: {lo}-{hi}")
alt = json.load(open(sys.argv[1], encoding="utf-8"))["data"]
bands(alt, "value", "value_classification", "alternative.me (3176 daily records)")
cmc = json.load(open(sys.argv[2], encoding="utf-8"))["data"]["dataList"]
bands(cmc, "score", "name", "CMC chart data (1206 records)")

import re, json, sys, html
p = sys.argv[1]
raw = open(p, encoding="utf-8", errors="replace").read()
# 1) FAQ JSON-LD
print("=== JSON-LD FAQ ===")
for m in re.finditer(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', raw, re.S):
    try:
        obj = json.loads(m.group(1))
    except Exception as e:
        continue
    objs = obj if isinstance(obj, list) else [obj]
    for o in objs:
        if isinstance(o, dict) and o.get("@type") == "FAQPage":
            for q in o.get("mainEntity", []):
                print("Q:", q.get("name"))
                print("A:", (q.get("acceptedAnswer") or {}).get("text"))
                print()
        elif isinstance(o, dict):
            print("[ld+json type]", o.get("@type"), {k: o.get(k) for k in ("datePublished","dateModified","headline") if k in o})
# 2) About/component paragraphs: strip tags, find component text
txt = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', raw, flags=re.S)
txt = re.sub(r'<[^>]+>', '\n', txt)
txt = html.unescape(txt)
txt = re.sub(r'[ \t]+', ' ', txt)
txt = re.sub(r'\n\s*\n+', '\n', txt)
print("=== visible text around components ===")
for key in ["Price Momentum", "Volatility", "Derivatives Market", "Market Composition", "CMC Proprietary Data", "What is the CMC", "How to use", "How is", "updated", "ranges from 0 to 100"]:
    for mm in list(re.finditer(re.escape(key), txt))[:2]:
        s = max(0, mm.start()-80); e = min(len(txt), mm.end()+700)
        print(f"--- [{key}] ---")
        print(txt[s:e].replace("\n", " | "))
        print()

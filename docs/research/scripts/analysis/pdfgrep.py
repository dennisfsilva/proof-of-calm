import sys, re, logging
logging.getLogger('pypdf').setLevel(logging.ERROR)
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from pypdf import PdfReader
path = sys.argv[1]
terms = [t.lower() for t in sys.argv[2].split("|")] if len(sys.argv) > 2 else []
ctx = int(sys.argv[3]) if len(sys.argv) > 3 else 350
r = PdfReader(path)
print(f"PAGES: {len(r.pages)}")
for i, p in enumerate(r.pages, 1):
    try:
        t = p.extract_text() or ""
    except Exception as e:
        print(f"[p{i}] extract error {e}"); continue
    t = re.sub(r"[ \t]+", " ", t)
    low = t.lower()
    if not terms:
        print(f"\n===== PAGE {i} =====\n{t}")
        continue
    for term in terms:
        for m in re.finditer(re.escape(term), low):
            s = max(0, m.start()-ctx); e = min(len(t), m.end()+ctx)
            print(f"\n--- p{i} [{term}] ---\n{t[s:e]}")

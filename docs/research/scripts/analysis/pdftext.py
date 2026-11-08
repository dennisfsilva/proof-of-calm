import sys, re
from pypdf import PdfReader
path, pats = sys.argv[1], sys.argv[2:]
r = PdfReader(path)
print(f"### {path}: {len(r.pages)} pages")
texts = []
for i, p in enumerate(r.pages):
    try:
        t = p.extract_text() or ""
    except Exception as e:
        t = f"[extract error {e}]"
    texts.append(t)
full = "\n".join(texts)
print("total chars:", len(full))
if pats:
    for pat in pats:
        for m in re.finditer(pat, full, flags=re.I):
            s = max(0, m.start()-250); e = min(len(full), m.end()+350)
            print(f"\n--- match '{pat}' @ {m.start()}:\n" + re.sub(r"\s+", " ", full[s:e]))
else:
    print(re.sub(r"[ \t]+", " ", full)[:6000])

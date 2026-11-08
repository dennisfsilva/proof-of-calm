import sys
def extract(path):
    try:
        from pypdf import PdfReader
    except ImportError:
        try:
            from PyPDF2 import PdfReader
        except ImportError:
            return None
    r = PdfReader(path)
    return "\n".join((p.extract_text() or "") for p in r.pages)
for p in sys.argv[1:]:
    t = extract(p)
    if t is None:
        print("NO_PDF_LIB"); sys.exit(2)
    out = p + ".txt"
    open(out, "w", encoding="utf-8").write(t)
    print(out, len(t))

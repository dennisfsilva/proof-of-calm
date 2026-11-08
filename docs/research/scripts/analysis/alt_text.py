import re, sys, html
raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()
t = re.search(r'<title>(.*?)</title>', raw, re.S|re.I); print("TITLE:", t.group(1).strip() if t else None)
for mt in re.findall(r'<meta[^>]+(?:description|published|modified|date)[^>]*>', raw, re.I)[:6]: print("META:", mt[:300])
txt = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', raw, flags=re.S)
txt = re.sub(r'<[^>]+>', '\n', txt); txt = html.unescape(txt)
txt = re.sub(r'[ \t\r]+', ' ', txt); txt = re.sub(r'\n\s*\n+', '\n', txt)
def seg(start, end, maxlen=6000):
    i = txt.find(start)
    if i < 0: print(f"[{start}] NOT FOUND"); return
    j = txt.find(end, i+len(start)) if end else -1
    j = j if j > 0 else i+maxlen
    print(f"----- [{start}] -> [{end}] -----"); print(txt[i:j].strip()[:maxlen]); print()
seg("Each day", "Why Measure")
seg("Why Measure", "Data Sources")
seg("Data Sources", "API")
seg("The next update", "Historical", 400)
seg("Now", "Last month", 300)
seg("Historical Values", "Data Sources", 600)
seg("API", "Disclaimer", 3000)
# any 'since' / year statements
for m in re.finditer(r'[^\n]*\b(since|launched|started|20(?:17|18|19))\b[^\n]*', txt, re.I):
    s = m.group(0).strip()
    if len(s) < 400: print("YEAR/SINCE:", s)

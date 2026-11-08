import urllib.request, re, io, tarfile, zipfile
from fontTools.ttLib import TTFont
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60).read()
def report(name, data):
    f = TTFont(io.BytesIO(data)); cmap = f.getBestCmap(); hmtx = f['hmtx']
    widths = [hmtx[cmap[ord(c)]][0] for c in '0123456789' if ord(c) in cmap]
    feats = sorted({fr.FeatureTag for fr in f['GSUB'].table.FeatureList.FeatureRecord}) if 'GSUB' in f else []
    # check tnum alternates width equality if present
    print(f"{name}\tdefault digit widths equal={len(set(widths))==1} ({min(widths)}..{max(widths)} upem {f['head'].unitsPerEm})\ttnum={'tnum' in feats}\tpnum={'pnum' in feats}\tbytes={len(data)}")
fams = [('Inter','wght@100..900'),('Geist','wght@100..900'),('IBM Plex Sans','wght@100..700'),('Source Sans 3','wght@200..900'),('Instrument Sans','wght@400..700'),('Figtree','wght@300..900'),('Manrope','wght@200..800'),('Public Sans','wght@100..900'),('Archivo','wght@100..900')]
for fam, axis in fams:
    css = get(f'https://fonts.googleapis.com/css2?family={urllib.parse.quote(fam)}:{axis}&display=swap').decode()
    m = re.search(r'/\* latin \*/.*?src: url\((https://[^)]+\.woff2)\)', css, re.S)
    report('GoogleFonts latin :: ' + fam, get(m.group(1)))
with tarfile.open('upstream/ibm-plex-sans-variable-0.2.0.tgz') as t:
    for m in t.getmembers():
        if m.name.endswith('Var-Roman-Latin1.woff2'): report('upstream :: IBM Plex Sans Var Latin1', t.extractfile(m).read())
with tarfile.open('upstream/geist-1.8.1.tgz') as t:
    for m in t.getmembers():
        if m.name.endswith('geist-sans/Geist-Variable.woff2'): report('upstream :: Geist-Variable.woff2', t.extractfile(m).read())

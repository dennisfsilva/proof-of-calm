import sys, io, tarfile, zipfile, os, re, urllib.request
from fontTools.ttLib import TTFont
def inspect(name, data):
    try:
        f = TTFont(io.BytesIO(data))
    except Exception as e:
        print(name, 'ERR', e); return
    feats = sorted({fr.FeatureTag for fr in f['GSUB'].table.FeatureList.FeatureRecord}) if 'GSUB' in f else []
    axes = [(a.axisTag, a.minValue, a.maxValue) for a in f['fvar'].axes] if 'fvar' in f else []
    lic = ''
    try:
        lic = f['name'].getDebugName(13) or ''
    except Exception: pass
    glyphs = len(f.getGlyphOrder())
    print(f"{name}\t{len(data)} bytes\t{glyphs} glyphs\taxes={axes}\ttnum={'tnum' in feats}\tlnum={'lnum' in feats}\tzero={'zero' in feats}\tfeats={','.join(feats)}\tlicense={lic[:60]!r}")
for tgz in sorted(os.listdir('.')):
    if not tgz.endswith('.tgz'): continue
    with tarfile.open(tgz) as t:
        for m in t.getmembers():
            n = m.name.lower()
            if n.endswith('.woff2') and ('variable' in n or 'var' in n or 'wght' in n) and ('italic' not in n) and ('mono' not in n) and ('latin' in n or 'complete' in n or 'geist-sans' in n or 'files/' in n):
                if 'files/' in n and not re.search(r'latin-wght-normal|latin-standard-normal', n): continue
                inspect(f"{tgz} :: {m.name}", t.extractfile(m).read())
# Inter upstream zip
try:
    url = 'https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip'
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'}), timeout=120).read()
    z = zipfile.ZipFile(io.BytesIO(data))
    for n in z.namelist():
        if n.lower().endswith('intervariable.woff2'):
            inspect('Inter-4.1.zip :: ' + n, z.read(n))
except Exception as e:
    print('Inter upstream ERR', e)

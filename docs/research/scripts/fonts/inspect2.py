import io, tarfile, urllib.request
from fontTools.ttLib import TTFont
def inspect(name, data):
    f = TTFont(io.BytesIO(data))
    feats = sorted({fr.FeatureTag for fr in f['GSUB'].table.FeatureList.FeatureRecord}) if 'GSUB' in f else []
    axes = [(a.axisTag, a.minValue, a.maxValue) for a in f['fvar'].axes] if 'fvar' in f else []
    lic = ''
    try: lic = f['name'].getDebugName(13) or ''
    except Exception: pass
    print(f"{name}\t{len(data)} bytes\t{len(f.getGlyphOrder())} glyphs\taxes={axes}\ttnum={'tnum' in feats}\tzero={'zero' in feats}\tfeats={','.join(feats)}\tlicense={lic[:50]!r}")
with tarfile.open('ibm-plex-sans-1.1.0.tgz') as t:
    for m in t.getmembers():
        n = m.name.lower()
        if n.endswith('.woff2') and 'var' in n and 'italic' not in n and 'complete' in n:
            inspect('@ibm/plex-sans :: ' + m.name, t.extractfile(m).read()); break
for url in ['https://github.com/adobe-fonts/source-sans/raw/release/WOFF2/VAR/SourceSans3VF-Roman.ttf.woff2','https://raw.githubusercontent.com/adobe-fonts/source-sans/release/VAR/SourceSans3VF-Roman.ttf']:
    try:
        data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'}), timeout=120).read()
        inspect('adobe source-sans release :: ' + url.split('/')[-1], data); break
    except Exception as e:
        print('source sans fetch ERR', url, e)

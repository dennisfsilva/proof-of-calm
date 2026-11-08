import urllib.request, re, io, os, sys
from fontTools.ttLib import TTFont
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
fams = [('Inter','wght@100..900'),('Geist','wght@100..900'),('IBM Plex Sans','wght@100..700'),('Source Sans 3','wght@200..900'),('Instrument Sans','wght@400..700'),('Figtree','wght@300..900'),('Manrope','wght@200..800'),('Public Sans','wght@100..900'),('Archivo','wght@100..900')]
def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    return urllib.request.urlopen(req, timeout=60).read()
print('family\tlatin woff2 bytes\tvariable axes\tGSUB features (subset)\ttnum\tpnum\tlnum\tonum\tzero\tss01..')
for fam, axis in fams:
    try:
        css = get(f'https://fonts.googleapis.com/css2?family={urllib.parse.quote(fam)}:{axis}&display=swap').decode()
    except Exception as e:
        print(fam, 'CSS ERR', e); continue
    m = re.search(r'/\* latin \*/.*?src: url\((https://[^)]+\.woff2)\)', css, re.S)
    if not m:
        print(fam, 'no latin block; css head:', css[:200].replace('\n',' ')); continue
    data = get(m.group(1))
    f = TTFont(io.BytesIO(data))
    feats = sorted({fr.FeatureTag for fr in f['GSUB'].table.FeatureList.FeatureRecord}) if 'GSUB' in f else []
    axes = [(a.axisTag, a.minValue, a.maxValue) for a in f['fvar'].axes] if 'fvar' in f else []
    ss = [x for x in feats if x.startswith('ss')]
    print(f"{fam}\t{len(data)}\t{axes}\t{','.join(feats)}\t{'tnum' in feats}\t{'pnum' in feats}\t{'lnum' in feats}\t{'onum' in feats}\t{'zero' in feats}\t{','.join(ss)}")

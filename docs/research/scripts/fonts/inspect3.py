import io, tarfile, os, re
from fontTools.ttLib import TTFont
def inspect(name, data):
    f = TTFont(io.BytesIO(data))
    feats = sorted({fr.FeatureTag for fr in f['GSUB'].table.FeatureList.FeatureRecord}) if 'GSUB' in f else []
    axes = [(a.axisTag, a.minValue, a.maxValue) for a in f['fvar'].axes] if 'fvar' in f else []
    lic = ''
    try: lic = f['name'].getDebugName(13) or ''
    except Exception: pass
    print(f"{name}\t{len(data)} bytes\t{len(f.getGlyphOrder())} glyphs\taxes={axes}\ttnum={'tnum' in feats}\tzero={'zero' in feats}\tfeats={','.join(feats)}\tlicense={lic[:50]!r}")
for tgz in sorted(os.listdir('.')):
    if not tgz.endswith('.tgz') or 'plex' not in tgz: continue
    with tarfile.open(tgz) as t:
        done = 0
        for m in t.getmembers():
            n = m.name.lower()
            if not n.endswith('.woff2') or 'italic' in n: continue
            if ('var' in n or 'wght' in n) and (('latin' in n and 'ext' not in n) or 'complete' in n or n.endswith('roman.woff2')):
                inspect(f"{tgz} :: {m.name}", t.extractfile(m).read()); done += 1
                if done >= 2: break
        if done == 0:
            # fall back: first static Regular woff2
            for m in t.getmembers():
                n = m.name.lower()
                if n.endswith('.woff2') and 'regular' in n and 'italic' not in n and ('latin' in n or 'complete' in n or 'fonts/' in n):
                    inspect(f"{tgz} :: {m.name} (static)", t.extractfile(m).read()); break

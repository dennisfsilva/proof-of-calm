import sys, os
sys.path.insert(0, sys.argv[1])
from fontTools.ttLib import TTFont

chars = ['0', '1', '$', '€', '£', '¥', ',', '.', '−', '-', '+', '%', ' ', ' ', ' ']
for p in sys.argv[2:]:
    f = TTFont(p)
    cmap = f.getBestCmap()
    hm = f['hmtx']
    gsub = f['GSUB'].table if 'GSUB' in f else None
    tn = {}
    if gsub:
        for fr in gsub.FeatureList.FeatureRecord:
            if fr.FeatureTag == 'tnum':
                for li in fr.Feature.LookupListIndex:
                    lk = gsub.LookupList.Lookup[li]
                    for st in lk.SubTable:
                        t = st.ExtSubTable if lk.LookupType == 7 else st
                        if getattr(t, 'LookupType', lk.LookupType) == 1:
                            tn.update(t.mapping)
    out = []
    for c in chars:
        g = cmap.get(ord(c))
        label = c if (32 < ord(c) < 127) else ('U+%04X' % ord(c))
        if not g:
            out.append('%s=absent' % label)
            continue
        w = hm[g][0]
        w2 = hm[tn[g]][0] if g in tn else None
        out.append('%s=%d%s' % (label, w, ('>%d' % w2) if (w2 is not None and w2 != w) else ''))
    print(os.path.basename(p), '|', ' '.join(out))

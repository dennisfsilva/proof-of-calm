import sys, os
sys.path.insert(0, sys.argv[1])
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen


def contours(gs, name):
    pen = DecomposingRecordingPen(gs)
    try:
        gs[name].draw(pen)
    except Exception:
        return []
    cs = []
    cur = []
    for op, args in pen.value:
        if op == 'moveTo':
            if cur:
                cs.append(cur)
            cur = [args[0]]
        elif op == 'lineTo':
            cur.append(args[0])
        elif op in ('curveTo', 'qCurveTo'):
            for p in args:
                if p is not None:
                    cur.append(p)
        elif op in ('closePath', 'endPath'):
            if cur:
                cs.append(cur)
            cur = []
    if cur:
        cs.append(cur)
    out = []
    for c in cs:
        xs = [p[0] for p in c]
        ys = [p[1] for p in c]
        out.append(((min(xs), min(ys), max(xs), max(ys)), len(c)))
    return out


def r(b):
    return tuple(int(round(v)) for v in b)


def classify_zero(cl):
    if not cl:
        return 'no outline'
    bb = [c[0] for c in cl]
    areas = sorted([((b[2] - b[0]) * (b[3] - b[1]), i) for i, b in enumerate(bb)], reverse=True)
    oi = areas[0][1]
    ob = bb[oi]
    H = ob[3] - ob[1]
    W = ob[2] - ob[0]
    inner = [b for i, b in enumerate(bb) if i != oi]
    if not inner:
        return 'single contour'
    small = [b for b in inner if (b[3] - b[1]) < 0.4 * H and (b[2] - b[0]) < 0.5 * W]
    big = [b for b in inner if b not in small]
    if len(inner) == 1:
        return ('DOTTED? (one small inner) ' if small else 'PLAIN (one counter) ') + str(r(inner[0])) + ' outer ' + str(r(ob))
    if len(inner) == 2 and len(small) == 1 and len(big) == 1:
        return 'DOTTED (counter %s + dot %s) outer %s' % (r(big[0]), r(small[0]), r(ob))
    if len(inner) == 2 and len(big) == 2:
        a, b = sorted(inner, key=lambda b: b[1])
        diag = 'diagonal' if (a[0] < b[0] or a[2] < b[2]) else 'stacked/other'
        return 'SLASHED? (two counters, %s) lower %s upper %s outer %s' % (diag, r(a), r(b), r(ob))
    return '%d inner contours: %s outer %s' % (len(inner), '; '.join(str(r(b)) for b in inner), r(ob))


def bounds(gs, name):
    if not name:
        return None
    bp = BoundsPen(gs)
    try:
        gs[name].draw(bp)
    except Exception:
        return None
    return bp.bounds


def analyze(path):
    f = TTFont(path)
    nm = f['name']
    fam = nm.getDebugName(16) or nm.getDebugName(1)
    ver = nm.getDebugName(5)
    upm = f['head'].unitsPerEm
    os2 = f['OS/2']
    sx = getattr(os2, 'sxHeight', None)
    sc = getattr(os2, 'sCapHeight', None)
    cmap = f.getBestCmap()
    rev = {}
    for cp, g in cmap.items():
        rev.setdefault(g, []).append(cp)
    gs = f.getGlyphSet()
    print('=' * 110)
    print(os.path.basename(path), '|', fam, '|', ver, '| UPM', upm, '| outlines', 'glyf' if 'glyf' in f else ('CFF2' if 'CFF2' in f else 'CFF'), '| glyphs', len(f.getGlyphOrder()))
    g = lambda ch: cmap.get(ord(ch))
    bx = bounds(gs, g('x')); bH = bounds(gs, g('H')); b3 = bounds(gs, g('3')); b0 = bounds(gs, g('0')); bO = bounds(gs, g('O'))
    xh = bx[3] if bx else 0
    chh = bH[3] if bH else 0
    print('  OS/2 sxHeight=%s (%.3f em)  sCapHeight=%s (%.3f em) | measured x yMax=%s (%.3f em)  H yMax=%s (%.3f em)  x/cap=%.3f' % (
        sx, (sx or 0) / upm, sc, (sc or 0) / upm, xh, xh / upm, chh, chh / upm, (xh / chh) if chh else 0))
    print('  typo asc/desc/gap %s/%s/%s | hhea %s/%s/%s | xAvgCharWidth %s (%.3f em) | weightClass %s widthClass %s' % (
        os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap, f['hhea'].ascent, f['hhea'].descent, f['hhea'].lineGap,
        os2.xAvgCharWidth, os2.xAvgCharWidth / upm, os2.usWeightClass, os2.usWidthClass))
    if 'fvar' in f:
        print('  fvar axes:', ', '.join('%s %g..%g (default %g)' % (a.axisTag, a.minValue, a.maxValue, a.defaultValue) for a in f['fvar'].axes), '| named instances:', len(f['fvar'].instances))
    else:
        print('  fvar: none (static file)')
    hm = f['hmtx']
    digits = [g(c) for c in '0123456789']
    dw = [hm[d][0] for d in digits if d]
    print('  default digit advances:', dw, '->', 'EQUAL (tabular by default)' if len(set(dw)) == 1 else 'PROPORTIONAL by default (spread %d units)' % (max(dw) - min(dw)))
    if b3 and bx and bH:
        style = 'OLDSTYLE default (3 descends or is x-height tall)' if (b3[1] < -0.08 * upm or b3[3] < 0.85 * bH[3]) else 'LINING default'
        print('  figure 3 bounds yMin=%s yMax=%s (cap %s, x %s) -> %s' % (b3[1], b3[3], bH[3], bx[3], style))
    print('  zero (default) ->', classify_zero(contours(gs, digits[0])))
    if b0 and bO:
        print('  width 0 vs O: %d vs %d (ratio %.2f); advance 0=%d O=%d' % (b0[2] - b0[0], bO[2] - bO[0], (b0[2] - b0[0]) / float(bO[2] - bO[0]), hm[digits[0]][0], hm[g('O')][0]))
    # I / l / 1 shapes: bbox width and point count
    for ch in 'Il1':
        gn = g(ch)
        cl = contours(gs, gn)
        b = bounds(gs, gn)
        if b:
            print('  glyph %s: bbox width %d (%.3f em), contours %d, points %s' % (ch, b[2] - b[0], (b[2] - b[0]) / upm, len(cl), [c[1] for c in cl]))
    if 'GSUB' not in f:
        print('  no GSUB')
        return
    gsub = f['GSUB'].table
    feats = {}
    uiname = {}
    for fr in gsub.FeatureList.FeatureRecord:
        feats.setdefault(fr.FeatureTag, set()).update(fr.Feature.LookupListIndex)
        fp = fr.Feature.FeatureParams
        if fp is not None:
            nid = getattr(fp, 'UINameID', None) or getattr(fp, 'FeatUILabelNameID', None)
            if nid:
                uiname[fr.FeatureTag] = nm.getDebugName(nid)
    print('  GSUB features:', ' '.join(sorted(feats)))

    def subs(lis, depth=0):
        m = {}
        if depth > 3:
            return m
        for li in sorted(lis):
            lk = gsub.LookupList.Lookup[li]
            for st in lk.SubTable:
                t = st.ExtSubTable if lk.LookupType == 7 else st
                lt = getattr(t, 'LookupType', lk.LookupType)
                if lt == 1:
                    m.update(t.mapping)
                elif lt == 3:
                    for k, v in t.alternates.items():
                        m.setdefault(k, v[0])
                elif lt == 6:
                    for rec in getattr(t, 'SubstLookupRecord', None) or []:
                        m.update(subs([rec.LookupListIndex], depth + 1))
                    for csr in getattr(t, 'ChainSubRuleSet', None) or []:
                        if csr is None:
                            continue
                        for rule in csr.ChainSubRule:
                            for rec in rule.SubstLookupRecord:
                                m.update(subs([rec.LookupListIndex], depth + 1))
                    for csr in getattr(t, 'ChainSubClassSet', None) or []:
                        if csr is None:
                            continue
                        for rule in csr.ChainSubClassRule:
                            for rec in rule.SubstLookupRecord:
                                m.update(subs([rec.LookupListIndex], depth + 1))
        return m

    def ch(gn):
        cps = rev.get(gn)
        return ''.join(chr(c) for c in cps) if cps else gn

    dset = set(d for d in digits if d)
    watch = set('0 1 I l O o a g G 7 4 9 6 3 $ € £ * r i f t u ß'.split())
    tags = ['tnum', 'pnum', 'lnum', 'onum', 'zero', 'case', 'frac', 'calt', 'salt', 'liga', 'dlig'] + ['ss%02d' % i for i in range(1, 21)] + ['cv%02d' % i for i in range(1, 21)] + ['cv99']
    for tag in tags:
        if tag not in feats:
            continue
        m = subs(feats[tag])
        label = (' "%s"' % uiname[tag]) if tag in uiname else ''
        if tag == 'tnum':
            dig = [k for k in m if k in dset]
            non = [k for k in m if k not in dset]
            outw = sorted(set(hm[m[k]][0] for k in dig if m[k] in hm.metrics))
            print('  tnum%s: %d digit subs (tabular widths %s -> %s); %d non-digit inputs: %s' % (
                label, len(dig), outw, 'uniform OK' if len(outw) == 1 else 'NOT uniform', len(non), ' '.join(sorted(ch(k) for k in non))[:220]))
        elif tag in ('pnum', 'lnum', 'onum', 'case', 'frac', 'calt', 'salt', 'liga', 'dlig'):
            extra = ''
            if tag in ('lnum', 'onum'):
                extra = ' e.g. ' + ', '.join('%s>%s' % (k, m[k]) for k in list(m)[:3])
            print('  %s%s: %d subs%s' % (tag, label, len(m), extra))
        else:
            keys = [k for k in m if ch(k) in watch]
            z = m.get(digits[0])
            extra = ''
            if z:
                extra = ' | zero -> %s = %s' % (z, classify_zero(contours(gs, z)))
            print('  %s%s: %d subs; affects: %s%s' % (tag, label, len(m), ' '.join(sorted('%s>%s' % (ch(k), m[k]) for k in keys))[:300], extra))
    allz = set()
    for tag, lis in feats.items():
        m = subs(lis)
        if digits[0] in m:
            allz.add((tag, m[digits[0]]))
    if allz:
        print('  zero alternates by feature:', sorted(allz))


for p in sys.argv[2:]:
    try:
        analyze(p)
    except Exception as e:
        print('ERROR', p, repr(e))

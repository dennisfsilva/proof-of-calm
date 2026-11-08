# Pure-Python OKLCH -> sRGB, WCAG 2.x contrast, APCA-W3 0.1.9 Lc, Machado-2009 CVD simulation, OKLab dE.
import math, itertools, sys, json

def cbrt(x): return math.copysign(abs(x) ** (1/3), x)
def s2l(c): return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
def l2s(c):
    c = min(1.0, max(0.0, c))
    return 12.92*c if c <= 0.0031308 else 1.055*c**(1/2.4) - 0.055

def oklab_to_lin(L, a, b):
    l_ = L + 0.3963377774*a + 0.2158037573*b
    m_ = L - 0.1055613458*a - 0.0638541728*b
    s_ = L - 0.0894841775*a - 1.2914855480*b
    l, m, s = l_**3, m_**3, s_**3
    return (4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
            -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
            -0.0041960863*l - 0.7034186147*m + 1.7076147010*s)

def lin_to_oklab(r, g, b):
    l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
    m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
    s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b
    l_, m_, s_ = cbrt(l), cbrt(m), cbrt(s)
    return (0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
            1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
            0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_)

def in_gamut(rgb, eps=0.0005): return all(-eps <= c <= 1+eps for c in rgb)

def oklch_to_lin(L, C, h):
    rad = math.radians(h)
    rgb = oklab_to_lin(L, C*math.cos(rad), C*math.sin(rad))
    clipped = None
    if not in_gamut(rgb):
        lo, hi = 0.0, C
        for _ in range(40):
            mid = (lo+hi)/2
            if in_gamut(oklab_to_lin(L, mid*math.cos(rad), mid*math.sin(rad))): lo = mid
            else: hi = mid
        clipped = lo
        rgb = oklab_to_lin(L, lo*math.cos(rad), lo*math.sin(rad))
    return tuple(min(1, max(0, c)) for c in rgb), clipped

def lin_to_hex(rgb): return "#%02x%02x%02x" % tuple(round(l2s(c)*255) for c in rgb)
def hex_to_lin(hx):
    hx = hx.lstrip("#"); return tuple(s2l(int(hx[i:i+2], 16)/255) for i in (0, 2, 4))
def hex_to_oklch(hx):
    L, a, b = lin_to_oklab(*hex_to_lin(hx)); C = math.hypot(a, b); h = math.degrees(math.atan2(b, a)) % 360
    return L, C, h

def wcag_Y(rgb): return 0.2126*rgb[0] + 0.7152*rgb[1] + 0.0722*rgb[2]
def wcag(fg, bg):
    y1, y2 = wcag_Y(fg), wcag_Y(bg); hi, lo = max(y1, y2), min(y1, y2)
    return (hi+0.05)/(lo+0.05)

def apca_Y(hx):
    hx = hx.lstrip("#"); r, g, b = (int(hx[i:i+2], 16)/255 for i in (0, 2, 4))
    return 0.2126729*r**2.4 + 0.7151522*g**2.4 + 0.0721750*b**2.4
def apca(txt_hex, bg_hex):
    # APCA-W3 0.1.9 (4g) constants
    normBG, normTXT, revTXT, revBG = 0.56, 0.57, 0.62, 0.65
    blkThrs, blkClmp, scale, loOff, loClip, dYmin = 0.022, 1.414, 1.14, 0.027, 0.1, 0.0005
    yt, yb = apca_Y(txt_hex), apca_Y(bg_hex)
    if yt < blkThrs: yt += (blkThrs - yt)**blkClmp
    if yb < blkThrs: yb += (blkThrs - yb)**blkClmp
    if abs(yb - yt) < dYmin: return 0.0
    if yb > yt:
        s = (yb**normBG - yt**normTXT)*scale
        return 0.0 if s < loClip else (s - loOff)*100
    s = (yb**revBG - yt**revTXT)*scale
    return 0.0 if s > -loClip else (s + loOff)*100

# Machado, Oliveira & Fernandes 2009, severity 1.0, applied in linear RGB
CVD = {
 "protan": [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
 "deutan": [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
 "tritan": [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}
def simulate(rgb, kind):
    M = CVD[kind]
    out = tuple(sum(M[i][j]*rgb[j] for j in range(3)) for i in range(3))
    return tuple(min(1, max(0, c)) for c in out)
def dE(rgb1, rgb2):
    a, b = lin_to_oklab(*rgb1), lin_to_oklab(*rgb2)
    return 100*math.sqrt(sum((x-y)**2 for x, y in zip(a, b)))

def build(tokens):
    out = {}
    for name, (L, C, h) in tokens.items():
        rgb, clipped = oklch_to_lin(L, C, h)
        out[name] = {"oklch": (L, C, h), "rgb": rgb, "hex": lin_to_hex(rgb), "clipped": clipped}
    return out

def report_mode(title, tokens, surfaces, texts, coins, extra_pairs=()):
    T = build(tokens)
    bar = "=" * 100
    print("\n" + bar + "\n" + title + "\n" + bar)
    print("%-14s%-32s%-10s%s" % ("token", "oklch", "hex", "clipped C"))
    for n, v in T.items():
        L, C, h = v["oklch"]
        clip = ("-> %.3f" % v["clipped"]) if v["clipped"] is not None else ""
        print("%-14s%-32s%-10s%s" % (n, "oklch(%.3f %.3f %g)" % (L, C, h), v["hex"], clip))
    print("\nText-on-surface: WCAG ratio / APCA Lc   (* = below 4.5:1, !! = below 3:1)")
    print("%-14s" % "text/surface" + "".join("%22s" % s for s in surfaces))
    for t in texts:
        row = "%-14s" % t
        for s in surfaces:
            r = wcag(T[t]["rgb"], T[s]["rgb"]); lc = apca(T[t]["hex"], T[s]["hex"])
            flag = "" if r >= 4.5 else ("*" if r >= 3 else "!!")
            row += "%8.2f:1 / Lc%6.1f%-2s" % (r, lc, flag)
        print(row)
    for a, b in extra_pairs:
        print("pair %s on %s: WCAG %.2f:1  APCA Lc %.1f" % (a, b, wcag(T[a]["rgb"], T[b]["rgb"]), apca(T[a]["hex"], T[b]["hex"])))
    print("\nNon-text 3:1 check vs every surface (WCAG):")
    for c in coins:
        print("%-14s" % c + "".join("%8.2f:1 %s" % (wcag(T[c]["rgb"], T[s]["rgb"]), "ok " if wcag(T[c]["rgb"], T[s]["rgb"]) >= 3 else "LOW") for s in surfaces))
    print("\nCVD simulation (hex):")
    for c in coins:
        sims = {k: lin_to_hex(simulate(T[c]["rgb"], k)) for k in CVD}
        print("%-14s%s  protan %s  deutan %s  tritan %s" % (c, T[c]["hex"], sims["protan"], sims["deutan"], sims["tritan"]))
    print("\nPairwise OKLab dE x100 (normal / protan / deutan / tritan); flags: n<15 NORMAL-FAIL, cvd<8 WEAK")
    for a, b in itertools.combinations(coins, 2):
        n = dE(T[a]["rgb"], T[b]["rgb"])
        cv = {k: dE(simulate(T[a]["rgb"], k), simulate(T[b]["rgb"], k)) for k in CVD}
        flags = ("NORMAL-FAIL " if n < 15 else "") + " ".join("%s-WEAK" % k for k, v in cv.items() if v < 8)
        print("%12s vs %-12s %6.1f / %6.1f / %6.1f / %6.1f  %s" % (a, b, n, cv["protan"], cv["deutan"], cv["tritan"], flags))
    return T

if __name__ == "__main__":
    cfg = json.load(open(sys.argv[1]))
    if len(sys.argv) > 2 and sys.argv[2] == "--hexes":
        mode = cfg["modes"][int(sys.argv[3])]; T = build(mode["tokens"])
        print(",".join(T[n]["hex"] for n in sys.argv[4].split(","))); sys.exit(0)
    for mode in cfg["modes"]:
        report_mode(mode["title"], mode["tokens"], mode["surfaces"], mode["texts"], mode["coins"], mode.get("extra_pairs", []))
    if "hex_inspect" in cfg:
        print("\nInspect existing hexes as OKLCH:")
        for hx in cfg["hex_inspect"]:
            L, C, h = hex_to_oklch(hx); print("%s  oklch(%.3f %.3f %.0f)  Y=%.4f" % (hx, L, C, h, wcag_Y(hex_to_lin(hx))))

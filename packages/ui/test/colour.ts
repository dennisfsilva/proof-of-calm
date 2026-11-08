// Colour maths for the token tests (docs/DESIGN.md §3, §4 and §10), written from the definitions:
// the sRGB transfer function (IEC 61966-2-1), WCAG 2.x relative luminance and contrast ratio, OKLab
// (Björn Ottosson, "A perceptual color space for image processing", 2020) and colour-vision-deficiency
// simulation after Machado, Oliveira and Fernandes (2009) at severity 1.0, applied to linear RGB.
// Plain numbers are right here: these are colour coordinates, not amounts.

/** Linear-light sRGB, each channel 0 to 1. */
export type Rgb = readonly [number, number, number];
type Oklab = readonly [number, number, number];
export type Deficiency = 'protan' | 'deutan' | 'tritan';

const toLinear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const toGamma = (channel: number) => {
  const c = Math.min(1, Math.max(0, channel));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};

/** `#rrggbb` or `#rrggbbaa` (the alpha is ignored here) to linear RGB. */
export function hexToLinear(hex: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})(?:[0-9a-f]{2})?$/i.exec(hex);
  if (match === null) throw new Error(`not a hex colour: ${hex}`);
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => toLinear(Number.parseInt(part ?? '', 16) / 255));
  return [r ?? 0, g ?? 0, b ?? 0];
}

export function linearToHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) =>
      Math.round(toGamma(channel) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function linearToOklab([r, g, b]: Rgb): Oklab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear([lightness, a, b]: Oklab): Rgb {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const EPSILON = 0.0005;
const inGamut = (rgb: Rgb) => rgb.every((channel) => channel >= -EPSILON && channel <= 1 + EPSILON);
const clamp = (rgb: Rgb): Rgb => [
  Math.min(1, Math.max(0, rgb[0])),
  Math.min(1, Math.max(0, rgb[1])),
  Math.min(1, Math.max(0, rgb[2])),
];

/** OKLCH to linear sRGB; a colour outside sRGB keeps its lightness and hue and loses chroma until it fits. */
export function oklchToLinear(
  lightness: number,
  chroma: number,
  hue: number,
): { rgb: Rgb; clippedChroma: number | null } {
  const radians = (hue * Math.PI) / 180;
  const at = (c: number) => oklabToLinear([lightness, c * Math.cos(radians), c * Math.sin(radians)]);
  const rgb = at(chroma);
  if (inGamut(rgb)) return { rgb: clamp(rgb), clippedChroma: null };
  let low = 0;
  let high = chroma;
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2;
    if (inGamut(at(middle))) low = middle;
    else high = middle;
  }
  return { rgb: clamp(at(low)), clippedChroma: low };
}

export function linearToOklch(rgb: Rgb): { lightness: number; chroma: number; hue: number } {
  const [lightness, a, b] = linearToOklab(rgb);
  return { lightness, chroma: Math.hypot(a, b), hue: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** WCAG 2.x relative luminance. */
const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** WCAG 2.x contrast ratio, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

// Machado, Oliveira and Fernandes (2009), table for severity 1.0, rows producing R, G and B.
const MACHADO: Record<Deficiency, readonly Rgb[]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export function simulate(rgb: Rgb, deficiency: Deficiency): Rgb {
  const row = (index: number) => {
    const coefficients = MACHADO[deficiency][index] ?? [0, 0, 0];
    return coefficients[0] * rgb[0] + coefficients[1] * rgb[1] + coefficients[2] * rgb[2];
  };
  return clamp([row(0), row(1), row(2)]);
}

/** Euclidean distance in OKLab, times 100 (the dataviz validator's ΔE). */
export function deltaE(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = linearToOklab(a);
  const [l2, a2, b2] = linearToOklab(b);
  return 100 * Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

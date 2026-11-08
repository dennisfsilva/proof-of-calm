// The mark of docs/DESIGN.md §1, "the marked loop": a ring with a stroke of about one seventh of its
// diameter, very slightly superelliptical, open at about two o'clock, the gap closed by one solid
// accent dot set into the stroke. Drawn on a 100-unit square, as SVG paths and as pixels.

export type Rgba = readonly [number, number, number, number];

/** The superellipse exponent: 2 is a circle; slightly above it squares the ring just perceptibly. */
const EXPONENT = 2.12;
/** Two o'clock, in screen coordinates (y down): 60° clockwise from twelve. */
const GAP_ANGLE = (-30 * Math.PI) / 180;

export type MarkOptions = {
  /** The ring's outer diameter as a share of the square (0.7 leaves the maskable safe zone free). */
  readonly diameter: number;
  /** The dot's radius as a share of the stroke; small icons get a larger dot (DESIGN §9). */
  readonly dot: number;
};

type Geometry = { cx: number; cy: number; outer: number; inner: number; middle: number; dotR: number; gapHalf: number };

function geometry({ diameter, dot }: MarkOptions): Geometry {
  const outer = (100 * diameter) / 2;
  const stroke = (2 * outer) / 7;
  const inner = outer - stroke;
  const middle = (outer + inner) / 2;
  const dotR = (stroke / 2) * dot;
  // The gap is a little narrower than the dot, so the dot overlaps both ends and closes it.
  return { cx: 50, cy: 50, outer, inner, middle, dotR, gapHalf: (0.8 * dotR) / middle };
}

/** The distance from the centre to the superellipse through (dx, dy), in the units of a radius. */
function radiusOf(dx: number, dy: number): number {
  return (Math.abs(dx) ** EXPONENT + Math.abs(dy) ** EXPONENT) ** (1 / EXPONENT);
}

/** The point at `angle` on the superellipse of radius `r`. */
function pointAt(g: Geometry, angle: number, r: number): [number, number] {
  const scale = r / radiusOf(Math.cos(angle), Math.sin(angle));
  return [g.cx + scale * Math.cos(angle), g.cy + scale * Math.sin(angle)];
}

function angularDistance(a: number, b: number): number {
  const turn = 2 * Math.PI;
  const difference = (((a - b) % turn) + turn) % turn;
  return Math.min(difference, turn - difference);
}

function dotCentre(g: Geometry): [number, number] {
  return pointAt(g, GAP_ANGLE, g.middle);
}

/** What the mark puts at (x, y): the ring, the dot or nothing. */
export function shapeAt(options: MarkOptions, x: number, y: number): 'ring' | 'dot' | null {
  const g = geometry(options);
  const [dx, dy] = dotCentre(g);
  if ((x - dx) ** 2 + (y - dy) ** 2 <= g.dotR ** 2) return 'dot';
  const r = radiusOf(x - g.cx, y - g.cy);
  if (r < g.inner || r > g.outer) return null;
  return angularDistance(Math.atan2(y - g.cy, x - g.cx), GAP_ANGLE) < g.gapHalf ? null : 'ring';
}

/** Pixels, four by four samples each, the colours blended with straight alpha. */
export function renderMark(
  size: number,
  options: MarkOptions,
  colours: { readonly background: Rgba | null; readonly ring: Rgba; readonly dot: Rgba },
): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const samples = 4;
  const transparent: Rgba = [0, 0, 0, 0];
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = ((px + (sx + 0.5) / samples) / size) * 100;
          const y = ((py + (sy + 0.5) / samples) / size) * 100;
          const shape = shapeAt(options, x, y);
          const colour =
            shape === 'ring' ? colours.ring : shape === 'dot' ? colours.dot : (colours.background ?? transparent);
          const alpha = colour[3] / 255;
          r += colour[0] * alpha;
          g += colour[1] * alpha;
          b += colour[2] * alpha;
          a += alpha;
        }
      }
      const offset = (py * size + px) * 4;
      pixels[offset] = a === 0 ? 0 : Math.round(r / a);
      pixels[offset + 1] = a === 0 ? 0 : Math.round(g / a);
      pixels[offset + 2] = a === 0 ? 0 : Math.round(b / a);
      pixels[offset + 3] = Math.round((a / samples ** 2) * 255);
    }
  }
  return pixels;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** The ring as one SVG path (outer contour, then the inner one back) and the dot as a circle. */
export function markShapes(options: MarkOptions): { ring: string; dot: { cx: number; cy: number; r: number } } {
  const g = geometry(options);
  const start = GAP_ANGLE + g.gapHalf;
  const sweep = 2 * Math.PI - 2 * g.gapHalf;
  const steps = 120;
  const contour = (radius: number) =>
    Array.from({ length: steps + 1 }, (_, step) => pointAt(g, start + (sweep * step) / steps, radius));
  const points = [...contour(g.outer), ...contour(g.inner).reverse()];
  const ring = `${points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`).join('')}Z`;
  const [cx, cy] = dotCentre(g);
  return { ring, dot: { cx: round(cx), cy: round(cy), r: round(g.dotR) } };
}

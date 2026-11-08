// The colour a chart sits on: a card's surface or the page's background. Gaps between fills, halos
// around marks and the inside of hollow marks are painted in it, so they read as cut-outs on either
// (docs/DESIGN.md §4: 2 px surface gaps between fills).

export type Backdrop = 'surface' | 'background';

export const BACKDROP_STROKE: Readonly<Record<Backdrop, string>> = {
  surface: 'stroke-surface',
  background: 'stroke-background',
};

export const BACKDROP_FILL: Readonly<Record<Backdrop, string>> = {
  surface: 'fill-surface',
  background: 'fill-background',
};

/** For HTML marks, such as the timeline list's rings. */
export const BACKDROP_BACKGROUND: Readonly<Record<Backdrop, string>> = {
  surface: 'bg-surface',
  background: 'bg-background',
};

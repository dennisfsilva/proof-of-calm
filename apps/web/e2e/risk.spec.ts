import { expect } from '@playwright/test';
import { test } from './support';

// The Risk page's layout on every project of the matrix (docs/LEGAL.md §5): site.spec.ts runs on desktop only, and
// what these check breaks on the narrowest screen (android-small) and at 125 % text (zoom-125).

// A site table puts its main figure right after the row header (docs/DESIGN.md §8), so the narrowest screen and the
// largest text read each fall before the table scrolls.
test('the Risk page shows the Fall column without scrolling', async ({ page }) => {
  await page.goto('/risk');
  const region = page.getByRole('region', { name: /^Falls from each high/ });
  const fall = region.getByRole('columnheader', { name: 'Fall', exact: true });
  const [outer, header] = await Promise.all([region.boundingBox(), fall.boundingBox()]);
  expect(outer).not.toBeNull();
  expect(header).not.toBeNull();
  if (outer === null || header === null) return;
  expect(header.x + header.width).toBeLessThanOrEqual(outer.x + outer.width);
});

// A link target that wraps takes padding instead of a minimum height (docs/DESIGN.md §8): a one-line label and a
// wrapped one end the same distance above their checked line.
test('every official warning sits the same distance above its checked line', async ({ page }) => {
  await page.goto('/risk');
  const gaps = await page.locator('section[aria-labelledby="risk-warnings-title"] li').evaluateAll((items) =>
    items.map((item) => {
      const anchor = item.querySelector('a');
      const note = item.querySelector('span');
      if (anchor === null || note === null) return Number.NaN;
      const range = document.createRange();
      range.selectNodeContents(anchor);
      const last = [...range.getClientRects()].at(-1);
      return last === undefined ? Number.NaN : note.getBoundingClientRect().top - last.bottom;
    }),
  );
  expect(gaps.length).toBeGreaterThan(1);
  for (const gap of gaps) expect(gap).not.toBeNaN();
  expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
});

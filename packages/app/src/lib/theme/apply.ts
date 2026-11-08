// The appearance on the document, the same way the before-paint script sets it (ADR-0045 §3): `data-theme`
// only for light or dark, `data-motion="reduce"` only for reduce (docs/DESIGN.md §6), and otherwise the
// system preference in charge. The shell calls it after hydration and after a Settings change.
import type { AppearanceMirror } from './before-paint.ts';

export function applyAppearance(root: HTMLElement, value: AppearanceMirror): void {
  if (value.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', value.theme);
  if (value.motion === 'reduce') root.setAttribute('data-motion', 'reduce');
  else root.removeAttribute('data-motion');
}

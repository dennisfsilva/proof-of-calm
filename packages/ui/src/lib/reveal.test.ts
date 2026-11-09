// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealFocusedField } from './reveal';

// A sheet 300 px tall at the top of the page, with a control wholly below its bottom edge. jsdom lays nothing out, so
// the rects are given; the scroller records the move it is asked for.
function sheetWith(control: HTMLElement) {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  scroller.append(control);
  document.body.append(scroller);
  Object.defineProperty(scroller, 'clientHeight', { value: 300 });
  scroller.getBoundingClientRect = () => new DOMRect(0, 0, 320, 300);
  control.getBoundingClientRect = () => new DOMRect(0, 340, 320, 40);
  const scrollBy = vi.fn();
  scroller.scrollBy = scrollBy as typeof scroller.scrollBy;
  control.focus();
  return { scroller, scrollBy };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('revealFocusedField', () => {
  it('brings a focused text field below the fold wholly into the sheet', () => {
    const note = document.createElement('textarea');
    const { scroller, scrollBy } = sheetWith(note);
    revealFocusedField(note, scroller);
    expect(scrollBy).toHaveBeenCalledWith({ top: 80, behavior: 'instant' });
  });

  it('leaves a focused section heading where the browser places it', () => {
    // The Learn module's section heading, focused by the sheet's initialFocus: WebKit's own focus scroll centres it,
    // and the least scroll would leave it on the bottom edge with its section below the fold (docs/DESIGN.md §8).
    const heading = document.createElement('h2');
    heading.tabIndex = -1;
    heading.textContent = 'The sell window';
    const { scroller, scrollBy } = sheetWith(heading);
    expect(document.activeElement).toBe(heading);
    revealFocusedField(heading, scroller);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('leaves a focused button or link to the browser', () => {
    const button = document.createElement('button');
    const { scroller, scrollBy } = sheetWith(button);
    revealFocusedField(button, scroller);
    expect(scrollBy).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import { renderSitePage } from './render';

const ASSETS = ['<link rel="stylesheet" crossorigin href="/assets/app-1.css">'];

/** The page's main text with React's escapes undone, so a test reads the copy as a person does. */
function main(name: 'cookies' | 'risk'): string {
  const html = renderSitePage(name, ASSETS);
  const body = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  return body.replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
}

describe('the Cookie-free statement (docs/LEGAL.md §5)', () => {
  it('has one h1 and names the display settings the browser keeps and the drafts', () => {
    const page = main('cookies');
    expect(page.match(/<h1/g) ?? []).toHaveLength(1);
    const stored = page.split(/(?<=\.) /).find((sentence) => sentence.includes('display settings'));
    expect(stored).toBeDefined();
    for (const setting of ['theme', 'reduced motion', 'chart range', "the Log's view"]) {
      expect(stored).toContain(setting);
    }
    expect(page).toContain('until the tab closes');
    expect(page).toContain('Delete everything in Settings clears these too.');
  });

  it('lists what the browser keeps in order, with what lasts only for the tab last', () => {
    const paragraphs = main('cookies').match(/<p>[^<]*<\/p>/g) ?? [];
    const starts = [
      'Your browser keeps your plan',
      'Your browser also keeps your display settings',
      'Your browser keeps a record of the entries you deleted',
      'It keeps a random identifier for this device',
      'Your browser keeps form drafts until the tab closes',
    ];
    expect(paragraphs.slice(-starts.length).map((p) => p.slice(3, 3 + 60))).toEqual(
      starts.map((start) => expect.stringContaining(start)),
    );
  });

  // Everything M1 keeps in the browser, each in a sentence that also says why (§5's outline).
  it.each([
    ['your plan, your entries, and the prices fetched for your coins', 'so the app works offline'],
    ["the app's files", 'so the app opens offline'],
    ['the pages you opened for up to 7 days and the latest price data for 24 hours', 'so they show offline'],
    ['the date each copy was saved', 'so copies past their limit are cleared'],
    ['your display settings', 'so they stay as you chose them'],
    ['the dates of your last JSON backup and your last change', 'so the app can remind you to export a copy'],
    ['the banners you dismissed or that showed once', 'so they stay hidden'],
    ['the date of your last annual review', 'so the next review shows when it is due'],
    ['the entries you deleted on this device', 'so an import with Add missing entries only cannot bring them back'],
    [
      'the plan and entries that Replace everything removed, in full and marked as deleted',
      'so that import cannot bring the entries back either',
    ],
    ['These records stay', "until you choose Delete everything in Settings or clear this site's data in your browser"],
    ['a random identifier for this device', 'so your changes apply in the order you made them'],
    ['It does not leave this browser', 'no request and no backup carries it'],
    ['a copy of each change to your plan and entries', 'for syncing between devices, which the app does not offer'],
    [
      'any stored data that failed its check when read',
      'set aside instead of deleted, so a failed check erases nothing',
    ],
    ['form drafts until the tab closes', 'so what you typed comes back when you return to the form'],
    ['the tab keeps a short note until it closes', 'so it reloads only once'],
  ])('names %s and why', (item, why) => {
    const sentence = main('cookies')
      .split(/(?<=\.) |<\/?p>/)
      .find((s) => s.includes(item));
    expect(sentence).toBeDefined();
    expect(sentence).toContain(why);
  });
});

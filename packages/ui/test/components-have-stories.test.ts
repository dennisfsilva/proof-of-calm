import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every component renders in Storybook, where the story tests run it at two widths, in both themes
// and under axe (docs/ENGINEERING.md §2): a component file has a sibling `.stories.tsx`.
const components = join(import.meta.dirname, '..', 'src', 'components');

describe('components', () => {
  it('each have a story', () => {
    const files = readdirSync(components);
    const sources = files.filter((file) => file.endsWith('.tsx') && !/\.(?:test|stories)\.tsx$/.test(file));
    const withoutStory = sources.filter((file) => !files.includes(file.replace(/\.tsx$/, '.stories.tsx')));
    expect(sources.length).toBeGreaterThan(0);
    expect(withoutStory).toEqual([]);
  });
});

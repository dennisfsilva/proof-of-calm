import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { headingId } from './body-elements';
import { TAXES_MODULE, YOUR_COUNTRY } from './taxes';

// A Why? link names its section by the id its heading's words make (`headingId`), so a heading that changes its
// words moves its id: each link in the app's source must still name a heading of its module.
const src = new URL('../../../', import.meta.url);
const learn = new URL('../../../../../content/learn/', import.meta.url);

const links = readdirSync(src, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx') && !/\.(test|stories)\.tsx$/.test(path))
  .flatMap((path) =>
    [...readFileSync(new URL(path.replaceAll('\\', '/'), src), 'utf8').matchAll(/<WhyLink\b[^>]*>/gu)].map(
      ([tag]) => ({ path, module: /module="([^"]+)"/u.exec(tag)?.[1], section: /section="([^"]+)"/u.exec(tag)?.[1] }),
    ),
  );

// The tax module's sheet leads with the plan's country's card, whose heading the module's text does not hold.
const sections = (module: string) => [
  ...readFileSync(new URL(`${module}.mdx`, learn), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => headingId(line.slice(3).trim())),
  ...(module === TAXES_MODULE ? [YOUR_COUNTRY] : []),
];

describe('Why? links', () => {
  it('the app has links that name a section', () => {
    expect(links.filter((link) => link.section !== undefined).length).toBeGreaterThan(0);
  });

  it.each(links.filter((link) => link.section !== undefined))(
    '$path opens $module on $section, a heading of that module',
    ({ module, section }) => {
      expect(module).toBeDefined();
      expect(sections(module as string)).toContain(section);
    },
  );
});

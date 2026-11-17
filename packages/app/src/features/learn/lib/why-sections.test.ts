import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
    [...readFileSync(new URL(path.replaceAll('\\', '/'), src), 'utf8').matchAll(/<WhyLink\b[^>]*>/gu)].map(([tag]) => ({
      path,
      module: /module="([^"]+)"/u.exec(tag)?.[1],
      section: /section="([^"]+)"/u.exec(tag)?.[1],
    })),
  );

const i18n = new URL('../../../../../content/i18n/', import.meta.url);
const headings = (file: URL) =>
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim());

// The tax module's sheet leads with the plan's country's card, whose heading the module's text does not hold. A
// translation's h2 takes the English h2's text at its position as its id's source (`sourceHeadings`, ADR-0048,
// 2026-11-17); one past English's count keeps its own.
const sections = (module: string, translation?: URL) => {
  const english = headings(new URL(`${module}.mdx`, learn));
  const texts = translation === undefined ? english : headings(translation).map((text, at) => english[at] ?? text);
  return [...texts.map(headingId), ...(module === TAXES_MODULE ? [YOUR_COUNTRY] : [])];
};

// Every `<language>/learn/<module>.mdx` under packages/content/i18n.
const translations = readdirSync(i18n).flatMap((language) =>
  existsSync(new URL(`${language}/learn/`, i18n))
    ? readdirSync(new URL(`${language}/learn/`, i18n))
        .filter((name) => name.endsWith('.mdx'))
        .map((name) => ({ language, module: name.slice(0, -'.mdx'.length) }))
    : [],
);

const named = links.filter((link) => link.section !== undefined);

describe('Why? links', () => {
  it('the app has links that name a section, and modules with translations', () => {
    expect(named.length).toBeGreaterThan(0);
    expect(translations.length).toBeGreaterThan(0);
  });

  it.each(named)('$path opens $module on $section, a heading of that module', ({ module, section }) => {
    expect(module).toBeDefined();
    expect(sections(module as string)).toContain(section);
  });

  const translated = named.flatMap((link) =>
    translations.filter((file) => file.module === link.module).map((file) => ({ ...link, language: file.language })),
  );
  it.each(translated)('$path opens $module on $section in its $language translation too', (link) => {
    const file = new URL(`${link.language}/learn/${link.module}.mdx`, i18n);
    expect(sections(link.module as string, file)).toContain(link.section);
  });
});

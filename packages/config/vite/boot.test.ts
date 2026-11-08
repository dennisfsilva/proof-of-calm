import { createHash } from 'node:crypto';
import type { ConfigEnv, UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import { BOOT_SCRIPT, BOOT_SCRIPT_HASH } from './boot.ts';
import { bootScriptPlugin, withBootScript } from './boot-plugin.ts';
import { buildFixture } from './fixture.ts';
import { sha256 } from './hash.ts';

const ENTRY = '<script type="module" crossorigin src="/assets/index-Ab12Cd34.js"></script>';
const THEME = "<script>try{document.documentElement.dataset.theme='dark'}catch(e){}</script>";
const page = (head: string) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n${head}\n</head>\n<body><div id="root"></div></body>\n</html>\n`;

describe('BOOT_SCRIPT', () => {
  it('reads the entry from its own data attribute and creates the module script (ADR-0045 §3)', () => {
    expect(BOOT_SCRIPT).toContain('document.currentScript');
    expect(BOOT_SCRIPT).toContain('dataset.entry');
    expect(BOOT_SCRIPT).toContain("type='module'");
    expect(BOOT_SCRIPT).not.toContain('import(');
    expect(BOOT_SCRIPT).not.toMatch(/\n/);
  });

  it('BOOT_SCRIPT_HASH is the SHA-256 of BOOT_SCRIPT, the value the CSP carries', () => {
    const digest = createHash('sha256').update(BOOT_SCRIPT, 'utf8').digest('base64');
    expect(BOOT_SCRIPT_HASH).toBe(`sha256-${digest}`);
    expect(sha256(BOOT_SCRIPT)).toBe(BOOT_SCRIPT_HASH);
  });

  it('sha256 gives the CSP hash expression of a text', () => {
    expect(sha256('')).toBe('sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
  });
});

describe('withBootScript', () => {
  it('replaces the one module script with the inline boot carrying data-entry', () => {
    const out = withBootScript(page(ENTRY), page(''));
    expect(out).toContain(`<script data-entry="/assets/index-Ab12Cd34.js">${BOOT_SCRIPT}</script>`);
    expect(out).not.toContain('type="module"');
  });

  it('keeps an inline script that the source document holds (the theme script)', () => {
    const out = withBootScript(page(`${THEME}\n${ENTRY}`), page(THEME));
    expect(out).toContain(THEME);
    expect(out).toContain(`>${BOOT_SCRIPT}</script>`);
  });

  it('refuses a second inline script that the source document does not hold', () => {
    expect(() => withBootScript(page(`${ENTRY}\n<script>alert(1)</script>`), page(''))).toThrow(
      /inline script .*alert\(1\)/,
    );
  });

  it('refuses a document without exactly one module entry', () => {
    expect(() => withBootScript(page(''), page(''))).toThrow(/one module script/);
    expect(() => withBootScript(page(`${ENTRY}\n${ENTRY}`), page(''))).toThrow(/one module script/);
  });
});

describe('bootScriptPlugin', () => {
  it('runs after the other html hooks, in the client build only', () => {
    const plugin = bootScriptPlugin();
    expect(plugin.transformIndexHtml).toMatchObject({ order: 'post' });
    const apply = plugin.apply as (config: UserConfig, env: ConfigEnv) => boolean;
    expect(apply({}, { command: 'build', mode: 'production' })).toBe(true);
    expect(apply({}, { command: 'build', mode: 'production', isSsrBuild: true })).toBe(false);
    expect(apply({}, { command: 'serve', mode: 'development' })).toBe(false);
  });

  it('rewrites a built document: the entry becomes the boot and the theme script stays', async () => {
    const html = await buildFixture(
      {
        'index.html': page(`${THEME}\n<script type="module" src="/entry.ts"></script>`),
        'entry.ts': 'document.title = "built";\n',
      },
      [bootScriptPlugin()],
    );
    expect(html).toMatch(/<script data-entry="\/assets\/index-[^"]+\.js">/);
    expect(html).toContain(`>${BOOT_SCRIPT}</script>`);
    expect(html).toContain(THEME);
    expect(html.match(/<script/g)).toHaveLength(2);
  });
});

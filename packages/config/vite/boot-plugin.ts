import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { BOOT_SCRIPT } from './boot.ts';

type Script = { tag: string; attrs: string; text: string };

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
const scripts = (html: string): Script[] =>
  [...html.matchAll(SCRIPT)].map((match) => ({ tag: match[0], attrs: match[1] ?? '', text: match[2] ?? '' }));
const hasSrc = (script: Script) => /\bsrc="/.test(script.attrs);
const isModuleEntry = (script: Script) => hasSrc(script) && /\btype="module"/.test(script.attrs);
const isInline = (script: Script) => !hasSrc(script);
const excerpt = (text: string) => (text.length > 80 ? `${text.slice(0, 80)}…` : text).trim();

/**
 * The built document with its one module entry replaced by the inline boot script, the entry URL in
 * `data-entry` (ADR-0045 §3). Every inline script left must be one the source document holds (the
 * theme script, hashed in the CSP as well): one that Vite or another plugin added would be blocked
 * by the policy, so the build fails instead.
 */
export function withBootScript(html: string, source: string): string {
  const all = scripts(html);
  const entries = all.filter(isModuleEntry);
  const entry = entries[0];
  if (entry === undefined || entries.length !== 1) {
    throw new Error(`expected one module script entry in the built document, found ${entries.length}`);
  }
  const authored = new Set(
    scripts(source)
      .filter(isInline)
      .map((script) => script.text.trim()),
  );
  for (const script of all.filter(isInline)) {
    if (!authored.has(script.text.trim())) {
      throw new Error(
        `an inline script the source document does not hold would be blocked by the CSP: ${excerpt(script.text)}`,
      );
    }
  }
  const src = /\bsrc="([^"]*)"/.exec(entry.attrs)?.[1] ?? '';
  return html.replace(entry.tag, `<script data-entry="${src}">${BOOT_SCRIPT}</script>`);
}

/** Replaces the module entry of the built document with the fixed-text boot; client build only. */
export function bootScriptPlugin(): Plugin {
  return {
    name: 'poc:boot-script',
    apply: (_config, { command, isSsrBuild }) => command === 'build' && isSsrBuild !== true,
    transformIndexHtml: {
      order: 'post',
      handler: (html, ctx) => withBootScript(html, readFileSync(ctx.filename, 'utf8')),
    },
  };
}

// Every rules file under .claude/rules opens with the frontmatter the next-checkpoint skill reads:
// the paths it applies to, the review tier, the security flag, the empirical proof and the documents
// to read first. A rewrite that drops the frontmatter leaves the path unscoped and untiered; this test
// reads the repository's real files so that it fails on the branch that lost one.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RULES_DIR = fileURLToPath(new URL('../../.claude/rules/', import.meta.url));
const REQUIRED = ['paths', 'tier', 'security', 'proof', 'docs'] as const;

type Frontmatter = Record<string, string>;

/** The top-level `key: value` lines between the opening and the closing `---`, or null without them. */
function frontmatter(text: string): Frontmatter | null {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end === -1) return null;
  const fields: Frontmatter = {};
  for (const line of lines.slice(1, end)) {
    const match = /^([a-z]+):\s*(.*)$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) fields[match[1]] = match[2];
  }
  return fields;
}

const files = readdirSync(RULES_DIR).filter((name) => name.endsWith('.md'));

describe('.claude/rules/*.md', () => {
  it('has at least one rules file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s opens with frontmatter naming paths, tier, security, proof and docs', (name) => {
    const fields = frontmatter(readFileSync(join(RULES_DIR, name), 'utf8'));
    expect(fields, `${name} has no frontmatter`).not.toBeNull();
    for (const key of REQUIRED) expect(fields, `${name} lacks ${key}`).toHaveProperty(key);
    expect(fields?.tier, `${name} tier`).toMatch(/^[012]$/);
    expect(fields?.security, `${name} security`).toMatch(/^(?:true|false)$/);
    expect(fields?.proof, `${name} proof`).not.toBe('');
  });
});

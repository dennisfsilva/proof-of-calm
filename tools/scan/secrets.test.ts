import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanDirectory, scanText, serverVariableNames } from './secrets.ts';

describe('serverVariableNames', () => {
  it('reads the server-side names of .env.example, the commented ones included', () => {
    const names = serverVariableNames(readFileSync(new URL('../../.env.example', import.meta.url), 'utf8'));
    expect(names).toEqual(
      expect.arrayContaining(['COINGECKO_API_KEY', 'UPSTASH_REDIS_REST_TOKEN', 'SUPABASE_SECRET_KEY']),
    );
    expect(names.some((name) => name.startsWith('VITE_'))).toBe(false);
  });
});

describe('scanText', () => {
  const secrets = [
    { name: 'COINGECKO_API_KEY', value: 'demo-key-1234567890' },
    { name: 'SHORT', value: 'abc' },
  ];

  it('finds a server-side value and names the variable, never the value', () => {
    const findings = scanText('chunks/a.js', 'const k="demo-key-1234567890";', secrets);
    expect(findings).toEqual([{ file: 'chunks/a.js', what: 'the value of COINGECKO_API_KEY' }]);
    expect(JSON.stringify(findings)).not.toContain('demo-key');
  });

  it('ignores values too short to mean anything', () => {
    expect(scanText('a.js', 'abc abc abc', secrets)).toEqual([]);
  });

  it.each([
    ['a Supabase secret key', 'x="sb_secret_AbCdEf123456_xyz"'],
    ['a CoinGecko API key', 'headers:{"x-cg-demo-api-key":"CG-abcdefghijklmnopqrstuvwx"}'],
    ['a Resend API key', 'key:"re_AbCd1234_EfGh5678IjKl9012"'],
    ['a private key', '"-----BEGIN PRIVATE KEY-----\\nMII"'],
    ['a GitHub token', `t="ghp_${'a'.repeat(36)}"`],
    ['an AWS access key', 'id="AKIAABCDEFGHIJKLMNOP"'],
  ])('finds %s by its shape', (what, text) => {
    expect(scanText('a.js', text, [])).toEqual([{ file: 'a.js', what }]);
  });

  it('leaves ordinary minified code alone', () => {
    const code = 'function re_render(e){return e.CG?e:null}const sb_session=1;var AKIA=2;';
    expect(scanText('a.js', code, [])).toEqual([]);
  });
});

describe('scanDirectory', () => {
  let directory = '';
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('reads every file below the directory', () => {
    directory = mkdtempSync(join(tmpdir(), 'bundle-scan-'));
    mkdirSync(join(directory, 'chunks', 'app'), { recursive: true });
    writeFileSync(join(directory, 'chunks', 'app', 'page.js'), 'fetch("/api/prices")');
    writeFileSync(join(directory, 'chunks', 'leak.js'), 'const t="token-value-123456";');
    const result = scanDirectory(directory, ['UPSTASH_REDIS_REST_TOKEN', 'UNSET'], {
      UPSTASH_REDIS_REST_TOKEN: 'token-value-123456',
    });
    expect(result.files).toBe(2);
    expect(result.findings).toEqual([
      { file: join('chunks', 'leak.js'), what: 'the value of UPSTASH_REDIS_REST_TOKEN' },
    ]);
  });
});

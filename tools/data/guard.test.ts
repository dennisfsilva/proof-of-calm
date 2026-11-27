// The store never lives in this repository (ADR-0036), however its path is written: as it is, through a
// junction or directory symlink, and through Windows' loopback admin share, which realpath leaves as it is.
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { refuseInsideRepository } from './guard.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const INSIDE = '--store is inside this repository';

// A scratch folder outside the repository, and a fresh one under its gitignored node_modules.
function withFolders(test: (outside: string, inside: string) => void): void {
  const outside = mkdtempSync(join(tmpdir(), 'daily-guard-'));
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  const inside = mkdtempSync(join(root, 'node_modules', '.daily-guard-'));
  try {
    test(outside, inside);
  } finally {
    rmSync(inside, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
}

describe('refuseInsideRepository', () => {
  it('refuses the repository itself and a folder inside it as written', () => {
    expect(() => refuseInsideRepository(root)).toThrow(INSIDE);
    withFolders((_, inside) => {
      expect(() => refuseInsideRepository(inside)).toThrow(INSIDE);
      expect(() => refuseInsideRepository(join(inside, 'not', 'yet'))).toThrow(INSIDE);
      expect(() => refuseInsideRepository(join(inside, '..', '..', 'tools'))).toThrow(INSIDE);
    });
  });

  it('refuses a folder reached through a junction or directory symlink', () => {
    withFolders((outside, inside) => {
      const link = join(outside, 'link');
      symlinkSync(inside, link, 'junction');
      try {
        expect(() => refuseInsideRepository(link)).toThrow(INSIDE);
        expect(() => refuseInsideRepository(join(link, 'store'))).toThrow(INSIDE);
      } finally {
        // The link itself goes, never what it points at.
        unlinkSync(link);
      }
      expect(existsSync(inside)).toBe(true);
    });
  });

  it.runIf(process.platform === 'win32')('refuses a folder reached through the loopback admin share', (context) => {
    const { root: drive } = parse(root);
    const share = `\\\\localhost\\${drive.slice(0, 1)}$\\`;
    if (!existsSync(share)) context.skip();
    withFolders((outside, inside) => {
      const unc = share + inside.slice(drive.length);
      expect(() => refuseInsideRepository(unc)).toThrow(INSIDE);
      expect(() => refuseInsideRepository(join(unc, 'store'))).toThrow(INSIDE);
      // The share itself is no reason to refuse: a folder outside the repository on it passes.
      const { root: tempDrive } = parse(outside);
      const away = `\\\\localhost\\${tempDrive.slice(0, 1)}$\\${outside.slice(tempDrive.length)}`;
      if (existsSync(away)) expect(() => refuseInsideRepository(away)).not.toThrow();
    });
  });

  it('lets a folder outside the repository pass, existing or not', () => {
    withFolders((outside) => {
      expect(() => refuseInsideRepository(outside)).not.toThrow();
      expect(() => refuseInsideRepository(join(outside, 'not', 'yet'))).not.toThrow();
      const file = join(outside, 'file');
      writeFileSync(file, '');
      expect(() => refuseInsideRepository(file)).not.toThrow();
    });
  });
});

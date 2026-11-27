// The store never lives in this repository (ADR-0036), however its path is written: as it is, through a
// junction or directory symlink, through Windows' loopback admin share, which realpath leaves as it is,
// and inside any working tree of the repository: the main one or a linked worktree.
import { execFileSync } from 'node:child_process';
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

// A linked worktree of this repository with no files checked out, outside it, removed afterwards with
// its record (git runs here, in the test; the guard itself reads the records as files).
function withWorktree(test: (worktree: string) => void): void {
  const parent = mkdtempSync(join(tmpdir(), 'daily-guard-wt-'));
  const worktree = join(parent, 'wt');
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
  git('worktree', 'add', '--no-checkout', '--detach', worktree, 'HEAD');
  try {
    test(worktree);
  } finally {
    if (existsSync(worktree)) git('worktree', 'remove', '--force', worktree);
    git('worktree', 'prune');
    rmSync(parent, { recursive: true, force: true });
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

  it('refuses a folder inside another working tree of the repository, from either side', () => {
    withWorktree((worktree) => {
      withFolders((outside, inside) => {
        expect(() => refuseInsideRepository(worktree)).toThrow(INSIDE);
        expect(() => refuseInsideRepository(join(worktree, 'closes-store'))).toThrow(INSIDE);
        expect(() => refuseInsideRepository(inside, worktree)).toThrow(INSIDE);
        expect(() => refuseInsideRepository(root, worktree)).toThrow(INSIDE);
        expect(() => refuseInsideRepository(outside)).not.toThrow();
        expect(() => refuseInsideRepository(outside, worktree)).not.toThrow();
      });
    });
  });

  it('lets an outside folder pass while a listed worktree has lost its folder', () => {
    withWorktree((worktree) => {
      rmSync(worktree, { recursive: true, force: true });
      withFolders((outside, inside) => {
        expect(() => refuseInsideRepository(outside)).not.toThrow();
        expect(() => refuseInsideRepository(inside)).toThrow(INSIDE);
      });
    });
  });

  it('refuses when the checkout has no readable git records', () => {
    withFolders((outside) => {
      expect(() => refuseInsideRepository(join(outside, 'store'), join(outside, 'missing'))).toThrow(INSIDE);
      const plain = join(outside, 'plain');
      mkdirSync(plain);
      const away = mkdtempSync(join(tmpdir(), 'daily-guard-away-'));
      try {
        expect(() => refuseInsideRepository(away, plain)).toThrow(INSIDE);
      } finally {
        rmSync(away, { recursive: true, force: true });
      }
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

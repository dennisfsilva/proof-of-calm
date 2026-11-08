// The ADR half of the docs lint (tools/lint/docs.ts): every `ADR-NNNN` resolves to a file, the index
// lists every file with the Status its first line says, and an accepted ADR changes only below its
// Corrections, Deviations or Readings heading (docs/ADR/README.md).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Check = 'path' | 'command' | 'adr' | 'index' | 'planned' | 'literal' | 'adr-edit';
export type Finding = { file: string; line: number; check: Check; message: string };
/** Runs git with these arguments and returns what it prints; throws when git fails. */
export type Git = (args: readonly string[]) => string;
/** The ADR folder and its files by number: "0001" → "docs/ADR/0001-title.md". */
export type Adrs = { folder: string; files: Map<string, string> };

export const statusWord = (text: string) => /^Status:\s*([A-Za-z]+)/m.exec(text)?.[1] ?? '';

export function lintAdrReferences(doc: string, text: string, adrs: Adrs, findings: Finding[]): void {
  text.split(/\r?\n/).forEach((content, index) => {
    for (const match of content.matchAll(/ADR-(\d{4})/g)) {
      if (!adrs.files.has(match[1] ?? ''))
        findings.push({
          file: doc,
          line: index + 1,
          check: 'adr',
          message: `ADR-${match[1]} has no file in ${adrs.folder}`,
        });
    }
  });
}

/** The trimmed cells of a Markdown table row, or null for any other line (the `|---|` rule included). */
export function tableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|') || /^\|[\s|:-]*\|$/.test(trimmed)) return null;
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

export function lintAdrIndex(root: string, adrs: Adrs, findings: Finding[]): void {
  const index = `${adrs.folder}/README.md`;
  const path = join(root, index);
  if (!existsSync(path)) return;
  const listed = new Map<string, { line: number; status: string }>();
  let statusColumn = -1; // from the header row (`| # | Title | Status | Applies to |`); -1 means the last cell
  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .forEach((content, i) => {
      const cells = tableCells(content);
      if (cells === null) return;
      if (cells.includes('Status')) {
        statusColumn = cells.indexOf('Status');
        return;
      }
      const number = cells[0];
      const cell = cells.at(statusColumn === -1 ? -1 : statusColumn) ?? '';
      const status = /^([A-Za-z]+)/.exec(cell)?.[1];
      if (number && /^\d{4}$/.test(number) && status) listed.set(number, { line: i + 1, status });
    });
  for (const [number, file] of adrs.files) {
    const row = listed.get(number);
    if (!row) {
      findings.push({ file: index, line: 1, check: 'index', message: `${file} is not in the table` });
      continue;
    }
    const status = statusWord(readFileSync(join(root, file), 'utf8'));
    if (status !== row.status) {
      findings.push({
        file: index,
        line: row.line,
        check: 'index',
        message: `status "${row.status}" but ${file} says "${status}"`,
      });
    }
  }
  for (const [number, row] of listed) {
    if (!adrs.files.has(number)) {
      findings.push({
        file: index,
        line: row.line,
        check: 'index',
        message: `ADR-${number} is listed but has no file`,
      });
    }
  }
}

const HISTORY_HEADING = /^## (?:Corrections|Deviations|Readings)\b/m;

/** The part of an ADR that stays fixed once accepted: everything above its first history heading, minus the Status line. */
export function fixedPart(text: string): string {
  const normalised = text.replaceAll('\r\n', '\n');
  const heading = HISTORY_HEADING.exec(normalised);
  const above = heading ? normalised.slice(0, heading.index) : normalised;
  return above
    .split('\n')
    .filter((line) => !line.startsWith('Status:'))
    .join('\n')
    .trimEnd();
}

/**
 * Compares an ADR that origin/main holds as Accepted with its copy on the branch; a file new on the
 * branch passes, and so does one main holds as Proposed. The branch's own Status word decides nothing,
 * so a branch cannot free the text by changing the status.
 */
export function lintAdrEdits(doc: string, text: string, run: Git, findings: Finding[]): void {
  let previous: string;
  try {
    previous = run(['show', `origin/main:${doc}`]);
  } catch {
    return;
  }
  if (statusWord(previous) !== 'Accepted') return;
  if (fixedPart(previous) !== fixedPart(text)) {
    findings.push({
      file: doc,
      line: 1,
      check: 'adr-edit',
      message:
        'an accepted ADR changed above its Corrections, Deviations or Readings heading; record the change in a dated Corrections section (docs/ADR/README.md)',
    });
  }
}

export function hasOriginMain(run: Git): boolean {
  try {
    run(['rev-parse', '--verify', '--quiet', 'origin/main^{commit}']);
    return true;
  } catch {
    return false;
  }
}

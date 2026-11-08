// security.txt (RFC 9116) checked in CI (docs/LEGAL.md §5, docs/SECURITY.md §4): the fields it must
// carry, and an `Expires` that is neither close nor more than a year away. CI fails 30 days before
// the date, so it is renewed while the file is still valid.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DAY_MS = 86_400_000;
/** Fail this many days before `Expires`. */
export const RENEW_DAYS = 30;
/** RFC 9116 §2.5.5: less than a year into the future. */
const MAX_DAYS = 366;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** The fields of the file, in order, each with its value; comments and blank lines are skipped. */
function fields(text: string): [string, string][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => {
      const colon = line.indexOf(':');
      return colon === -1
        ? [line.trim().toLowerCase(), '']
        : [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()];
    });
}

/** The problems with a security.txt on `now`; an empty list when it is fine. */
export function checkSecurityTxt(text: string, now: Date): string[] {
  const all = fields(text);
  const values = (name: string) => all.filter(([field]) => field === name).map(([, value]) => value);
  const problems: string[] = [];

  const contacts = values('contact');
  if (contacts.length === 0) problems.push('Contact is missing.');
  for (const contact of contacts) {
    if (!/^(mailto:|https:\/\/|tel:)/.test(contact))
      problems.push(`Contact "${contact}" is not a mailto:, https: or tel: URI.`);
  }
  for (const canonical of values('canonical')) {
    if (!/^https:\/\/[^/]+\/\.well-known\/security\.txt$/.test(canonical)) {
      problems.push(`Canonical "${canonical}" is not this file's https URL.`);
    }
  }

  const expires = values('expires');
  if (expires.length !== 1) {
    problems.push(`Expires appears ${expires.length} times; it must appear once.`);
    return problems;
  }
  const [value = ''] = expires;
  const at = Date.parse(value);
  if (!RFC3339.test(value) || Number.isNaN(at)) {
    problems.push(`Expires "${value}" is not an RFC 3339 date and time.`);
    return problems;
  }
  const days = Math.floor((at - now.getTime()) / DAY_MS);
  if (days < RENEW_DAYS) {
    problems.push(`Expires ${value} is ${days} days away; set a new date less than a year ahead.`);
  } else if (days > MAX_DAYS) {
    problems.push(`Expires ${value} is more than a year away (RFC 9116 §2.5.5).`);
  }
  return problems;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const file = process.argv[2] ?? 'apps/web/public/.well-known/security.txt';
  const problems = checkSecurityTxt(readFileSync(file, 'utf8'), new Date());
  for (const problem of problems) console.error(`${file}: ${problem}`);
  if (problems.length === 0) console.log(`${file}: valid, renew before ${RENEW_DAYS} days remain.`);
  process.exit(problems.length > 0 ? 1 : 0);
}

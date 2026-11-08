// What a content check reports. Apart from validate.ts, so that a check it calls can import these without a
// cycle; dependency-cruiser counts type imports too.
import { type Finding, findBanned } from './style/banned.ts';

export type Problem = { readonly path: string; readonly code: string; readonly detail: string };

type Issue = { readonly path: readonly PropertyKey[]; readonly message: string };

export const schemaProblems = (path: string, issues: readonly Issue[]): Problem[] =>
  issues.map((issue) => {
    const field = issue.path.map(String).join('.');
    return { path, code: 'schema', detail: field === '' ? issue.message : `${field}: ${issue.message}` };
  });

export const findingProblems = (path: string, field: string, findings: readonly Finding[]): Problem[] =>
  findings.map((finding) => ({
    path,
    code: `banned-${finding.rule}`,
    detail: `${field}: "${finding.match}" is on the ban list; reword it (docs/CONTENT-STYLE.md §2)`,
  }));

export const bannedProblems = (path: string, field: string, text: string): Problem[] =>
  findingProblems(path, field, findBanned(text));

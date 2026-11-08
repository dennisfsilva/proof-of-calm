// The front matter of a Learn module (docs/EDUCATION.md §10, ADR-0048): flat strings that this schema checks
// and converts. The loader computes `words` and `readingMinutes`, so an author never types them.
import * as z from 'zod/mini';
import { CalendarDateSchema, ReviewerSchema } from './common.ts';

const SLUGS = [
  'start-here',
  'risk-honestly',
  'cycles',
  'taxes-where-you-live',
  'noise',
  'when-the-market-drops',
  'simulator',
] as const;
const CHARTS = ['none', 'drawdowns-bar', 'halvings-line', 'drawdown-scale', 'simulator'] as const;

const required = (name: string) => z.string(`Add ${name}`).check(z.minLength(1, `Add ${name}`));
const dated = (name: string) => z.pipe(z.string(`Add ${name} as YYYY-MM-DD`), CalendarDateSchema);
const commaSeparated = (value: string) =>
  value
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key !== '');

export const ModuleFrontMatterSchema = z.strictObject(
  {
    slug: z.enum(SLUGS, 'Use one of the 7 slugs in docs/EDUCATION.md §10'),
    title: required('a title'),
    idea: required('an idea').check(z.maxLength(120, 'Keep the idea to 120 characters')),
    caveat: required('a caveat').check(z.maxLength(240, 'Keep the caveat to 240 characters')),
    chart: z.enum(CHARTS, 'Use none or one of the charts in docs/EDUCATION.md §10'),
    /** Keys of facts; an empty line is no facts, which Start here needs. */
    facts: z.pipe(z.string('Add a facts line, empty when the module cites none'), z.transform(commaSeparated)),
    lastReviewed: dated('lastReviewed'),
    nextReviewDue: dated('nextReviewDue'),
    reviewedBy: z.enum(ReviewerSchema.options, 'Use owner or agent-draft'),
  },
  {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? `Remove ${issue.keys.join(', ')}: only the keys an author types belong here (docs/EDUCATION.md §10)`
        : undefined,
  },
);
export type ModuleFrontMatter = z.infer<typeof ModuleFrontMatterSchema>;

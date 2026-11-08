import en from '../../messages/en.json';

// One object per locale, merged from the feature message files by `pnpm --filter @proofofcalm/tools
// messages` (ADR-0023); the feature name is the namespace. English is the only locale until M2.
export const messages = en;

export type Messages = typeof messages;
